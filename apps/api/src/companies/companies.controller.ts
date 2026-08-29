import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CacheTTL } from '../common/interceptors/http-cache.interceptor';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  // 30 giây, KHÔNG phải 600: endpoint này trả về `jobCount`, con số đổi sau mỗi
  // lần scrape. Với 600 thì header thành
  //   s-maxage=600, stale-while-revalidate=3000
  // tức mọi cache dùng chung (Cloudflare trước Render, tầng fetch của Vercel)
  // được phép phục vụ bản cũ tới 1 giờ — đủ để khoá cứng một bản trả lời sai.
  @CacheTTL(30)
  @ApiOperation({ summary: 'Danh sách công ty + số job đang tuyển' })
  async findAll(@Query('type') type?: string) {
    const rows = await this.prisma.company.findMany({
      where: type ? { type: type as never } : {},
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        website: true,
        careersUrl: true,
        logoUrl: true,
        hqCountry: { select: { code: true, name: true } },
        _count: { select: { jobs: { where: { isActive: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    return rows
      .map(({ _count, ...r }) => ({ ...r, jobCount: _count.jobs }))
      .sort((a, b) => b.jobCount - a.jobCount || a.name.localeCompare(b.name));
  }

  @Get(':slug')
  // 30 giây, KHÔNG phải 600: endpoint này trả về `jobCount`, con số đổi sau mỗi
  // lần scrape. Với 600 thì header thành
  //   s-maxage=600, stale-while-revalidate=3000
  // tức mọi cache dùng chung (Cloudflare trước Render, tầng fetch của Vercel)
  // được phép phục vụ bản cũ tới 1 giờ — đủ để khoá cứng một bản trả lời sai.
  @CacheTTL(30)
  @ApiOperation({ summary: 'Chi tiết 1 công ty + phân bố job theo nhóm ngành' })
  async findOne(@Param('slug') slug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug },
      include: { hqCountry: { select: { code: true, name: true } } },
    });
    if (!company) throw new NotFoundException(`Không tìm thấy công ty "${slug}"`);

    const byDiscipline = await this.prisma.job.groupBy({
      by: ['discipline'],
      where: { companyId: company.id, isActive: true },
      _count: { _all: true },
    });

    return {
      ...company,
      byDiscipline: byDiscipline.map((d) => ({ discipline: d.discipline, count: d._count._all })),
    };
  }
}
