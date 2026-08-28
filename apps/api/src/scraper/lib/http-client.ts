import { Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { retry, sleep } from '@og/shared';

export interface HttpClientOptions {
  userAgent: string;
  timeoutMs: number;
  delayMs: number;
  proxyUrl?: string;
}

/**
 * HTTP client dùng chung cho mọi scraper.
 *  • Rate-limit theo host (delay giữa 2 request tới cùng domain)
 *  • Retry + backoff cho 429/5xx
 *  • Header giống trình duyệt thật để tránh bị chặn ngay ở tầng CDN
 *  • Ghi log rõ ràng để debug khi site đổi cấu trúc
 */
export class HttpClient {
  private readonly logger = new Logger(HttpClient.name);
  private readonly axios: AxiosInstance;
  private readonly lastRequestAt = new Map<string, number>();

  constructor(private readonly opts: HttpClientOptions) {
    this.axios = axios.create({
      timeout: opts.timeoutMs,
      maxRedirects: 5,
      // 4xx không throw để scraper tự quyết định (vd 404 = job đã gỡ)
      validateStatus: (s) => s < 500,
      headers: {
        'User-Agent': opts.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      ...(opts.proxyUrl ? { proxy: parseProxy(opts.proxyUrl) } : {}),
    });
  }

  private async throttle(url: string): Promise<void> {
    const host = safeHost(url);
    const last = this.lastRequestAt.get(host) ?? 0;
    const wait = this.opts.delayMs - (Date.now() - last);
    if (wait > 0) await sleep(wait + Math.random() * 400); // jitter chống pattern đều đặn
    this.lastRequestAt.set(host, Date.now());
  }

  async get<T = string>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    await this.throttle(url);
    return retry(
      async () => {
        const res = await this.axios.get<T>(url, config);
        if (res.status === 429) {
          const ra = parseInt(String(res.headers['retry-after'] ?? '5'), 10);
          await sleep(Math.min(60_000, (Number.isFinite(ra) ? ra : 5) * 1000));
          throw new Error(`429 Too Many Requests: ${url}`);
        }
        if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${url}`);
        return res.data;
      },
      {
        retries: 3,
        baseMs: 1500,
        onRetry: (e, attempt) =>
          this.logger.warn(`Retry ${attempt} cho ${url}: ${(e as Error).message}`),
      },
    );
  }

  async post<T = unknown>(url: string, body: unknown, config: AxiosRequestConfig = {}): Promise<T> {
    await this.throttle(url);
    return retry(
      async () => {
        const res = await this.axios.post<T>(url, body, {
          ...config,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...config.headers },
        });
        if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${url}`);
        return res.data;
      },
      {
        retries: 3,
        baseMs: 1500,
        onRetry: (e, attempt) =>
          this.logger.warn(`Retry ${attempt} cho POST ${url}: ${(e as Error).message}`),
      },
    );
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function parseProxy(proxyUrl: string) {
  const u = new URL(proxyUrl);
  return {
    protocol: u.protocol.replace(':', ''),
    host: u.hostname,
    port: parseInt(u.port || '80', 10),
    ...(u.username ? { auth: { username: u.username, password: u.password } } : {}),
  };
}
