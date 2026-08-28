import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** "3 ngày trước" – hiển thị thân thiện, tính ở client-safe cách (không lệch SSR). */
export function timeAgo(iso: string | null): string {
  if (!iso) return 'Không rõ ngày';
  const diff = Date.now() - new Date(iso).getTime();
  const day = Math.floor(diff / 86_400_000);
  if (day < 0) return 'Mới';
  if (day === 0) return 'Hôm nay';
  if (day === 1) return 'Hôm qua';
  if (day < 7) return `${day} ngày trước`;
  if (day < 30) return `${Math.floor(day / 7)} tuần trước`;
  if (day < 365) return `${Math.floor(day / 30)} tháng trước`;
  return `${Math.floor(day / 365)} năm trước`;
}

export function formatUsd(n: number | null): string | null {
  if (n === null) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

export const DISCIPLINE_STYLE: Record<string, { label: string; short: string; className: string }> = {
  RESERVOIR: {
    label: 'Reservoir Engineering',
    short: 'Reservoir',
    className: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900',
  },
  PETROLEUM: {
    label: 'Petroleum Engineering',
    short: 'Petroleum',
    className: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
  },
  PRODUCTION: {
    label: 'Production Engineering',
    short: 'Production',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
  },
  GEOSCIENCE: {
    label: 'Geoscience & Formation',
    short: 'G&F',
    className: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900',
  },
  OTHER: {
    label: 'Khác',
    short: 'Khác',
    className: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  },
};

export const WORK_MODE_LABEL: Record<string, string> = {
  ONSITE: 'Tại chỗ',
  OFFSHORE: 'Ngoài khơi',
  REMOTE: 'Từ xa',
  HYBRID: 'Hybrid',
  ROTATIONAL: 'Luân ca',
  UNKNOWN: '—',
};

export const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'Toàn thời gian',
  PART_TIME: 'Bán thời gian',
  CONTRACT: 'Hợp đồng',
  TEMPORARY: 'Tạm thời',
  INTERNSHIP: 'Thực tập',
  GRADUATE: 'Graduate',
  UNKNOWN: '—',
};

export const SENIORITY_LABEL: Record<string, string> = {
  INTERN: 'Thực tập sinh',
  ENTRY: 'Mới vào nghề',
  MID: 'Trung cấp',
  SENIOR: 'Senior',
  LEAD: 'Lead / Principal',
  MANAGER: 'Quản lý',
  DIRECTOR: 'Giám đốc',
  UNKNOWN: '—',
};
