import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CacheTTL } from '../common/interceptors/http-cache.interceptor';

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  // 30 giây, KHÔNG phải 600: endpoint này trả về `jobCount`, con số đổi sau mỗi
  // lần scrape. Với 600 thì header thành
  //   s-maxage=600, stale-while-revalidate=3000
  // tức mọi cache dùng chung (Cloudflare trước Render, tầng fetch của Vercel)
  // được phép phục vụ bản cũ tới 1 giờ — đủ để khoá cứng một bản trả lời sai.
  @CacheTTL(30)
  @ApiOperation({ summary: 'Danh sách kỹ năng/phần mềm + tần suất xuất hiện' })
  async findAll() {
    const rows = await this.prisma.skill.findMany({
      select: { slug: true, name: true, category: true, _count: { select: { jobs: true } } },
    });
    return rows
      .map(({ _count, ...r }) => ({ ...r, jobCount: _count.jobs }))
      .sort((a, b) => b.jobCount - a.jobCount);
  }
}
