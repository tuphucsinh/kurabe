import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Báo cáo | Kurabe QAQC',
  description: 'Báo cáo và thống kê đánh giá QAQC',
};

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
