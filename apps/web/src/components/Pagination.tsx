'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';

interface Props {
  page: number;
  totalPages: number;
  total: number;
  /** Nhận qua prop từ trang cha — component này không tự đọc `?lang=`. */
  lang?: Lang;
}

export function Pagination({ page, totalPages, total, lang = 'vi' }: Props) {
  const tr = t(lang);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const go = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete('page');
    else params.set('page', String(p));
    router.push(`${pathname}?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Hiển thị tối đa 7 nút: 1 … p-1 p p+1 … N
  const pages: (number | '…')[] = [];
  const push = (n: number | '…') => pages.push(n);
  push(1);
  if (page > 3) push('…');
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) push(p);
  if (page < totalPages - 2) push('…');
  if (totalPages > 1) push(totalPages);

  return (
    <nav
      className="mt-8 flex flex-wrap items-center justify-between gap-4"
      aria-label={tr('paginationAria')}
    >
      <p className="text-sm text-slate-500">
        {tr('page')} <strong>{page}</strong> / {totalPages} · {total.toLocaleString('vi-VN')}{' '}
        {tr('jobsWord')}
      </p>
      <div className="flex items-center gap-1">
        {/* Nút chỉ có ký tự ← → nên bắt buộc phải có aria-label: trình đọc màn
            hình đọc mũi tên thành "trái"/"phải" hoặc bỏ qua hẳn. */}
        <button
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label={tr('prevPage')}
          className="btn-ghost px-3 py-1.5"
        >
          ←
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-2 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => go(p)}
              className={cn(
                'min-w-9 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                p === page
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          aria-label={tr('nextPage')}
          className="btn-ghost px-3 py-1.5"
        >
          →
        </button>
      </div>
    </nav>
  );
}
