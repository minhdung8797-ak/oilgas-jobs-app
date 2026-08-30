/**
 * In báo cáo Markdown về lần cập nhật gần nhất.
 *
 *   node dist/scripts/report-cli.js
 *
 * GitHub Actions ghi kết quả này vào $GITHUB_STEP_SUMMARY, nên mỗi lần chạy
 * hằng ngày bạn mở tab Actions là thấy ngay điều gì đã xảy ra — không phải
 * đọc hàng trăm dòng log.
 *
 * Vì sao đáng có: scraper thất bại ÂM THẦM là kiểu hỏng nguy hiểm nhất của app
 * này. Nguồn đổi cấu trúc trang thì `found` tụt về 0 nhưng job vẫn chạy "thành
 * công", và dữ liệu cứ cũ dần mà không ai biết. Bảng dưới đây phơi bày điều đó.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { ScraperRegistry } from '../scraper/scraper.registry';

interface RunRow {
  source: string;
  status: string;
  found: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  duration_ms: number | null;
}

function line(cells: (string | number)[]): string {
  return `| ${cells.join(' | ')} |`;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const out: string[] = [];

  try {
    const prisma = app.get(PrismaService);
    const registry = app.get(ScraperRegistry);

    // Lần chạy gần nhất của MỖI nguồn trong 24 giờ qua
    const runs = await prisma.$queryRaw<RunRow[]>`
      SELECT DISTINCT ON (source)
             source, status::text, found, inserted, updated, skipped, failed, duration_ms
      FROM scrape_runs
      WHERE started_at > NOW() - INTERVAL '24 hours'
      ORDER BY source, started_at DESC
    `;

    const [totalJobs, activeJobs, byDiscipline, newToday] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { isActive: true } }),
      prisma.job.groupBy({
        by: ['discipline'],
        where: { isActive: true },
        _count: { _all: true },
      }),
      prisma.job.count({ where: { createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } } }),
    ]);

    out.push(`## Cập nhật ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, '');
    out.push(`**${activeJobs}** việc làm đang hiển thị · **${newToday}** tin mới trong 24 giờ qua`, '');

    out.push(...[
      line(['Nhóm ngành', 'Số job']),
      line(['---', '---:']),
      ...byDiscipline
        .filter((d) => d.discipline !== 'OTHER')
        .sort((a, b) => b._count._all - a._count._all)
        .map((d) => line([d.discipline, d._count._all])),
    ], '');

    const enabled = registry.enabled().map((s) => s.config.key);
    out.push('### Kết quả từng nguồn', '');
    out.push(line(['Nguồn', 'Trạng thái', 'Tìm thấy', 'Thêm mới', 'Cập nhật', 'Lỗi', 'Giây']));
    out.push(line(['---', '---', '---:', '---:', '---:', '---:', '---:']));

    const seen = new Set<string>();
    for (const r of runs) {
      seen.add(r.source);
      // Nguồn chạy xong mà không tìm thấy gì = dấu hiệu trang nguồn đã đổi cấu trúc
      const cờ = r.status === 'SUCCESS' && r.found === 0 ? ' ⚠️' : '';
      out.push(
        line([
          r.source,
          r.status + cờ,
          r.found,
          r.inserted,
          r.updated,
          r.failed,
          Math.round((r.duration_ms ?? 0) / 1000),
        ]),
      );
    }
    // Nguồn đang bật nhưng KHÔNG hề chạy — cũng là một kiểu hỏng thầm lặng
    for (const key of enabled) {
      if (!seen.has(key)) out.push(line([key, 'KHÔNG CHẠY ❌', '—', '—', '—', '—', '—']));
    }

    const imDangNgo = runs.filter((r) => r.status === 'SUCCESS' && r.found === 0).map((r) => r.source);
    if (imDangNgo.length > 0) {
      out.push(
        '',
        `> ⚠️ **${imDangNgo.length} nguồn chạy xong nhưng không tìm thấy tin nào:** ${imDangNgo.join(', ')}`,
        '> Thường là trang nguồn đã đổi cấu trúc hoặc chặn bot. Kiểm tra thủ công rồi sửa selector.',
      );
    }

    out.push('', `_Tổng cộng ${totalJobs} bản ghi trong database (kể cả tin đã ẩn)._`);
  } finally {
    await app.close();
  }

  // eslint-disable-next-line no-console
  console.log(out.join('\n'));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Không tạo được báo cáo:', e);
  process.exitCode = 1;
});

// Ép thoát: Prisma đôi khi giữ socket khiến tiến trình treo, làm Actions chạy
// tới hết 30 phút timeout. Cùng lý do với scrape-cli.
const grace = setTimeout(() => process.exit(process.exitCode ?? 0), 5000);
grace.unref();
