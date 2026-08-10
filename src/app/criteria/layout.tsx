import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tiêu chuẩn | Kurabe QAQC',
  description: 'Danh sách tiêu chuẩn đánh giá',
};

export default function CriteriaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
