'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { JobFacets } from '@og/shared';
import { DISCIPLINE_STYLE, EMPLOYMENT_LABEL, SENIORITY_LABEL, WORK_MODE_LABEL, cn } from '@/lib/utils';

interface Props {
  facets: JobFacets;
}

/**
 * Bộ lọc nâng cao.
 * Toàn bộ trạng thái lọc nằm trong URL (searchParams) chứ không trong React state:
 *  • Chia sẻ link giữ nguyên bộ lọc
 *  • Nút back/forward của trình duyệt hoạt động đúng
 *  • Server Component đọc thẳng searchParams -> render sẵn HTML, tốt cho SEO
 * useTransition giữ UI phản hồi trong lúc server render lại danh sách.
 */
export function FilterSidebar({ facets }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);

  const current = useMemo(() => {
    const get = (key: string): string[] => {
      const v = searchParams.get(key);
      return v ? v.split(',').filter(Boolean) : [];
    };
    return {
      discipline: get('discipline'),
      country: get('country'),
      company: get('company'),
      employmentType: get('employmentType'),
      workMode: get('workMode'),
      seniority: get('seniority'),
      source: get('source'),
      postedWithinDays: searchParams.get('postedWithinDays') ?? '',
      salaryMinUsd: searchParams.get('salaryMinUsd') ?? '',
      hasSalary: searchParams.get('hasSalary') === 'true',
    };
  }, [searchParams]);

  const pushParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete('page'); // đổi filter luôn quay về trang 1
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const toggle = useCallback(
    (key: string, value: string) => {
      pushParams((params) => {
        const set = new Set((params.get(key) ?? '').split(',').filter(Boolean));
        if (set.has(value)) set.delete(value);
        else set.add(value);
        if (set.size === 0) params.delete(key);
        else params.set(key, Array.from(set).join(','));
      });
    },
    [pushParams],
  );

  const setSingle = useCallback(
    (key: string, value: string) => {
      pushParams((params) => {
        if (!value) params.delete(key);
        else params.set(key, value);
      });
    },
    [pushParams],
  );

  const clearAll = useCallback(() => {
    const q = searchParams.get('q');
    startTransition(() => {
      router.push(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  const activeCount =
    current.discipline.length +
    current.country.length +
    current.company.length +
    current.employmentType.length +
    current.workMode.length +
    current.seniority.length +
    current.source.length +
    (current.postedWithinDays ? 1 : 0) +
    (current.salaryMinUsd ? 1 : 0) +
    (current.hasSalary ? 1 : 0);

  return (
    <aside
      className={cn(
        'space-y-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900',
        isPending && 'opacity-60',
      )}
      aria-busy={isPending}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bộ lọc</h2>
        {activeCount > 0 && (
          <button onClick={clearAll} className="text-xs font-medium text-brand-600 hover:underline">
            Xóa tất cả ({activeCount})
          </button>
        )}
      </div>

      {/* ── Nhóm ngành ── */}
      <FilterGroup title="Nhóm ngành">
        {facets.disciplines.map((d) => (
          <CheckRow
            key={d.value}
            label={DISCIPLINE_STYLE[d.value]?.label ?? d.label}
            count={d.count}
            checked={current.discipline.includes(d.value)}
            onChange={() => toggle('discipline', d.value)}
          />
        ))}
      </FilterGroup>

      {/* ── Thời gian đăng ── */}
      <FilterGroup title="Thời gian đăng">
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: '1', l: '24 giờ' },
            { v: '7', l: '7 ngày' },
            { v: '30', l: '30 ngày' },
            { v: '90', l: '90 ngày' },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => setSingle('postedWithinDays', current.postedWithinDays === o.v ? '' : o.v)}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-xs font-medium transition',
                current.postedWithinDays === o.v
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      </FilterGroup>

      {/* ── Quốc gia ── */}
      <FilterGroup title="Quốc gia">
        {(showAllCountries ? facets.countries : facets.countries.slice(0, 10)).map((c) => (
          <CheckRow
            key={c.value}
            label={c.label}
            count={c.count}
            checked={current.country.includes(c.value)}
            onChange={() => toggle('country', c.value)}
          />
        ))}
        {facets.countries.length > 10 && (
          <button
            onClick={() => setShowAllCountries((s) => !s)}
            className="mt-1 text-xs font-medium text-brand-600 hover:underline"
          >
            {showAllCountries ? 'Thu gọn' : `Xem thêm ${facets.countries.length - 10} quốc gia`}
          </button>
        )}
      </FilterGroup>

      {/* ── Công ty ── */}
      <FilterGroup title="Công ty">
        {(showAllCompanies ? facets.companies : facets.companies.slice(0, 8)).map((c) => (
          <CheckRow
            key={c.value}
            label={c.label}
            count={c.count}
            checked={current.company.includes(c.value)}
            onChange={() => toggle('company', c.value)}
          />
        ))}
        {facets.companies.length > 8 && (
          <button
            onClick={() => setShowAllCompanies((s) => !s)}
            className="mt-1 text-xs font-medium text-brand-600 hover:underline"
          >
            {showAllCompanies ? 'Thu gọn' : `Xem thêm ${facets.companies.length - 8} công ty`}
          </button>
        )}
      </FilterGroup>

      {/* ── Hình thức làm việc ── */}
      <FilterGroup title="Hình thức làm việc">
        {facets.workModes
          .filter((w) => w.value !== 'UNKNOWN')
          .map((w) => (
            <CheckRow
              key={w.value}
              label={WORK_MODE_LABEL[w.value] ?? w.label}
              count={w.count}
              checked={current.workMode.includes(w.value)}
              onChange={() => toggle('workMode', w.value)}
            />
          ))}
      </FilterGroup>

      {/* ── Loại hợp đồng ── */}
      <FilterGroup title="Loại hợp đồng">
        {facets.employmentTypes
          .filter((e) => e.value !== 'UNKNOWN')
          .map((e) => (
            <CheckRow
              key={e.value}
              label={EMPLOYMENT_LABEL[e.value] ?? e.label}
              count={e.count}
              checked={current.employmentType.includes(e.value)}
              onChange={() => toggle('employmentType', e.value)}
            />
          ))}
      </FilterGroup>

      {/* ── Cấp bậc ── */}
      <FilterGroup title="Cấp bậc">
        {facets.seniorities
          .filter((s) => s.value !== 'UNKNOWN')
          .map((s) => (
            <CheckRow
              key={s.value}
              label={SENIORITY_LABEL[s.value] ?? s.label}
              count={s.count}
              checked={current.seniority.includes(s.value)}
              onChange={() => toggle('seniority', s.value)}
            />
          ))}
      </FilterGroup>

      {/* ── Lương ── */}
      <FilterGroup title="Lương (USD/năm quy đổi)">
        <select
          className="input"
          value={current.salaryMinUsd}
          onChange={(e) => setSingle('salaryMinUsd', e.target.value)}
        >
          <option value="">Bất kỳ</option>
          <option value="50000">≥ $50k</option>
          <option value="80000">≥ $80k</option>
          <option value="120000">≥ $120k</option>
          <option value="180000">≥ $180k</option>
          <option value="250000">≥ $250k</option>
        </select>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={current.hasSalary}
            onChange={() => setSingle('hasSalary', current.hasSalary ? '' : 'true')}
          />
          Chỉ job công bố lương
        </label>
      </FilterGroup>

      {/* ── Nguồn ── */}
      <FilterGroup title="Nguồn dữ liệu">
        {facets.sources.map((s) => (
          <CheckRow
            key={s.value}
            label={s.label}
            count={s.count}
            checked={current.source.includes(s.value)}
            onChange={() => toggle('source', s.value)}
          />
        ))}
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
      <span className="flex min-w-0 items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="truncate text-slate-700 dark:text-slate-300">{label}</span>
      </span>
      <span className="shrink-0 text-xs tabular-nums text-slate-400">{count}</span>
    </label>
  );
}
