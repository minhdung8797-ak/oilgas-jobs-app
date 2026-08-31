import type { JobFacets } from '@og/shared';
import { DISCIPLINE_STYLE, cn } from '@/lib/utils';
import { DISCIPLINE_LABEL_I18N, type Lang } from '@/lib/i18n';

/** Dải thống kê nhanh trên đầu trang danh sách. */
export function StatsBar({ facets, lang = 'vi' }: { facets: JobFacets; lang?: Lang }) {
  const items = facets.disciplines.filter((d) => d.value !== 'OTHER');

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((d) => {
        const style = DISCIPLINE_STYLE[d.value] ?? DISCIPLINE_STYLE.OTHER;
        // Nhãn nhóm ngành lấy từ DISCIPLINE_LABEL_I18N; chỉ lùi về `style.short`
        // khi API trả về một mã nhóm ngành chưa có trong bảng dịch.
        const label = DISCIPLINE_LABEL_I18N[d.value]?.[lang] ?? style.short;
        return (
          <div
            key={d.value}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {d.count.toLocaleString('vi-VN')}
            </p>
            <p className={cn('badge mt-1', style.className)}>{label}</p>
          </div>
        );
      })}
    </div>
  );
}
