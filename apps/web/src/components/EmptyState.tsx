import { t, type Lang } from '@/lib/i18n';

/**
 * `title`/`hint` vẫn là chuỗi tự do để nơi gọi ghi đè được thông điệp riêng
 * (ví dụ "máy chủ đang khởi động"). Khi không truyền thì mặc định lấy theo
 * `lang` — nếu để mặc định cứng tiếng Việt thì bản tiếng Anh sẽ lẫn tiếng Việt.
 */
export function EmptyState({
  title,
  hint,
  lang = 'vi',
}: {
  title?: string;
  hint?: string;
  lang?: Lang;
}) {
  const tr = t(lang);
  const heading = title ?? tr('emptyTitle');
  const body = hint ?? tr('emptyHint');

  return (
    <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
      <svg
        className="mb-4 h-12 w-12 text-slate-300"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" d="M3 7h18M3 12h12M3 17h6" />
      </svg>
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{heading}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{body}</p>
    </div>
  );
}
