import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav, SiteTagline } from '@/components/SiteNav';
import './globals.css';

// Dùng system font stack thay vì next/font/google: build không phụ thuộc mạng
// (Docker/CI offline vẫn build được) và không tốn request tới Google Fonts.

// Chạy toàn bộ route trên Edge runtime thay vì Serverless.
// Lý do: gói Vercel Hobby chỉ cho 12 Serverless Function/lần deploy, mà Next 14
// sinh 3 function cho mỗi route (bản thường + .rsc + .prefetch.rsc) -> 4 route đã
// vượt hạn mức. Edge Function không tính vào con số đó.
// An toàn ở đây vì code chỉ dùng `fetch` — không đụng API riêng của Node.
export const runtime = 'edge';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'OilGas Jobs Radar';

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} · Việc làm dầu khí quốc tế`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    'Tổng hợp việc làm dầu khí quốc tế thuộc 4 nhóm ngành: Reservoir, Petroleum, Production và Geoscience & Formation. Cập nhật tự động hằng ngày từ các nhà tuyển dụng và job board lớn.',
  keywords: [
    'oil and gas jobs',
    'reservoir engineer jobs',
    'petroleum engineer jobs',
    'production engineer jobs',
    'geoscience jobs',
    'việc làm dầu khí',
  ],
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} · Việc làm dầu khí quốc tế`,
    description: 'Reservoir · Petroleum · Production · Geoscience & Formation',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen font-sans">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">
                OG
              </span>
              <span className="text-lg font-semibold tracking-tight">{SITE_NAME}</span>
            </Link>
            {/* Cả thanh nav nằm trong Client Component: layout không nhận
                searchParams nên Server Component ở đây không biết `?lang=`.
                Suspense là bắt buộc vì bên trong dùng useSearchParams. */}
            <Suspense fallback={<div className="h-9 w-[260px]" />}>
              <SiteNav
                apiDocsUrl={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/docs`}
              />
            </Suspense>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

        <footer className="mt-16 border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-950">
          <div className="mx-auto max-w-7xl px-4 text-sm text-slate-500">
            <p className="font-medium text-slate-700 dark:text-slate-300">{SITE_NAME}</p>
            <p className="mt-1">
              <Suspense fallback={null}>
                <SiteTagline />
              </Suspense>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
