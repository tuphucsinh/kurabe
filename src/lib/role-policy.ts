import { Role } from '@/types';

export const ALL_ROLES: Role[] = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'];
export const INDIVIDUAL_ROLES: Role[] = ['Employee', 'Worker'];
export const MANAGEMENT_ROLES: Role[] = ['Manager', 'Leader', 'SubLeader'];
export const LEADER_ASSIGNABLE_ROLES: Role[] = ['SubLeader', 'Employee', 'Worker'];

export const ROLE_LABELS: Record<Role, string> = {
  Manager: 'Manager',
  Leader: 'Leader',
  SubLeader: 'SubLeader',
  Employee: 'Nhân viên',
  Worker: 'Công nhân',
};

export const ROLE_ORDER: Record<string, number> = {
  Leader: 0,
  SubLeader: 1,
  Employee: 2,
  Worker: 3,
  Manager: 4,
};

export function isIndividualRole(role?: Role | string | null): boolean {
  return role === 'Employee' || role === 'Worker';
}

export function isManagementRole(role?: Role | string | null): boolean {
  return role === 'Manager' || role === 'Leader' || role === 'SubLeader';
}

export function canHaveSubLeader(role?: Role | string | null): boolean {
  return isIndividualRole(role);
}

export function roleLabel(role?: Role | string | null): string {
  if (!role) return '';
  return ROLE_LABELS[role as Role] || String(role);
}
