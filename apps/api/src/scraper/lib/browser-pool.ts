import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Browser, BrowserContext, Page, chromium } from 'playwright';

/**
 * Quản lý 1 instance Chromium dùng chung cho mọi scraper Playwright.
 * Khởi động Chromium tốn ~300-800ms + ~120MB RAM nên tuyệt đối không
 * launch mỗi lần scrape. Mỗi scraper lấy 1 BrowserContext riêng (cookie
 * độc lập, nhẹ như tab ẩn danh) rồi đóng lại khi xong.
 *
 * Đã chặn sẵn ảnh/font/media -> giảm ~70% băng thông và nhanh hơn nhiều.
 */
@Injectable()
export class BrowserPool implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPool.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  constructor(private readonly config: ConfigService) {}

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;

    this.launching = chromium
      .launch({
        headless: this.config.get<boolean>('scraper.headless') ?? true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage', // bắt buộc trong Docker: /dev/shm mặc định chỉ 64MB
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
        ...(this.config.get<string>('scraper.proxyUrl')
          ? { proxy: { server: this.config.get<string>('scraper.proxyUrl')! } }
          : {}),
      })
      .then((b) => {
        this.browser = b;
        this.launching = null;
        this.logger.log('Chromium đã khởi động');
        return b;
      });

    return this.launching;
  }

  async newContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const ctx = await browser.newContext({
      userAgent: this.config.get<string>('scraper.userAgent'),
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      timezoneId: 'UTC',
      javaScriptEnabled: true,
    });
    ctx.setDefaultTimeout(this.config.get<number>('scraper.timeoutMs') ?? 45000);

    // Chặn tài nguyên không cần cho việc trích xuất text
    await ctx.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) return route.abort();
      return route.continue();
    });

    return ctx;
  }

  /** Helper: mở page, chạy callback, luôn đóng context kể cả khi lỗi. */
  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const ctx = await this.newContext();
    const page = await ctx.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close().catch(() => undefined);
      await ctx.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
