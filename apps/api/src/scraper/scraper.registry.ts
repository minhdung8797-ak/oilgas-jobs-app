import { Injectable, Logger } from '@nestjs/common';
import { SourceConfig } from '@og/shared';
import { BaseScraper } from './lib/base-scraper';
import { RigzoneScraper } from './sources/rigzone.scraper';
import { SlbScraper } from './sources/slb.scraper';
import { BakerHughesScraper } from './sources/bakerhughes.scraper';
import { WORKDAY_TENANTS, WorkdayScraper } from './sources/workday.scraper';
import { GENERIC_SOURCES, GenericHtmlScraper } from './sources/generic-html.scraper';
import { PHENOM_TENANTS, PhenomScraper } from './sources/phenom.scraper';
import { ORACLE_ORC_TENANTS, OracleOrcScraper } from './sources/oracle-orc.scraper';
import { JIBE_TENANTS, JibeScraper } from './sources/jibe.scraper';
import { WORKABLE_TENANTS, WorkableScraper } from './sources/workable.scraper';

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
      // Career site chạy Phenom People (ADNOC…) — gọi JSON API, không cần Chromium
      ...PHENOM_TENANTS.map((t) => new PhenomScraper(t)),
      // Career site chạy Oracle Recruiting Cloud (Eni…) — REST API, không cần Chromium
      ...ORACLE_ORC_TENANTS.map((t) => new OracleOrcScraper(t)),
      // Career site chạy Jibe (QatarEnergy…) — REST API trả cả mô tả
      ...JIBE_TENANTS.map((t) => new JibeScraper(t)),
      // Career site chạy Workable (BW Energy, Assala…) — 1 request lấy hết tin
      ...WORKABLE_TENANTS.map((t) => new WorkableScraper(t)),
    ];
    this.logger.log(
      `Đã nạp ${this.scrapers.length} scraper (${this.enabled().length} đang bật): ` +
        this.enabled().map((s) => s.config.key).join(', '),
    );
  }

  all(): BaseScraper[] {
    return this.scrapers;
  }

  /**
   * Nguồn bật theo cấu hình, CỘNG THÊM những nguồn được ép bật qua biến môi trường
   * `SCRAPER_FORCE_SOURCES` (danh sách key, ngăn cách bằng dấu phẩy).
   *
   * Vì sao cần: một số nguồn chặn theo ĐỊA CHỈ IP TRUNG TÂM DỮ LIỆU chứ không
   * chặn bot nói chung. Aramco là ví dụ đã đo được — từ Render (Oregon) thì mọi
   * request treo tới hết giờ, nhưng từ trình duyệt IP dân dụng lại phản hồi
   * trong nửa giây.
   *
   * GitHub Actions chạy trên dải IP KHÁC HẲN Render. Nên thay vì tắt vĩnh viễn,
   * ta để nguồn đó `enabled: false` (API trên Render không đụng tới) rồi ép bật
   * riêng trong workflow hằng ngày. Nếu Actions vào được thì có dữ liệu; nếu
   * không thì cũng chỉ tốn vài phút của Actions, API không bị ảnh hưởng.
   *
   * Đặt biến này trên Render là vô nghĩa và sẽ làm mọi lần scrape chậm thêm
   * ~19 phút — xem ghi chú ở nguồn `aramco`.
   */
  enabled(): BaseScraper[] {
    const forced = new Set(
      (process.env.SCRAPER_FORCE_SOURCES ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    return this.scrapers.filter((s) => s.config.enabled || forced.has(s.config.key));
  }

  get(key: string): BaseScraper | undefined {
    return this.scrapers.find((s) => s.config.key === key);
  }

  configs(): SourceConfig[] {
    return this.scrapers.map((s) => s.config);
  }
}
