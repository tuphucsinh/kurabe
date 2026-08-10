import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nhân viên | Kurabe QAQC',
  description: 'Danh sách nhân viên QAQC',
};

export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
