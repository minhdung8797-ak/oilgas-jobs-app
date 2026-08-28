import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ScraperService } from '../scraper/scraper.service';
import { JobsService } from '../jobs/jobs.service';
import { FxService } from '../normalizer/fx.service';

/**
 * ══════════════════════════════════════════════════════════════
 *  CRON JOBS
 * ══════════════════════════════════════════════════════════════
 *  Đăng ký động (không dùng decorator @Cron) để lịch chạy đọc được
 *  từ biến môi trường – đổi lịch không cần build lại image.
 *
 *  Lịch mặc định (UTC):
 *   03:15  scrape toàn bộ nguồn
 *   04:30  ẩn job quá hạn (không còn thấy trên nguồn > JOB_TTL_DAYS)
 *   05:00  cập nhật tỉ giá USD
 *
 *  ⚠️ Khi chạy nhiều replica trên Railway/K8s, chỉ 1 instance được phép
 *     chạy cron. Đặt CRON_ENABLED=true cho đúng một service "worker",
 *     các replica phục vụ API để CRON_ENABLED=false.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly scraper: ScraperService,
    private readonly jobs: JobsService,
    private readonly fx: FxService,
  ) {}

  onModuleInit(): void {
    const cron = this.config.get('cron') as {
      enabled: boolean;
      scrapeAll: string;
      expire: string;
      fx: string;
      jobTtlDays: number;
    };

    if (!cron.enabled) {
      this.logger.warn('CRON_ENABLED=false – không đăng ký cron job nào');
      return;
    }

    this.register('scrape-all', cron.scrapeAll, async () => {
      this.logger.log('CRON: bắt đầu scrape toàn bộ nguồn');
      const results = await this.scraper.runAll('cron');
      const failed = results.filter((r) => r.status === 'FAILED');
      if (failed.length > 0) {
        // Điểm nối alert: gửi Slack/email tại đây
        this.logger.error(`CRON: ${failed.length} nguồn thất bại: ${failed.map((f) => f.source).join(', ')}`);
      }
    });

    this.register('expire-stale', cron.expire, async () => {
      const n = await this.jobs.expireStale(cron.jobTtlDays);
      this.logger.log(`CRON: ẩn ${n} job quá hạn`);
    });

    this.register('refresh-fx', cron.fx, async () => {
      const n = await this.fx.refreshRates();
      this.logger.log(`CRON: cập nhật ${n} tỉ giá`);
    });

    this.logger.log(
      `Đã đăng ký cron: scrape="${cron.scrapeAll}", expire="${cron.expire}", fx="${cron.fx}" (UTC)`,
    );
  }

  private register(name: string, expression: string, handler: () => Promise<void>): void {
    try {
      const job = new CronJob(expression, () => {
        handler().catch((e) => this.logger.error(`CRON ${name} lỗi: ${(e as Error).message}`));
      });
      this.registry.addCronJob(name, job as never);
      job.start();
    } catch (e) {
      this.logger.error(`Không đăng ký được cron "${name}" (${expression}): ${(e as Error).message}`);
    }
  }

  /** Cho phép kích hoạt thủ công từ API admin nếu cần. */
  async triggerNow(name: 'scrape-all' | 'expire-stale' | 'refresh-fx'): Promise<string> {
    switch (name) {
      case 'scrape-all': {
        const r = await this.scraper.runAll('manual-trigger');
        return `Đã chạy ${r.length} nguồn`;
      }
      case 'expire-stale': {
        const n = await this.jobs.expireStale(this.config.get<number>('cron.jobTtlDays') ?? 60);
        return `Đã ẩn ${n} job`;
      }
      case 'refresh-fx': {
        const n = await this.fx.refreshRates();
        return `Đã cập nhật ${n} tỉ giá`;
      }
    }
  }
}
