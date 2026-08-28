import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CacheTTL } from '../common/interceptors/http-cache.interceptor';

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @CacheTTL(600)
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
