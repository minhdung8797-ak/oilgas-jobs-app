import { Injectable, Logger } from '@nestjs/common';
import { SourceConfig } from '@og/shared';
import { BaseScraper } from './lib/base-scraper';
import { RigzoneScraper } from './sources/rigzone.scraper';
import { SlbScraper } from './sources/slb.scraper';
import { BakerHughesScraper } from './sources/bakerhughes.scraper';
import { WORKDAY_TENANTS, WorkdayScraper } from './sources/workday.scraper';
import { GENERIC_SOURCES, GenericHtmlScraper } from './sources/generic-html.scraper';

/**
 * Registry tập trung mọi scraper.
 * Thêm nguồn mới:
 *   • Site Workday      -> thêm 1 entry vào WORKDAY_TENANTS
 *   • Site HTML thường  -> thêm 1 entry vào GENERIC_SOURCES
 *   • Site SPA phức tạp -> viết class riêng kế thừa BaseScraper rồi đăng ký ở đây
 */
@Injectable()
export class ScraperRegistry {
  private readonly logger = new Logger(ScraperRegistry.name);
  private readonly scrapers: BaseScraper[];

  constructor() {
    this.scrapers = [
      new RigzoneScraper(),
      new SlbScraper(),
      new BakerHughesScraper(),
      // Các tenant Workday khác (bỏ qua bakerhughes vì đã có class riêng)
      ...WORKDAY_TENANTS.filter((t) => t.key !== 'bakerhughes').map((t) => new WorkdayScraper(t)),
      ...GENERIC_SOURCES.map((s) => new GenericHtmlScraper(s)),
    ];
    this.logger.log(
      `Đã nạp ${this.scrapers.length} scraper (${this.enabled().length} đang bật): ` +
        this.enabled().map((s) => s.config.key).join(', '),
    );
  }

  all(): BaseScraper[] {
    return this.scrapers;
  }

  enabled(): BaseScraper[] {
    return this.scrapers.filter((s) => s.config.enabled);
  }

  get(key: string): BaseScraper | undefined {
    return this.scrapers.find((s) => s.config.key === key);
  }

  configs(): SourceConfig[] {
    return this.scrapers.map((s) => s.config);
  }
}
