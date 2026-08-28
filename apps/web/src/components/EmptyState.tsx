export function EmptyState({
  title = 'Không tìm thấy việc làm phù hợp',
  hint = 'Thử bỏ bớt bộ lọc, mở rộng khoảng thời gian đăng, hoặc dùng từ khóa tổng quát hơn.',
}: {
  title?: string;
  hint?: string;
}) {
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
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{hint}</p>
    </div>
  );
}
