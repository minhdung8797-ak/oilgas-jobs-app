import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Discipline, EmploymentType, Seniority, WorkMode } from '@og/shared';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** `?discipline=RESERVOIR,PRODUCTION` hoặc `?discipline=RESERVOIR&discipline=PRODUCTION` */
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean);
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
};

export enum JobSort {
  RECENT = 'recent',
  RELEVANCE = 'relevance',
  SALARY_DESC = 'salary_desc',
  SALARY_ASC = 'salary_asc',
  COMPANY = 'company',
}

export class QueryJobsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Full-text search trên title + location + description' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: Discipline, isArray: true, example: ['RESERVOIR'] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(Discipline, { each: true })
  discipline?: Discipline[];

  @ApiPropertyOptional({ description: 'Mã ISO alpha-2', example: ['AE', 'NO'] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  country?: string[];

  @ApiPropertyOptional({ description: 'Vùng địa lý', example: ['Middle East'] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  region?: string[];

  @ApiPropertyOptional({ description: 'Slug công ty', example: ['slb', 'adnoc'] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  company?: string[];

  @ApiPropertyOptional({ example: ['rigzone', 'slb'] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  source?: string[];

  @ApiPropertyOptional({ enum: EmploymentType, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(EmploymentType, { each: true })
  employmentType?: EmploymentType[];

  @ApiPropertyOptional({ enum: WorkMode, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(WorkMode, { each: true })
  workMode?: WorkMode[];

  @ApiPropertyOptional({ enum: Seniority, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(Seniority, { each: true })
  seniority?: Seniority[];

  @ApiPropertyOptional({ description: 'Slug kỹ năng', example: ['petrel', 'eclipse'] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  skill?: string[];

  @ApiPropertyOptional({ description: 'Lương tối thiểu (USD/năm quy đổi)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMinUsd?: number;

  @ApiPropertyOptional({ description: 'Chỉ lấy job có thông tin lương' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  hasSalary?: boolean;

  @ApiPropertyOptional({ description: 'Đăng trong vòng N ngày', example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  postedWithinDays?: number;

  @ApiPropertyOptional({ description: 'Số năm kinh nghiệm tối đa yêu cầu' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(45)
  maxExperienceYears?: number;

  // Thiếu @IsNumber/@Min/@Max thì `?minConfidence=abc` cho ra NaN, lọt xuống
  // Prisma dưới dạng `disciplineConfidence: { gte: NaN }` và gây lỗi 500.
  // Confidence luôn nằm trong [0,1] nên chặn ngay tại đây.
  @ApiPropertyOptional({
    description: 'Ngưỡng confidence tối thiểu của classifier',
    example: 0.3,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;

  @ApiPropertyOptional({ enum: JobSort, default: JobSort.RECENT })
  @IsOptional()
  @IsEnum(JobSort)
  sort?: JobSort = JobSort.RECENT;
}
