import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hướng dẫn | Kurabe QAQC',
  description: 'Hướng dẫn sử dụng theo vai trò',
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
