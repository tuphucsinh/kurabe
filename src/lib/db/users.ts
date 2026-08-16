import { User } from '@/types';
import { Tables } from '@/types/database';
import { parseRole } from '@/lib/parsers';

type DbUser = Tables<'users'>;

/**
 * Các cột users an toàn (loại bỏ password_hash).
 * Mọi query user (kể cả admin) PHẢI dùng hằng này thay vì select('*').
 */
export const USER_SELECT =
  'id, employee_code, name, role, team_id, join_date, avatar_url, created_at, is_active, subleader_id, description, gender';

export function mapUserFromDb(dbUser: Omit<DbUser, 'password_hash'> | Partial<DbUser>): User {
  return {
    id: dbUser.id || '',
    employeeCode: dbUser.employee_code || '',
    name: dbUser.name || '',
    role: parseRole(dbUser.role),
    teamId: dbUser.team_id || '',
    joinDate: dbUser.join_date || '',
    avatar: dbUser.avatar_url || undefined,
    subleaderId: dbUser.subleader_id,
    description: dbUser.description,
    gender: dbUser.gender || 'Nữ',
  };
}
