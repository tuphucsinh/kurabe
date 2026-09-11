'use server';

import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import bcrypt from 'bcryptjs';
import { mapUserFromDb } from '@/lib/db/users';
import { toClientError } from '@/lib/errors';
import { isOpaqueSessionToken } from '@/lib/session-token';
import {
  completePasswordSetupCore,
  executeIssueSessionRpc,
  type CompletePasswordSetupResult,
  type ResetPasswordResult,
} from '@/lib/auth-password-setup';
import {
  resolveClientIp,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginAttempts,
  THROTTLED_ERROR_MESSAGE,
} from '@/lib/login-rate-limit';
import type { User } from '@/types';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 ngày
// Fixed valid bcrypt hash for dummy comparison on accounts without active normal password
// (avoids timing and state leakage; contains no raw password).
const DUMMY_BCRYPT_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoOhi55j8KPGWprDAOWfcL6NwgVB5e3EmK';
const GENERIC_AUTH_ERROR = 'Mã nhân viên hoặc mật khẩu không đúng.';

export async function loginAction(
  employeeCode: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const headerStore = await headers();
    const ip = resolveClientIp(headerStore);
    const cleanCode = (employeeCode || '').trim();

    // 1. Rate-limit login: kiểm tra giới hạn thất bại nguyên tử theo tài khoản và mạng tin cậy (15 phút)
    const rateLimit = await checkLoginRateLimit(cleanCode, ip);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: rateLimit.error || THROTTLED_ERROR_MESSAGE,
      };
    }

    // 2. Tìm user theo mã nhân viên
    const { data: user, error: userLookupError } = await supabaseAdmin
      .from('users')
      .select('id, employee_code, name, role, team_id, join_date, avatar_url, created_at, is_active, subleader_id, description, gender, password_hash, password_setup_required, credential_revision')
      .eq('employee_code', cleanCode)
      .eq('is_active', true)
      .maybeSingle();

    if (userLookupError) {
      return {
        success: false,
        error: toClientError(userLookupError, 'Hệ thống tạm thời bận. Vui lòng thử lại sau.'),
      };
    }

    if (!user) {
      // Ghi nhận lần thử thất bại
      await recordFailedLoginAttempt(cleanCode, ip);
      return { success: false, error: GENERIC_AUTH_ERROR };
    }

    // 3. Kiểm tra mật khẩu. NULL,false là tài khoản legacy chưa cấu hình;
    // NULL,true là reset-pending và luôn phải đi qua one-time setup.
    const requirePasswordLogin = process.env.KURABE_REQUIRE_PASSWORD_LOGIN === 'true';
    const isSetupPending = user.password_setup_required === true;
    const configuredCredentialHash = user.password_hash;
    const hasConfiguredCredential = configuredCredentialHash !== null && configuredCredentialHash !== undefined;
    // Historical source contract: !user.password_hash || user.password_setup_required.
    // Only NULL/undefined is legacy-unconfigured; a non-NULL invalid hash must fail closed.
    const passwordHashMissingOrSetupPending = configuredCredentialHash === null
      || configuredCredentialHash === undefined
      || user.password_setup_required === true;
    const passwordCandidate = typeof password === 'string' ? password : '';
    let credentialValid = true;

    if (requirePasswordLogin) {
      const targetHash = passwordHashMissingOrSetupPending
        ? DUMMY_BCRYPT_HASH
        : (configuredCredentialHash ?? DUMMY_BCRYPT_HASH);
      credentialValid = await bcrypt.compare(passwordCandidate, targetHash);
      if (passwordHashMissingOrSetupPending || !credentialValid || !password) {
        await recordFailedLoginAttempt(cleanCode, ip);
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
    } else if (isSetupPending) {
      // Optional legacy mode remains available only for never-configured accounts.
      await recordFailedLoginAttempt(cleanCode, ip);
      return { success: false, error: GENERIC_AUTH_ERROR };
    } else if (hasConfiguredCredential) {
      credentialValid = await bcrypt.compare(passwordCandidate, configuredCredentialHash ?? DUMMY_BCRYPT_HASH);
      if (!credentialValid || !password) {
        await recordFailedLoginAttempt(cleanCode, ip);
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
    }

    // 4. Issue the session under the same user row lock used by reset/change/setup.
    // The RPC rechecks the complete credential snapshot, so a stale proof cannot
    // create a session after a concurrent credential revoke.
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    const issueResult = await executeIssueSessionRpc(
      user.id,
      user.password_hash ?? null,
      isSetupPending,
      user.credential_revision,
      tokenHash,
      expiresAt
    );

    if (!issueResult.success) {
      return { success: false, error: issueResult.error };
    }

    // 5. Đăng nhập thành công -> Xóa attempts cũ của tài khoản
    await clearLoginAttempts(cleanCode);

    // 6. Set cookie auth_session = TOKEN
    const proto = headerStore.get('x-forwarded-proto') || 'http';
    (await cookies()).set('auth_session', token, {
      httpOnly: true,
      secure: proto === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return { success: true, user: mapUserFromDb(user) }; // NEVER return password_hash
  } catch (err: unknown) {
    return {
      success: false,
      error: toClientError(err, 'Lỗi không xác định khi đăng nhập. Vui lòng thử lại.'),
    };
  }
}

export async function logoutAction(): Promise<{ success: boolean; error?: string }> {
  let revokeError: unknown = null;
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;

  try {
    cookieStore = await cookies();
    const token = cookieStore.get('auth_session')?.value;

    if (isOpaqueSessionToken(token)) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const { error } = await supabaseAdmin.from('sessions').delete().eq('token_hash', tokenHash);
      if (error) revokeError = error;
    }
  } catch (error) {
    revokeError = error;
  }

  // Always clear the local cookie, even when server-side revocation failed.
  try {
    (cookieStore || (await cookies())).delete('auth_session');
  } catch (error) {
    if (!revokeError) revokeError = error;
  }

  if (revokeError) {
    return {
      success: false,
      error: toClientError(revokeError, 'Không thể thu hồi phiên đăng nhập trên máy chủ. Cookie cục bộ đã được xóa.'),
    };
  }
  return { success: true };
}

/**
 * Hoàn tất thiết lập mật khẩu mới bằng one-time setup token (unauthenticated).
 */
export async function completePasswordSetup(
  token: string,
  newPassword: string,
  confirmPassword?: string
): Promise<CompletePasswordSetupResult> {
  return completePasswordSetupCore(token, newPassword, confirmPassword);
}

export type { CompletePasswordSetupResult, ResetPasswordResult };
