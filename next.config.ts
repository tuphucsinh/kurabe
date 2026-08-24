import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/security-csp";

const cspReportOnly = buildContentSecurityPolicy({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  production: process.env.NODE_ENV === "production",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Cho phép truy cập Next.js dev qua IP LAN (192.168.1.230) — nếu không, dev chặn
  // tài nguyên dev (/ _next/webpack-hmr, chunks) cho host lạ → trang kẹt spinner.
  allowedDevOrigins: ['192.168.1.230'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy-Report-Only',
            value: cspReportOnly,
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
