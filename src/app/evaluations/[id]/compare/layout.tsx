import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'So sánh Đánh giá | Kurabe QAQC',
  description: 'So sánh kết quả đánh giá giữa các vòng',
};

export default function EvaluationCompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
