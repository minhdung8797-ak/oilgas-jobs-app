'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';

/**
 * Toàn bộ thanh điều hướng + nút đổi ngôn ngữ.
 *
 * Vì sao gộp cả nav vào Client Component thay vì chỉ nút đổi ngôn ngữ:
 * layout của Next.js KHÔNG nhận `searchParams` — nó không render lại khi query
 * đổi. Nên Server Component ở layout không có cách nào biết `?lang=`, và hai
 * link "Việc làm" / "Công ty" mãi mãi là tiếng Việt.
 *
 * Gộp vào đây còn sửa một lỗi thứ hai: trước đây bấm "Việc làm" hay "Công ty"
 * sẽ mất `?lang=en` và đẩy người dùng ngược về tiếng Việt.
 *
 * Đây là Client Component nhỏ và không có state riêng, nên chi phí không đáng kể.
 */
export function SiteNav({ apiDocsUrl }: { apiDocsUrl: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lang: Lang = searchParams.get('lang') === 'en' ? 'en' : 'vi';
  const tr = t(lang);
  const suffix = lang === 'en' ? '?lang=en' : '';

  const switchTo = (next: Lang) => {
    const params = new URLSearchParams(searchParams.toString());
    // 'vi' là mặc định nên xoá hẳn tham số thay vì ghi ?lang=vi
    if (next === 'en') params.set('lang', 'en');
    else params.delete('lang');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const linkClass =
    'rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link href={`/${suffix}`} className={linkClass}>
        {tr('navJobs')}
      </Link>
      <Link href={`/companies${suffix}`} className={linkClass}>
        {tr('navCompanies')}
      </Link>
      <a href={apiDocsUrl} target="_blank" rel="noreferrer" className={linkClass}>
        API
      </a>

      <div className="ml-1 flex items-center gap-0.5 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
        {(['vi', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            aria-label={l === 'vi' ? 'Chuyển sang tiếng Việt' : 'Switch to English'}
            aria-pressed={lang === l}
            className={cn(
              'rounded px-2 py-1 text-xs font-semibold uppercase transition',
              lang === l
                ? 'bg-brand-600 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Dòng miễn trừ dưới header — cũng cần biết ngôn ngữ, cùng lý do như trên. */
export function SiteTagline() {
  const searchParams = useSearchParams();
  const lang: Lang = searchParams.get('lang') === 'en' ? 'en' : 'vi';
  return <>{t(lang)('siteTagline')}</>;
}
