import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface PasswordSeedFailure {
  id: string;
  reason: string;
}

export interface PasswordSeedResult {
  seeded: string[];
  failed: PasswordSeedFailure[];
}

/**
 * Seeds default passwords for newly created users where password_hash IS NULL.
 * The default password is set to the user's employee_code.
 *
 * Invariants:
 * - Only modifies rows where password_hash IS NULL.
 * - Skips and records failure if employee_code is null/empty after trim (fail-closed).
 * - Updates password_hash (bcrypt cost 10), password_setup_required=false, credential_revision=(current ?? 0) + 1.
 * - Never throws out of this function; errors are captured in failed[].
 * - Never logs or reveals credential/hash values.
 */
export async function seedDefaultPasswords(
  userIds: string[]
): Promise<PasswordSeedResult> {
  const seeded: string[] = [];
  const failed: PasswordSeedFailure[] = [];

  if (!userIds || userIds.length === 0) {
    return { seeded, failed };
  }

  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { seeded, failed };
  }

  try {
    const { data: rows, error: selectError } = await supabaseAdmin
      .from('users')
      .select('id, employee_code, password_hash, credential_revision')
      .in('id', uniqueIds)
      .is('password_hash', null);

    if (selectError) {
      return {
        seeded: [],
        failed: uniqueIds.map((id) => ({
          id,
          reason: selectError.message || 'Lỗi truy vấn cơ sở dữ liệu',
        })),
      };
    }

    if (!rows || rows.length === 0) {
      return { seeded, failed };
    }

    for (const row of rows) {
      const code = typeof row.employee_code === 'string' ? row.employee_code.trim() : '';
      if (!code) {
        failed.push({ id: row.id, reason: 'empty employee_code' });
        continue;
      }

      try {
        const hash = await bcrypt.hash(code, 10);
        const currentRevision = typeof row.credential_revision === 'number' ? row.credential_revision : 0;
        const nextRevision = currentRevision + 1;

        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({
            password_hash: hash,
            password_setup_required: false,
            credential_revision: nextRevision,
          })
          .eq('id', row.id);

        if (updateError) {
          failed.push({ id: row.id, reason: updateError.message || 'Cập nhật mật khẩu thất bại' });
        } else {
          seeded.push(row.id);
        }
      } catch (rowError: unknown) {
        failed.push({
          id: row.id,
          reason: rowError instanceof Error ? rowError.message : 'Lỗi không xác định khi tạo mật khẩu mặc định',
        });
      }
    }
  } catch (err: unknown) {
    return {
      seeded,
      failed: uniqueIds.map((id) => ({
        id,
        reason: err instanceof Error ? err.message : 'Lỗi không xác định khi khởi tạo mật khẩu',
      })),
    };
  }

  return { seeded, failed };
}
