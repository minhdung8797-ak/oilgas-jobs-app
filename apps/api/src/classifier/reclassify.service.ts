import { Injectable, Logger } from '@nestjs/common';
import { Discipline as PrismaDiscipline, Prisma } from '@prisma/client';
import { Discipline } from '@og/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ClassifierService } from './classifier.service';

/**
 * Chạy lại classifier trên dữ liệu đã lưu.
 * Dùng khi: cập nhật keyword dictionary, đổi ngưỡng, bật HuggingFace.
 * Xử lý theo batch để không giữ toàn bộ bảng jobs trong RAM.
 */
@Injectable()
export class ReclassifyService {
  private readonly logger = new Logger(ReclassifyService.name);
  private readonly BATCH = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly classifier: ClassifierService,
  ) {}

  async run(opts: { source?: string; limit: number }): Promise<{
    processed: number;
    changed: number;
    changes: { id: string; title: string; from: string; to: string }[];
  }> {
    const where: Prisma.JobWhereInput = opts.source ? { source: opts.source } : {};
    let processed = 0;
    let changed = 0;
    const changes: { id: string; title: string; from: string; to: string }[] = [];
    let cursor: string | undefined;

    while (processed < opts.limit) {
      const take = Math.min(this.BATCH, opts.limit - processed);
      // `undefined` cho cursor/skip ở lô đầu tiên. Không dùng spread có điều kiện
      // vì Prisma từ chối kiểu union do TypeScript suy ra.
      const batch = await this.prisma.job.findMany({
        where,
        take,
        skip: cursor ? 1 : undefined,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
        select: { id: true, title: true, description: true, discipline: true },
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const job of batch) {
        const result = await this.classifier.classify({
          title: job.title,
          description: job.description ?? '',
        });
        processed++;
        if (result.discipline !== (job.discipline as unknown as Discipline)) {
          changed++;
          if (changes.length < 100) {
            changes.push({
              id: job.id,
              title: job.title,
              from: job.discipline,
              to: result.discipline,
            });
          }
        }
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            discipline: result.discipline as unknown as PrismaDiscipline,
            disciplineConfidence: result.confidence,
            disciplineScores: result.scores as unknown as Prisma.InputJsonValue,
            classifierVersion: result.version,
            matchedKeywords: result.matchedKeywords,
            // Job rơi khỏi 4 nhóm mục tiêu -> ẩn khỏi kết quả public
            isActive: result.discipline !== Discipline.OTHER,
          },
        });
      }
      this.logger.log(`Reclassify: ${processed} job, ${changed} thay đổi nhãn`);
    }

    return { processed, changed, changes };
  }

  async stats(source?: string) {
    const where: Prisma.JobWhereInput = source ? { source } : {};
    const [byDiscipline, avg, total, lowConfidence] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['discipline'],
        where,
        _count: { _all: true },
        _avg: { disciplineConfidence: true },
      }),
      this.prisma.job.aggregate({ where, _avg: { disciplineConfidence: true } }),
      this.prisma.job.count({ where }),
      this.prisma.job.count({
        where: { ...where, disciplineConfidence: { lt: 0.4 }, discipline: { not: 'OTHER' } },
      }),
    ]);

    return {
      total,
      avgConfidence: Math.round((avg._avg.disciplineConfidence ?? 0) * 100) / 100,
      lowConfidenceCount: lowConfidence,
      byDiscipline: byDiscipline.map((d) => ({
        discipline: d.discipline,
        count: d._count._all,
        avgConfidence: Math.round((d._avg.disciplineConfidence ?? 0) * 100) / 100,
      })),
    };
  }
}
