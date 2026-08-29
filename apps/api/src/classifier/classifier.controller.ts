import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DISCIPLINE_KEYWORDS, DISCIPLINE_LABELS, NEGATIVE_KEYWORDS } from '@og/shared';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { ClassifierService } from './classifier.service';
import { ReclassifyService } from './reclassify.service';

export class ClassifyDto {
  @ApiProperty({ example: 'Senior Reservoir Engineer - Offshore Abu Dhabi' })
  @IsString()
  @MaxLength(400)
  title!: string;

  @ApiPropertyOptional({ example: 'Perform history matching using Eclipse and estimate STOIIP…' })
  @IsOptional()
  @IsString()
  @MaxLength(60000)
  description?: string;

  @ApiPropertyOptional({ example: 'ADNOC' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}

export class ReclassifyDto {
  @ApiPropertyOptional({ description: 'Chỉ chạy lại cho nguồn này', example: 'rigzone' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ default: 1000, description: 'Số job tối đa xử lý' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

@ApiTags('classify')
@Controller('classify')
export class ClassifierController {
  constructor(
    private readonly classifier: ClassifierService,
    private readonly reclassify: ReclassifyService,
  ) {}

  /** POST /api/v1/classify – phân loại thử 1 job (public, phục vụ debug & demo). */
  @Post()
  @ApiOperation({ summary: 'Phân loại 1 job vào 4 nhóm ngành, trả về điểm & keyword khớp' })
  async classifyOne(@Body() dto: ClassifyDto) {
    const result = await this.classifier.classify(dto);
    return {
      ...result,
      label: DISCIPLINE_LABELS[result.discipline],
    };
  }

  /** GET /api/v1/classify/dictionary – xem từ điển đang dùng (audit / tinh chỉnh). */
  @Get('dictionary')
  @ApiOperation({ summary: 'Trả về keyword dictionary hiện hành' })
  dictionary() {
    return {
      version: DISCIPLINE_KEYWORDS.length,
      disciplines: DISCIPLINE_KEYWORDS.map((d) => ({
        discipline: d.discipline,
        label: DISCIPLINE_LABELS[d.discipline],
        titleBoost: d.titleBoost,
        keywordCount: d.keywords.length,
        keywords: d.keywords,
      })),
      negativeKeywords: NEGATIVE_KEYWORDS,
    };
  }

  /** POST /api/v1/classify/rebuild – chạy lại classifier trên toàn bộ DB. */
  @Post('rebuild')
  @UseGuards(AdminKeyGuard)
  // Phải trùng tên đăng ký ở main.ts — xem ghi chú trong scraper.controller.ts
  @ApiBearerAuth('admin')
  @ApiOperation({ summary: '[Admin] Phân loại lại các job đã lưu (sau khi cập nhật từ điển)' })
  async rebuild(@Body() dto: ReclassifyDto) {
    return this.reclassify.run({ source: dto.source, limit: dto.limit ?? 1000 });
  }

  /** GET /api/v1/classify/stats – phân bố nhãn hiện tại, dùng để đánh giá chất lượng. */
  @Get('stats')
  @ApiOperation({ summary: 'Thống kê phân bố nhãn & confidence' })
  async stats(@Query('source') source?: string) {
    return this.reclassify.stats(source);
  }
}
