import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chi tiết Đánh giá | Kurabe QAQC',
  description: 'Chi tiết phiếu đánh giá',
};

export default function EvaluationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
