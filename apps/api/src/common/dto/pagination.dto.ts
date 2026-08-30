import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  // @Max(1000) là chặn tài nguyên, không phải giới hạn nghiệp vụ.
  // `skip = (page-1) * pageSize` đi thẳng vào OFFSET của Postgres; `?page=100000000`
  // buộc Neon (gói free) quét rồi bỏ qua toàn bảng cho MỘT request.
  // 1000 trang × 100 bản ghi = 100.000 job, vượt xa quy mô thực tế của app.
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }
}

export function buildMeta(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
