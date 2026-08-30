import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ScrapeStatus } from '@prisma/client';
import { RawJob, mapLimit } from '@og/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizerService } from '../normalizer/normalizer.service';
import { ClassifierService } from '../classifier/classifier.service';
import { JobsService } from '../jobs/jobs.service';
import { BrowserPool } from './lib/browser-pool';
import { HttpClient } from './lib/http-client';
import { ScrapeContext } from './lib/base-scraper';
import { ScraperRegistry } from './scraper.registry';

export interface RunSummary {
  source: string;
  runId: string;
  status: ScrapeStatus;
  found: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs: number;
  errors: string[];
}

/**
 * ══════════════════════════════════════════════════════════════
 *  ORCHESTRATOR: scrape → normalize → classify → persist
 * ══════════════════════════════════════════════════════════════
 *  • Mỗi nguồn ghi 1 bản ghi scrape_runs (audit + phát hiện site đổi DOM:
 *    found tụt về 0 = cảnh báo).
 *  • Có khóa chống chạy chồng: nếu nguồn đang RUNNING thì bỏ qua lệnh mới.
 *  • Lỗi 1 nguồn không làm hỏng các nguồn khác (Promise per-source, try/catch).
 */
@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly registry: ScraperRegistry,
    private readonly normalizer: NormalizerService,
    private readonly classifier: ClassifierService,
    private readonly jobs: JobsService,
    private readonly browser: BrowserPool,
  ) {}

  /**
   * Dọn các phiên chạy mồ côi lúc khởi động.
   *
   * `running` là khóa trong RAM nên chết theo tiến trình, nhưng dòng
   * `scrape_runs` với status RUNNING thì nằm lại trong database vĩnh viễn.
   * Chuyện này xảy ra thật: Render deploy lại giữa lúc scraper đang chạy.
   *
   * Tiến trình vừa mới khởi động thì không thể có phiên nào đang chạy — mọi
   * dòng RUNNING còn sót đều là rác, đánh dấu FAILED để lịch sử phản ánh đúng.
   */
  async onModuleInit(): Promise<void> {
    const { count } = await this.prisma.scrapeRun.updateMany({
      where: { status: ScrapeStatus.RUNNING },
      data: {
        status: ScrapeStatus.FAILED,
        finishedAt: new Date(),
        errors: ['Tiến trình bị dừng giữa chừng (deploy lại hoặc container restart)'],
      },
    });
    if (count > 0) {
      this.logger.warn(`Đã dọn ${count} phiên scrape mồ côi còn kẹt ở trạng thái RUNNING`);
    }
  }

  private buildContext(): ScrapeContext {
    const s = this.config.get('scraper') as {
      userAgent: string;
      timeoutMs: number;
      requestDelayMs: number;
      maxPages: number;
      proxyUrl?: string;
    };
    return {
      http: new HttpClient({
        userAgent: s.userAgent,
        timeoutMs: s.timeoutMs,
        delayMs: s.requestDelayMs,
        proxyUrl: s.proxyUrl,
      }),
      browser: this.browser,
      maxPages: s.maxPages,
      prefilter: (title, snippet) => this.classifier.prefilter(title, snippet),
      logger: this.logger,
    };
  }

  /** Chạy toàn bộ nguồn đang bật, song song có giới hạn. */
  async runAll(triggeredBy = 'cron'): Promise<RunSummary[]> {
    if (!this.config.get<boolean>('scraper.enabled')) {
      this.logger.warn('SCRAPER_ENABLED=false – bỏ qua lệnh chạy');
      return [];
    }
    const scrapers = this.registry.enabled();
    const concurrency = this.config.get<number>('scraper.concurrency') ?? 3;

    this.logger.log(`Bắt đầu scrape ${scrapers.length} nguồn (concurrency=${concurrency})`);
    const results = await mapLimit(scrapers, concurrency, (s) => this.runSource(s.config.key, triggeredBy));

    const totals = results.reduce(
      (acc, r) => ({
        found: acc.found + r.found,
        inserted: acc.inserted + r.inserted,
        updated: acc.updated + r.updated,
      }),
      { found: 0, inserted: 0, updated: 0 },
    );
    this.logger.log(
      `Hoàn tất: found=${totals.found}, inserted=${totals.inserted}, updated=${totals.updated}`,
    );
    return results;
  }

  /** Chạy 1 nguồn. */
  async runSource(key: string, triggeredBy = 'manual'): Promise<RunSummary> {
    const scraper = this.registry.get(key);
    if (!scraper) throw new NotFoundException(`Không có scraper cho nguồn "${key}"`);

    if (this.running.has(key)) {
      this.logger.warn(`[${key}] đang chạy – bỏ qua lệnh trùng`);
      return {
        source: key,
        runId: '',
        status: ScrapeStatus.RUNNING,
        found: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        durationMs: 0,
        errors: ['Đã có phiên chạy cho nguồn này'],
      };
    }
    this.running.add(key);

    const startedAt = Date.now();
    const run = await this.prisma.scrapeRun.create({
      data: { source: key, status: ScrapeStatus.RUNNING, triggeredBy },
      select: { id: true },
    });

    const errors: string[] = [];
    let found = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const ctx = this.buildContext();
      const outcome = await scraper.run(ctx);
      found = outcome.jobs.length;
      errors.push(...outcome.errors.slice(0, 50));

      for (const rawJob of outcome.jobs) {
        try {
          const result = await this.persist(rawJob, scraper.config.defaultCompany);
          if (result === 'inserted') inserted++;
          else if (result === 'updated') updated++;
          else skipped++;
        } catch (e) {
          failed++;
          if (errors.length < 50) errors.push(`persist ${rawJob.sourceUrl}: ${(e as Error).message}`);
        }
      }

      const status =
        failed === 0 && errors.length === 0
          ? ScrapeStatus.SUCCESS
          : found > 0
            ? ScrapeStatus.PARTIAL
            : ScrapeStatus.FAILED;

      const durationMs = Date.now() - startedAt;
      await this.prisma.scrapeRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          durationMs,
          found,
          inserted,
          updated,
          skipped,
          failed,
          errors: errors.length ? (errors as unknown as Prisma.InputJsonValue) : undefined,
        },
      });

      this.logger.log(
        `[${key}] ${status} · found=${found} inserted=${inserted} updated=${updated} skipped=${skipped} failed=${failed} (${durationMs}ms)`,
      );

      return { source: key, runId: run.id, status, found, inserted, updated, skipped, failed, durationMs, errors };
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const msg = (e as Error).message;
      await this.prisma.scrapeRun.update({
        where: { id: run.id },
        data: {
          status: ScrapeStatus.FAILED,
          finishedAt: new Date(),
          durationMs,
          errors: [msg] as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.error(`[${key}] FAILED: ${msg}`);
      return {
        source: key,
        runId: run.id,
        status: ScrapeStatus.FAILED,
        found,
        inserted,
        updated,
        skipped,
        failed,
        durationMs,
        errors: [msg],
      };
    } finally {
      this.running.delete(key);
    }
  }

  /** normalize + classify + upsert cho 1 job thô. */
  private async persist(rawJob: RawJob, defaultCompany?: string): Promise<'inserted' | 'updated' | 'skipped'> {
    const withCompany: RawJob = {
      ...rawJob,
      companyName: rawJob.companyName ?? defaultCompany ?? null,
    };
    const normalized = await this.normalizer.normalize(withCompany);
    return this.jobs.upsertNormalized(normalized);
  }

  /** Lịch sử các lần chạy – phục vụ trang admin & cảnh báo. */
  /**
   * Lịch sử chạy scrape. Endpoint này CÔNG KHAI (không có AdminKeyGuard) nên
   * `select` ở đây là ranh giới bảo mật, không phải tối ưu hiệu năng.
   *
   * Cột `errors` bị loại có chủ đích: nó lưu message gốc của exception, mà lỗi
   * Prisma thường kèm hostname + cổng database
   * ("Can't reach database server at ep-xxx.neon.tech:5432").
   * Trả nguyên cột đó ra internet là tiết lộ hạ tầng cho người lạ.
   *
   * Số lượng lỗi vẫn hữu ích để theo dõi nên giữ lại cột `failed`; muốn đọc chi
   * tiết lỗi thì xem log của Render.
   */
  async listRuns(limit = 50, source?: string) {
    return this.prisma.scrapeRun.findMany({
      where: source ? { source } : {},
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        source: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        found: true,
        inserted: true,
        updated: true,
        skipped: true,
        failed: true,
        triggeredBy: true,
        // errors: CỐ Ý không trả về — xem ghi chú ở trên
      },
    });
  }

  /** Trạng thái từng nguồn: lần chạy gần nhất + có đang chạy không. */
  async status() {
    const configs = this.registry.configs();
    const latest = await this.prisma.$queryRaw<
      { source: string; status: string; started_at: Date; found: number; inserted: number }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (source) source, status::text, started_at, found, inserted
      FROM scrape_runs
      ORDER BY source, started_at DESC
    `);
    const map = new Map(latest.map((l) => [l.source, l]));

    return configs.map((c) => ({
      ...c,
      isRunning: this.running.has(c.key),
      lastRun: map.get(c.key) ?? null,
    }));
  }
}
