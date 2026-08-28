'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Ô tìm kiếm + chọn cách sắp xếp.
 * Debounce 400ms để không bắn request mỗi lần gõ phím.
 */
export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      params.delete('page');
      startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const setSort = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', sort);
    params.delete('page');
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          className="input pl-9"
          placeholder='Tìm: "reservoir simulation", "gas lift", "petrophysicist Abu Dhabi"…'
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Tìm kiếm việc làm"
        />
        {isPending && (
          <span className="absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        )}
      </div>

      <select
        className="input sm:w-52"
        value={searchParams.get('sort') ?? 'recent'}
        onChange={(e) => setSort(e.target.value)}
        aria-label="Sắp xếp"
      >
        <option value="recent">Mới nhất</option>
        <option value="relevance">Liên quan nhất</option>
        <option value="salary_desc">Lương cao → thấp</option>
        <option value="salary_asc">Lương thấp → cao</option>
        <option value="company">Theo công ty</option>
      </select>
    </div>
  );
}
