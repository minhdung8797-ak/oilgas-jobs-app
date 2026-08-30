import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CacheTTL } from '../common/interceptors/http-cache.interceptor';
import { JobsService } from './jobs.service';
import { QueryJobsDto } from './dto/query-jobs.dto';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /**
   * GET /api/v1/jobs
   * Bộ lọc nâng cao: q, discipline, country, region, company, source,
   * employmentType, workMode, seniority, skill, salaryMinUsd, hasSalary,
   * postedWithinDays, maxExperienceYears, minConfidence, sort, page, pageSize
   */
  @Get()
  @CacheTTL(60)
  // 40 lần/phút thay vì mức chung 120. Khi `sort=relevance`, jobs.service nạp
  // tới 3000 bản ghi (kèm description) vào RAM để xếp hạng — trên instance
  // Render free 512 MB, vài chục request đồng thời là đủ làm hết bộ nhớ.
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @ApiOperation({ summary: 'Danh sách job đã phân loại, có phân trang & lọc nâng cao' })
  @ApiOkResponse({ description: 'Danh sách job + meta phân trang' })
  findAll(@Query() query: QueryJobsDto) {
    return this.jobs.findAll(query);
  }

  /** GET /api/v1/jobs/facets – số lượng theo từng giá trị filter, dùng vẽ sidebar. */
  @Get('facets')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Facet counts cho bộ lọc (áp dụng chính các filter đang chọn)' })
  facets(@Query() query: QueryJobsDto) {
    return this.jobs.facets(query);
  }

  /** GET /api/v1/jobs/suggest?term=reserv – autocomplete tiêu đề. */
  @Get('suggest')
  @CacheTTL(300)
  @ApiQuery({ name: 'term', required: true })
  @ApiOperation({ summary: 'Gợi ý tiêu đề job (pg_trgm similarity)' })
  suggest(@Query('term') term: string) {
    return this.jobs.suggest(term ?? '');
  }

  /** GET /api/v1/jobs/:idOrSlug – chi tiết job + 6 job liên quan. */
  @Get(':idOrSlug')
  @CacheTTL(300)
  @ApiParam({ name: 'idOrSlug', description: 'UUID hoặc slug SEO' })
  @ApiOperation({ summary: 'Chi tiết 1 job' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.jobs.findOne(idOrSlug);
  }
}
