import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quản lý Nhóm | Kurabe QAQC',
  description: 'Danh sách và thông tin các nhóm trong QAQC',
};

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
