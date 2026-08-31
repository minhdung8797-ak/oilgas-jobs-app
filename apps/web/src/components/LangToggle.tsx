'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Lang } from '@/lib/i18n';

/**
 * Nút chuyển ngôn ngữ, đặt trong thanh điều hướng của layout.
 *
 * Vì sao phải là Client Component: layout của Next.js KHÔNG nhận searchParams
 * (nó không render lại khi query đổi), nên Server Component ở đó không thể biết
 * `?lang=`. Đọc query bằng `useSearchParams` phía client là cách duy nhất giữ
 * nút này hoạt động trên mọi route mà không phải nhét prop qua từng trang.
 *
 * Không dùng `langHref` của lib/i18n vì hàm đó luôn trả về đường dẫn '/';
 * ở đây cần giữ nguyên pathname hiện tại (ví dụ /companies, /jobs/[slug]).
 */
export function LangToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current: Lang = searchParams.get('lang') === 'en' ? 'en' : 'vi';

  const switchTo = (lang: Lang) => {
    const params = new URLSearchParams(searchParams.toString());
    // 'vi' là mặc định nên xoá hẳn tham số thay vì ghi ?lang=vi — URL ngắn hơn
    // và trùng với quy ước của `langHref`.
    if (lang === 'en') params.set('lang', 'en');
    else params.delete('lang');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="ml-1 flex items-center gap-0.5 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
      {(['vi', 'en'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => switchTo(lang)}
          aria-label={lang === 'vi' ? 'Chuyển sang tiếng Việt' : 'Switch to English'}
          aria-pressed={current === lang}
          className={cn(
            'rounded-md px-2 py-1 text-xs font-semibold uppercase transition',
            current === lang
              ? 'bg-brand-600 text-white'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
          )}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
