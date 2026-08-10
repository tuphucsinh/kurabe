import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Đăng nhập | Kurabe QAQC',
  description: 'Đăng nhập vào hệ thống đánh giá Kurabe QAQC',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
