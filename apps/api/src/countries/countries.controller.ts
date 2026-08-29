import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CacheTTL } from '../common/interceptors/http-cache.interceptor';

@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/v1/countries – kèm số job đang mở, sắp xếp giảm dần. */
  @Get()
  // 30 giây, KHÔNG phải 600: endpoint này trả về `jobCount`, con số đổi sau mỗi
  // lần scrape. Với 600 thì header thành
  //   s-maxage=600, stale-while-revalidate=3000
  // tức mọi cache dùng chung (Cloudflare trước Render, tầng fetch của Vercel)
  // được phép phục vụ bản cũ tới 1 giờ — đủ để khoá cứng một bản trả lời sai.
  @CacheTTL(30)
  @ApiOperation({ summary: 'Danh sách quốc gia + số job đang tuyển' })
  async findAll() {
    const rows = await this.prisma.country.findMany({
      select: {
        code: true,
        name: true,
        iso3: true,
        region: true,
        currency: true,
        _count: { select: { jobs: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows
      .map((r) => ({
        code: r.code,
        name: r.name,
        iso3: r.iso3,
        region: r.region,
        currency: r.currency,
        jobCount: r._count.jobs,
      }))
      .sort((a, b) => b.jobCount - a.jobCount || a.name.localeCompare(b.name));
  }
}
