import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import QueryProvider from "@/providers/query-provider";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmDialogProvider } from "@/components/ui/ConfirmDialog";

const inter = Inter({
  variable: "--font-inter",
  // Subset "vietnamese" của Google đã chứa đủ đ/ơ/ư (U+0110-0111, U+01A0-01A1,
  // U+01AF-01B0) VÀ toàn bộ dấu tổ hợp (U+1EA0-1EF9) — không cần latin-ext
  // (slice 84KB chỉ thêm ư/ơ/đ). Kết quả: chữ Việt render nhất quán bằng Inter
  // thay vì trộn font hệ thống, đồng thời bớt 1 slice lớn khỏi lần tải đầu.
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kurabe QAQC Evaluation",
  description: "Webapp đánh giá nhân viên QAQC - Kurabe",
};

// A request-scoped CSP nonce requires dynamic rendering in Next.js 16.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-surface" suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              <ConfirmDialogProvider>
                <AppLayout>
                  {children}
                </AppLayout>
              </ConfirmDialogProvider>
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
