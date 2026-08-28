/** Cấu hình tập trung, đọc 1 lần từ env – tránh process.env rải rác khắp code. */
export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  adminApiKey: string;
  throttle: { ttl: number; limit: number };
  database: { url: string };
  scraper: {
    enabled: boolean;
    concurrency: number;
    maxPages: number;
    requestDelayMs: number;
    timeoutMs: number;
    userAgent: string;
    respectRobots: boolean;
    headless: boolean;
    proxyUrl?: string;
  };
  cron: {
    enabled: boolean;
    scrapeAll: string;
    expire: string;
    fx: string;
    jobTtlDays: number;
  };
  classifier: {
    minScore: number;
    minMargin: number;
    hfEnabled: boolean;
    hfToken?: string;
    hfModel: string;
    hfTimeoutMs: number;
  };
  fx: { apiUrl: string };
}

const bool = (v: string | undefined, def = false): boolean =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
const int = (v: string | undefined, def: number): number => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : def;
};

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  // PORT (do nền tảng cấp) luôn thắng API_PORT – xem ghi chú trong main.ts
  port: int(process.env.PORT ?? process.env.API_PORT, 4000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  adminApiKey: process.env.ADMIN_API_KEY ?? '',
  throttle: {
    ttl: int(process.env.THROTTLE_TTL, 60),
    limit: int(process.env.THROTTLE_LIMIT, 120),
  },
  database: { url: process.env.DATABASE_URL ?? '' },
  scraper: {
    enabled: bool(process.env.SCRAPER_ENABLED, true),
    concurrency: int(process.env.SCRAPER_CONCURRENCY, 3),
    maxPages: int(process.env.SCRAPER_MAX_PAGES, 8),
    requestDelayMs: int(process.env.SCRAPER_REQUEST_DELAY_MS, 1500),
    timeoutMs: int(process.env.SCRAPER_TIMEOUT_MS, 45000),
    userAgent:
      process.env.SCRAPER_USER_AGENT ??
      'OGJobsBot/1.0 (+https://example.com/bot; contact@example.com)',
    respectRobots: bool(process.env.SCRAPER_RESPECT_ROBOTS, true),
    headless: bool(process.env.PLAYWRIGHT_HEADLESS, true),
    proxyUrl: process.env.PROXY_URL || undefined,
  },
  cron: {
    enabled: bool(process.env.CRON_ENABLED, true),
    scrapeAll: process.env.CRON_SCRAPE_ALL ?? '15 3 * * *',
    expire: process.env.CRON_EXPIRE ?? '30 4 * * *',
    fx: process.env.CRON_FX ?? '0 5 * * *',
    jobTtlDays: int(process.env.JOB_TTL_DAYS, 60),
  },
  classifier: {
    minScore: int(process.env.CLASSIFIER_MIN_SCORE, 6),
    minMargin: int(process.env.CLASSIFIER_MIN_MARGIN, 2),
    hfEnabled: bool(process.env.HF_ENABLED, false),
    hfToken: process.env.HF_API_TOKEN || undefined,
    hfModel: process.env.HF_MODEL ?? 'MoritzLaurer/deberta-v3-base-zeroshot-v2.0',
    hfTimeoutMs: int(process.env.HF_TIMEOUT_MS, 15000),
  },
  fx: { apiUrl: process.env.FX_API_URL ?? 'https://api.exchangerate.host/latest?base=USD' },
});
