'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { JobFacets } from '@og/shared';
import { DISCIPLINE_STYLE, cn } from '@/lib/utils';
import {
  DISCIPLINE_LABEL_I18N,
  EMPLOYMENT_I18N,
  SENIORITY_I18N,
  WORK_MODE_I18N,
  t,
  type Lang,
} from '@/lib/i18n';

interface Props {
  facets: JobFacets;
  /** Nhận qua prop từ Server Component cha — component này không tự đọc `?lang=`. */
  lang: Lang;
}

/**
 * Bộ lọc nâng cao.
 * Toàn bộ trạng thái lọc nằm trong URL (searchParams) chứ không trong React state:
 *  • Chia sẻ link giữ nguyên bộ lọc
 *  • Nút back/forward của trình duyệt hoạt động đúng
 *  • Server Component đọc thẳng searchParams -> render sẵn HTML, tốt cho SEO
 * useTransition giữ UI phản hồi trong lúc server render lại danh sách.
 */
export function FilterSidebar({ facets, lang }: Props) {
  const tr = t(lang);
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
      excludeCountry: get('excludeCountry'),
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

  /**
   * Ô quốc gia chạy ở hai chế độ:
   *  • BAO GỒM — khi URL có `country=`. Chỉ xảy ra với link cũ hoặc link người
   *    khác gửi; giao diện này không tự sinh ra nó.
   *  • LOẠI TRỪ — mặc định. Không có tham số nào = xem tất cả; bỏ tick nước nào
   *    thì nước đó vào `excludeCountry`.
   *
   * Vì sao không dùng danh sách bao gồm cho việc bỏ tick: bỏ tick 1 trong 22 nước
   * phải gửi 21 mã, vượt giới hạn 20 phần tử của API -> HTTP 400 -> toàn bộ job
   * biến mất. Đó chính là lỗi người dùng gặp. Gửi 1 mã loại trừ vừa ngắn, vừa
   * đúng, vừa tự động bao gồm các nước mới xuất hiện sau này.
   */
  const includeMode = current.country.length > 0;
  const excluded = useMemo(() => new Set(current.excludeCountry), [current.excludeCountry]);
  const allCountries = !includeMode && excluded.size === 0;

  const selectAllCountries = useCallback(() => {
    pushParams((params) => {
      params.delete('country');
      params.delete('excludeCountry');
    });
  }, [pushParams]);

  const isCountryChecked = useCallback(
    (value: string) => (includeMode ? current.country.includes(value) : !excluded.has(value)),
    [includeMode, current.country, excluded],
  );

  const toggleCountry = useCallback(
    (value: string) => {
      if (includeMode) {
        toggle('country', value);
        return;
      }
      pushParams((params) => {
        const next = new Set((params.get('excludeCountry') ?? '').split(',').filter(Boolean));
        if (next.has(value)) next.delete(value);
        else next.add(value);
        if (next.size === 0) params.delete('excludeCountry');
        else params.set('excludeCountry', Array.from(next).join(','));
      });
    },
    [includeMode, toggle, pushParams],
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
    // Giữ lại `q` và `lang`: cả hai đều KHÔNG phải bộ lọc. Nếu xoá `lang` thì
    // bấm "Xóa tất cả" sẽ vô tình đẩy người dùng về tiếng Việt.
    const keep = new URLSearchParams();
    const q = searchParams.get('q');
    if (q) keep.set('q', q);
    if (searchParams.get('lang') === 'en') keep.set('lang', 'en');
    const qs = keep.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  const activeCount =
    current.discipline.length +
    current.country.length +
    current.excludeCountry.length +
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {tr('filters')}
        </h2>
        {activeCount > 0 && (
          <button onClick={clearAll} className="text-xs font-medium text-brand-600 hover:underline">
            {tr('clearAll')} ({activeCount})
          </button>
        )}
      </div>

      {/* ── Nhóm ngành ── */}
      <FilterGroup title={tr('discipline')}>
        {facets.disciplines.map((d) => (
          <CheckRow
            key={d.value}
            label={DISCIPLINE_LABEL_I18N[d.value]?.[lang] ?? DISCIPLINE_STYLE[d.value]?.label ?? d.label}
            count={d.count}
            checked={current.discipline.includes(d.value)}
            onChange={() => toggle('discipline', d.value)}
          />
        ))}
      </FilterGroup>

      {/* ── Thời gian đăng ── */}
      <FilterGroup title={tr('postedWithin')}>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: '1', l: tr('h24') },
            { v: '7', l: tr('d7') },
            { v: '30', l: tr('d30') },
            { v: '90', l: tr('d90') },
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

      {/* ── Quốc gia ──
          Khác với các nhóm lọc còn lại: mặc định coi như ĐÃ CHỌN HẾT, người dùng
          bỏ tick nước không muốn. Cách này hợp với thói quen thực tế — người tìm
          việc thường muốn xem mọi nơi rồi loại vài nước, chứ hiếm khi tick từng
          nước một trong danh sách hơn chục mục.

          Bên dưới, `country` rỗng trong URL vẫn nghĩa là "không lọc" — API không
          đổi gì. Chỗ khác biệt chỉ nằm ở cách hiển thị và ở hành vi lần bỏ tick
          đầu tiên: nó ghi ra danh sách mọi nước TRỪ nước vừa bỏ. */}
      <FilterGroup title={tr('country')}>
        <CheckRow
          label={tr('allCountries')}
          count={facets.countriesTotal}
          checked={allCountries}
          disabled={allCountries}
          onChange={selectAllCountries}
        />
        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
        {(showAllCountries ? facets.countries : facets.countries.slice(0, 10)).map((c) => (
          <CheckRow
            key={c.value}
            label={c.label}
            count={c.count}
            checked={isCountryChecked(c.value)}
            onChange={() => toggleCountry(c.value)}
          />
        ))}
        {facets.countries.length > 10 && (
          <button
            onClick={() => setShowAllCountries((s) => !s)}
            className="mt-1 text-xs font-medium text-brand-600 hover:underline"
          >
            {showAllCountries
              ? tr('collapse')
              : `${tr('showMore')} ${facets.countries.length - 10} ${tr('showMoreSuffix')}`}
          </button>
        )}
      </FilterGroup>

      {/* ── Công ty ── */}
      <FilterGroup title={tr('company')}>
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
            {showAllCompanies
              ? tr('collapse')
              : `${tr('showMore')} ${facets.companies.length - 8} ${tr('showMoreSuffixCompanies')}`}
          </button>
        )}
      </FilterGroup>

      {/* ── Hình thức làm việc ── */}
      <FilterGroup title={tr('workMode')}>
        {facets.workModes
          .filter((w) => w.value !== 'UNKNOWN')
          .map((w) => (
            <CheckRow
              key={w.value}
              label={WORK_MODE_I18N[w.value]?.[lang] ?? w.label}
              count={w.count}
              checked={current.workMode.includes(w.value)}
              onChange={() => toggle('workMode', w.value)}
            />
          ))}
      </FilterGroup>

      {/* ── Loại hợp đồng ── */}
      <FilterGroup title={tr('employmentType')}>
        {facets.employmentTypes
          .filter((e) => e.value !== 'UNKNOWN')
          .map((e) => (
            <CheckRow
              key={e.value}
              label={EMPLOYMENT_I18N[e.value]?.[lang] ?? e.label}
              count={e.count}
              checked={current.employmentType.includes(e.value)}
              onChange={() => toggle('employmentType', e.value)}
            />
          ))}
      </FilterGroup>

      {/* ── Cấp bậc ── */}
      <FilterGroup title={tr('seniority')}>
        {facets.seniorities
          .filter((s) => s.value !== 'UNKNOWN')
          .map((s) => (
            <CheckRow
              key={s.value}
              label={SENIORITY_I18N[s.value]?.[lang] ?? s.label}
              count={s.count}
              checked={current.seniority.includes(s.value)}
              onChange={() => toggle('seniority', s.value)}
            />
          ))}
      </FilterGroup>

      {/* ── Lương ── */}
      <FilterGroup title={tr('salary')}>
        <select
          className="input"
          value={current.salaryMinUsd}
          onChange={(e) => setSingle('salaryMinUsd', e.target.value)}
        >
          <option value="">{tr('salaryAny')}</option>
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
          {tr('hasSalaryOnly')}
        </label>
      </FilterGroup>

      {/* ── Nguồn ── */}
      <FilterGroup title={tr('source')}>
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
  disabled = false,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm',
        disabled
          ? 'cursor-default opacity-70'
          : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="truncate text-slate-700 dark:text-slate-300">{label}</span>
      </span>
      <span className="shrink-0 text-xs tabular-nums text-slate-400">{count}</span>
    </label>
  );
}
