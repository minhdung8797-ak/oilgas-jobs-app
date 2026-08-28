import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CacheTTL } from '../common/interceptors/http-cache.interceptor';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @CacheTTL(600)
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
  @CacheTTL(600)
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
