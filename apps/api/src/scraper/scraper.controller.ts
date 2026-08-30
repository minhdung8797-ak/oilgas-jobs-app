import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { ScraperService } from './scraper.service';

export class RunScrapeDto {
  @ApiPropertyOptional({ description: 'Chạy 1 nguồn cụ thể; bỏ trống = chạy tất cả', example: 'rigzone' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Không chờ kết quả, trả về ngay (fire-and-forget)', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  async?: boolean;
}

@ApiTags('scrape')
@Controller('scrape')
export class ScraperController {
  constructor(private readonly scraper: ScraperService) {}

  /**
   * POST /api/v1/scrape/run
   * Header: Authorization: Bearer <ADMIN_API_KEY>
   * Body:   { "source": "rigzone", "async": true }
   */
  @Post('run')
  @UseGuards(AdminKeyGuard)
  // Tên 'admin' phải trùng tên đã đăng ký ở main.ts (.addBearerAuth(..., 'admin')).
  // Để trống là Swagger dùng tên mặc định 'bearer', không khớp -> nút Authorize
  // nhận khoá nhưng không gắn header vào request, mọi lời gọi đều 401.
  @ApiBearerAuth('admin')
  @ApiOperation({ summary: '[Admin] Kích hoạt scrape thủ công (1 nguồn hoặc tất cả)' })
  async run(@Body() dto: RunScrapeDto) {
    // async=true: trả 202 ngay, tránh timeout gateway với run dài
    if (dto.async) {
      const task = dto.source
        ? this.scraper.runSource(dto.source, 'api-async')
        : this.scraper.runAll('api-async');
      void task.catch((e) => undefined);
      return { accepted: true, source: dto.source ?? 'all', message: 'Đã đưa vào chạy nền' };
    }

    return dto.source
      ? [await this.scraper.runSource(dto.source, 'api')]
      : this.scraper.runAll('api');
  }

  /** GET /api/v1/scrape/sources – danh sách nguồn + trạng thái lần chạy gần nhất. */
  @Get('sources')
  @ApiOperation({ summary: 'Danh sách nguồn scrape và trạng thái' })
  sources() {
    return this.scraper.status();
  }

  /** GET /api/v1/scrape/runs?limit=50&source=rigzone */
  @Get('runs')
  @ApiOperation({ summary: 'Lịch sử các lần chạy scrape' })
  runs(@Query('limit') limit?: string, @Query('source') source?: string) {
    // `?limit=abc` -> parseInt ra NaN -> Math.min(NaN, 200) = NaN -> Prisma
    // `take: NaN` -> lỗi 500 mà người lạ kích hoạt được. Ép về mặc định.
    const parsed = limit ? Number.parseInt(limit, 10) : 50;
    return this.scraper.listRuns(Number.isFinite(parsed) ? parsed : 50, source);
  }
}
