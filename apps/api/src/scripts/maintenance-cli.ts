/**
 * Tác vụ bảo trì hằng ngày, chạy rồi THOÁT — dành cho Render Cron Job
 * (Render bắt buộc tiến trình phải kết thúc; nó tính tiền theo giây chạy).
 *
 *   node dist/scripts/maintenance-cli.js            # chạy cả hai việc
 *   node dist/scripts/maintenance-cli.js expire     # chỉ ẩn job quá hạn
 *   node dist/scripts/maintenance-cli.js fx         # chỉ cập nhật tỉ giá
 *
 * Trên nền tảng có process thường trú (VPS, docker-compose) thì không cần
 * script này — đặt CRON_ENABLED=true để SchedulerService tự lo.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { JobsService } from '../jobs/jobs.service';
import { FxService } from '../normalizer/fx.service';

async function main(): Promise<void> {
  const logger = new Logger('MaintenanceCLI');
  const task = (process.argv[2] ?? 'all').toLowerCase();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const config = app.get(ConfigService);
    const jobs = app.get(JobsService);
    const fx = app.get(FxService);

    if (task === 'all' || task === 'expire') {
      const ttl = config.get<number>('cron.jobTtlDays') ?? 60;
      const expired = await jobs.expireStale(ttl);
      logger.log(`expire: đã ẩn ${expired} job không còn thấy trên nguồn > ${ttl} ngày`);
    }

    if (task === 'all' || task === 'fx') {
      const rates = await fx.refreshRates();
      logger.log(`fx: đã cập nhật ${rates} tỉ giá`);
    }

    process.exitCode = 0;
  } catch (e) {
    logger.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await app.close();
    // Ép thoát: Prisma pool đôi khi còn giữ handle sau close().
    const grace = setTimeout(() => process.exit(process.exitCode ?? 0), 5000);
    grace.unref();
  }
}

void main();
