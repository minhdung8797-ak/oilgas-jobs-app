import { createHash } from 'crypto';

/** Chuẩn hóa text để matching regex: bỏ HTML, lowercase, gộp khoảng trắng. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .toLowerCase()
    .trim();
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Hash nội dung để phát hiện job đã thay đổi -> upsert thông minh, tránh ghi thừa. */
export function contentHash(parts: (string | null | undefined)[]): string {
  return createHash('sha256')
    .update(parts.map((p) => (p ?? '').trim()).join('|'))
    .digest('hex');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry với exponential backoff + jitter (chống rate-limit của job board). */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number;
    baseMs?: number;
    maxMs?: number;
    onRetry?: (e: unknown, attempt: number) => void;
  } = {},
): Promise<T> {
  const { retries = 3, baseMs = 800, maxMs = 15000, onRetry } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      onRetry?.(err, attempt + 1);
      const delay = Math.min(maxMs, baseMs * 2 ** attempt) * (0.5 + Math.random() * 0.5);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Chạy song song có giới hạn concurrency (thay p-limit, zero-dependency). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse ngày "3 days ago", "Posted 12/05/2025", ISO... -> Date | null */
export function parseFlexibleDate(input: string | null | undefined, now = new Date()): Date | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/^posted[:\s]*/, '');

  const rel = s.match(/(\d+)\s*(minute|hour|day|week|month)s?\s*ago/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const ms: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000,
    };
    return new Date(now.getTime() - n * ms[unit]);
  }
  if (/\b(today|just posted|new)\b/.test(s)) return now;
  if (/\byesterday\b/.test(s)) return new Date(now.getTime() - 86_400_000);

  // dd/mm/yyyy hoặc mm/dd/yyyy -> ưu tiên dd/mm khi phần đầu > 12
  const dmy = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    const [day, month] = a > 12 ? [a, b] : [b, a];
    const d = new Date(Date.UTC(y, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
