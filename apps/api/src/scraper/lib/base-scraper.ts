import { Logger } from '@nestjs/common';
import { RawJob, SourceConfig, normalizeText } from '@og/shared';
import { HttpClient } from './http-client';
import { BrowserPool } from './browser-pool';

export interface ScrapeContext {
  http: HttpClient;
  browser: BrowserPool;
  maxPages: number;
  /** Trả về true nếu title/snippet đáng để mở trang chi tiết. */
  prefilter: (title: string, snippet?: string) => boolean;
  logger: Logger;
}

export interface ScrapeOutcome {
  jobs: RawJob[];
  pagesVisited: number;
  errors: string[];
}

/**
 * Hợp đồng chung của mọi scraper.
 *
 * Quy ước quan trọng:
 *  1. `listJobs()` chỉ lấy dữ liệu ở trang danh sách (rẻ).
 *  2. `enrich()` mới mở trang chi tiết – CHỈ gọi cho job đã qua prefilter.
 *     Đây là chỗ tiết kiệm lớn nhất: bỏ ~80% request vô ích.
 *  3. Không bao giờ throw ra ngoài: lỗi 1 job không được làm hỏng cả run.
 */
export abstract class BaseScraper {
  abstract readonly config: SourceConfig;
  protected readonly logger: Logger;

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  /** Bước 1: duyệt trang danh sách. */
  protected abstract listJobs(ctx: ScrapeContext): Promise<RawJob[]>;

  /** Bước 2 (tùy chọn): mở trang chi tiết để lấy mô tả đầy đủ. */
  protected async enrich(job: RawJob, _ctx: ScrapeContext): Promise<RawJob> {
    return job;
  }

  async run(ctx: ScrapeContext): Promise<ScrapeOutcome> {
    const errors: string[] = [];
    let listed: RawJob[] = [];

    try {
      listed = await this.listJobs(ctx);
    } catch (e) {
      const msg = `listJobs thất bại: ${(e as Error).message}`;
      ctx.logger.error(`[${this.config.key}] ${msg}`);
      return { jobs: [], pagesVisited: 0, errors: [msg] };
    }

    // Khử trùng lặp theo sourceUrl ngay trong 1 lần chạy
    const seen = new Set<string>();
    const unique = listed.filter((j) => {
      if (!j.sourceUrl || seen.has(j.sourceUrl)) return false;
      seen.add(j.sourceUrl);
      return true;
    });

    // Prefilter: bỏ job rõ ràng không liên quan trước khi fetch chi tiết
    const candidates = unique.filter((j) =>
      ctx.prefilter(j.title, `${j.description ?? ''} ${j.locationRaw ?? ''}`),
    );
    ctx.logger.log(
      `[${this.config.key}] list=${unique.length}, qua prefilter=${candidates.length}`,
    );

    const enriched: RawJob[] = [];
    for (const job of candidates) {
      try {
        enriched.push(await this.enrich(job, ctx));
      } catch (e) {
        errors.push(`enrich ${job.sourceUrl}: ${(e as Error).message}`);
        enriched.push(job); // vẫn giữ bản list-level, còn hơn mất job
      }
    }

    return { jobs: enriched, pagesVisited: ctx.maxPages, errors };
  }

  // ───────────────────── helpers dùng chung ─────────────────────
  protected absoluteUrl(href: string, base: string): string {
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  }

  protected clean(text: string | null | undefined): string | null {
    if (!text) return null;
    const t = text.replace(/\s{2,}/g, ' ').trim();
    return t.length > 0 ? t : null;
  }

  /** Rút gọn HTML mô tả thành plain text để classifier xử lý. */
  protected toPlainText(html: string | null | undefined): string | null {
    if (!html) return null;
    const text = normalizeText(html);
    return text.length > 0 ? text : null;
  }
}
