import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tổng quan | Kurabe QAQC',
  description: 'Tổng quan kỳ đánh giá QAQC',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
