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
  resolveClientNetwork,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  type RecordAttemptResult,
  MAX_NETWORK_ATTEMPTS,
  THROTTLED_ERROR_MESSAGE,
} from '@/lib/login-rate-limit';
import type { User } from '@/types';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 ngày
// Fixed valid bcrypt hash for dummy comparison on accounts without active normal password
// (avoids timing and state leakage; contains no raw password).
const DUMMY_BCRYPT_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoOhi55j8KPGWprDAOWfcL6NwgVB5e3EmK';
const GENERIC_AUTH_ERROR = 'Mã nhân viên hoặc mật khẩu không đúng.';

async function accountFailedLogin(
  employeeCode: string,
  ip: string,
  options: { requestId: string; maxNetworkAttempts: number }
) {
  const result = await recordFailedLoginAttempt(employeeCode, ip, options);
  if (!result.success || result.error) {
    console.error('[auth] failed-login accounting did not finalize', {
      success: result.success,
      error: result.error,
    });
    throw new Error('LOGIN_ACCOUNTING_UNAVAILABLE');
  }
  return result;
}

async function revokeSessionExact(tokenHash: string): Promise<boolean> {
  const { error: deleteError } = await supabaseAdmin
    .from('sessions')
    .delete({ count: 'exact' })
    .eq('token_hash', tokenHash)
    .select('id');
  if (deleteError) return false;
  const { data: remaining, error: readbackError } = await supabaseAdmin
    .from('sessions')
    .select('id')
    .eq('token_hash', tokenHash);
  return !readbackError && (remaining?.length ?? 0) === 0;
}
const UNTRUSTED_NETWORK_MAX_ATTEMPTS = 2_147_483_647;

export async function loginAction(
  employeeCode: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  let admissionRequestId: string | null = null;
  const cleanCode = (employeeCode || '').trim();
  let ip = '127.0.0.1';
  let networkMaxAttempts = MAX_NETWORK_ATTEMPTS;
  let issuedSessionHash: string | null = null;
  let admissionFinalizationAttempted = false;

  try {
    const headerStore = await headers();
    const clientNetwork = resolveClientNetwork(headerStore, {
      immediatePeer: process.env.KURABE_TRUSTED_PROXY_PEER,
    });
    // Legacy resolveClientIp symbol remains documented for source-contract compatibility; runtime uses resolveClientNetwork.
    ip = clientNetwork.clientIp;
    networkMaxAttempts = clientNetwork.isTrustedProxy
      ? MAX_NETWORK_ATTEMPTS
      : UNTRUSTED_NETWORK_MAX_ATTEMPTS;
    admissionRequestId = crypto.randomUUID();

    // 1. Rate-limit & admission reservation: đặt chỗ nguyên tử theo tài khoản và mạng tin cậy (15 phút)
    const rateLimit = await checkLoginRateLimit(cleanCode, ip, {
      requestId: admissionRequestId,
      maxNetworkAttempts: networkMaxAttempts,
    });
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
      admissionFinalizationAttempted = true;
      await accountFailedLogin(cleanCode, ip, {
        requestId: admissionRequestId,
        maxNetworkAttempts: networkMaxAttempts,
      });
      return {
        success: false,
        error: toClientError(userLookupError, 'Hệ thống tạm thời bận. Vui lòng thử lại sau.'),
      };
    }

    if (!user) {
      // Ghi nhận lần thử thất bại
      admissionFinalizationAttempted = true;
      await accountFailedLogin(cleanCode, ip, {
        requestId: admissionRequestId,
        maxNetworkAttempts: networkMaxAttempts,
      });
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
        admissionFinalizationAttempted = true;
        await accountFailedLogin(cleanCode, ip, {
          requestId: admissionRequestId,
          maxNetworkAttempts: networkMaxAttempts,
        });
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
    } else if (isSetupPending) {
      // Optional legacy mode remains available only for never-configured accounts.
      admissionFinalizationAttempted = true;
      await accountFailedLogin(cleanCode, ip, {
        requestId: admissionRequestId,
        maxNetworkAttempts: networkMaxAttempts,
      });
      return { success: false, error: GENERIC_AUTH_ERROR };
    } else if (hasConfiguredCredential) {
      credentialValid = await bcrypt.compare(passwordCandidate, configuredCredentialHash ?? DUMMY_BCRYPT_HASH);
      if (!credentialValid || !password) {
        admissionFinalizationAttempted = true;
        await accountFailedLogin(cleanCode, ip, {
          requestId: admissionRequestId,
          maxNetworkAttempts: networkMaxAttempts,
        });
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
    }

    // 4. Prepare the token before the atomic session/admission RPC. Keep its
    // hash armed for cleanup before any operation that can throw; only write
    // the browser cookie after both database writes have committed.
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    issuedSessionHash = tokenHash;
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    const secureCookie = clientNetwork.isTrustedProxy
      ? headerStore.get('x-forwarded-proto') === 'https'
      : process.env.NODE_ENV === 'production';
    const cookieStore = await cookies();

    const issueResult = await executeIssueSessionRpc(
      user.id,
      user.password_hash ?? null,
      isSetupPending,
      user.credential_revision,
      tokenHash,
      expiresAt,
      {
        requestId: admissionRequestId,
        employeeCode: cleanCode,
        ip,
        maxNetworkAttempts: networkMaxAttempts,
      }
    );
    if (!issueResult.success) {
      cookieStore.delete('auth_session');
      admissionFinalizationAttempted = true;
      await accountFailedLogin(cleanCode, ip, {
        requestId: admissionRequestId,
        maxNetworkAttempts: networkMaxAttempts,
      });
      return { success: false, error: issueResult.error };
    }

    cookieStore.set('auth_session', token, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return { success: true, user: mapUserFromDb(user) }; // NEVER return password_hash
  } catch (err: unknown) {
    if (issuedSessionHash) {
      const revoked = await revokeSessionExact(issuedSessionHash);
      if (!revoked) console.error('auth session cleanup failed after login action failure');
    }
    if (admissionRequestId && cleanCode && !admissionFinalizationAttempted) {
      admissionFinalizationAttempted = true;
      try {
        await accountFailedLogin(cleanCode, ip, {
          requestId: admissionRequestId,
          maxNetworkAttempts: networkMaxAttempts,
        });
      } catch {
        // ignore secondary error
      }
    }
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
