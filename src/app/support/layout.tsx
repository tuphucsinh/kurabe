import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hỗ trợ | Kurabe QAQC',
  description: 'Hướng dẫn sử dụng và hỗ trợ',
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
