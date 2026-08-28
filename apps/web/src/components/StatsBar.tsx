import type { JobFacets } from '@og/shared';
import { DISCIPLINE_STYLE, cn } from '@/lib/utils';

/** Dải thống kê nhanh trên đầu trang danh sách. */
export function StatsBar({ facets }: { facets: JobFacets }) {
  const items = facets.disciplines.filter((d) => d.value !== 'OTHER');

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((d) => {
        const style = DISCIPLINE_STYLE[d.value] ?? DISCIPLINE_STYLE.OTHER;
        return (
          <div
            key={d.value}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {d.count.toLocaleString('vi-VN')}
            </p>
            <p className={cn('badge mt-1', style.className)}>{style.short}</p>
          </div>
        );
      })}
    </div>
  );
}
