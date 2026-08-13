import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cài đặt | KURABE',
  description: 'Quản lý kỳ đánh giá, nhóm & quyền của hệ thống',
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
