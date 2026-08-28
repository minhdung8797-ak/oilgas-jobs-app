/**
 * CLI chạy scraper ngoài HTTP – dùng cho cron của Railway hoặc chạy tay.
 *
 *   pnpm scrape                 # tất cả nguồn
 *   pnpm scrape rigzone         # 1 nguồn
 *   pnpm scrape --list          # liệt kê nguồn
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { ScraperService } from '../scraper/scraper.service';
import { ScraperRegistry } from '../scraper/scraper.registry';

async function main(): Promise<void> {
  const logger = new Logger('ScrapeCLI');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const registry = app.get(ScraperRegistry);
    const scraper = app.get(ScraperService);
    const arg = process.argv[2];

    if (arg === '--list') {
      // eslint-disable-next-line no-console
      console.table(
        registry.configs().map((c) => ({
          key: c.key,
          label: c.label,
          strategy: c.strategy,
          enabled: c.enabled,
        })),
      );
      return;
    }

    const results = arg ? [await scraper.runSource(arg, 'cli')] : await scraper.runAll('cli');
    // eslint-disable-next-line no-console
    console.table(
      results.map((r) => ({
        source: r.source,
        status: r.status,
        found: r.found,
        inserted: r.inserted,
        updated: r.updated,
        skipped: r.skipped,
        failed: r.failed,
        seconds: Math.round(r.durationMs / 1000),
      })),
    );
    const hasFailure = results.some((r) => r.status === 'FAILED');
    process.exitCode = hasFailure ? 1 : 0;
  } catch (e) {
    logger.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await app.close();
    /**
     * BẮT BUỘC với Railway Cron: nếu tiến trình không thoát, các lần chạy
     * tiếp theo sẽ bị bỏ qua. Chromium hoặc connection pool đôi khi còn giữ
     * handle sống sau app.close(), nên ép thoát sau 5s ân hạn.
     */
    const grace = setTimeout(() => process.exit(process.exitCode ?? 0), 5000);
    grace.unref();
  }
}

void main();
