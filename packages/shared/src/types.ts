import {
  CompanyType,
  Discipline,
  EmploymentType,
  SalaryPeriod,
  Seniority,
  SourceStrategy,
  WorkMode,
} from './enums';

/** Bản ghi thô do scraper trả về - CHƯA chuẩn hóa, CHƯA phân loại. */
export interface RawJob {
  source: string;
  sourceUrl: string;
  externalId?: string | null;
  title: string;
  companyName?: string | null;
  locationRaw?: string | null;
  description?: string | null;
  descriptionHtml?: string | null;
  employmentTypeRaw?: string | null;
  salaryRaw?: string | null;
  postedAtRaw?: string | null;
  postedAt?: Date | null;
  raw?: Record<string, unknown>;
}

/** Bản ghi sau khi qua normalizer + classifier - sẵn sàng upsert DB. */
export interface NormalizedJob {
  source: string;
  sourceUrl: string;
  externalId: string | null;
  title: string;
  titleNormalized: string;
  description: string | null;
  descriptionHtml: string | null;
  companyName: string | null;
  companySlug: string | null;
  countryCode: string | null;
  city: string | null;
  locationRaw: string | null;
  discipline: Discipline;
  disciplineConfidence: number;
  disciplineScores: Record<string, number>;
  classifierVersion: string;
  seniority: Seniority;
  employmentType: EmploymentType;
  workMode: WorkMode;
  rotation: string | null;
  experienceMinYears: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  skills: string[];
  postedAt: Date | null;
  contentHash: string;
  raw: Record<string, unknown> | null;
}

export interface ClassificationResult {
  discipline: Discipline;
  confidence: number;
  scores: Record<Discipline, number>;
  matchedKeywords: string[];
  method: 'rule' | 'huggingface' | 'hybrid';
  version: string;
}

export interface SourceConfig {
  /** slug duy nhất, dùng làm khóa trong DB cột jobs.source */
  key: string;
  label: string;
  strategy: SourceStrategy;
  baseUrl: string;
  /** Công ty mặc định gắn cho mọi job của nguồn (career site của 1 công ty). */
  defaultCompany?: string;
  companyType?: CompanyType;
  enabled: boolean;
  /** Số trang tối đa mỗi lần chạy */
  maxPages?: number;
  /** Nhóm để chạy song song có kiểm soát */
  priority?: number;
  notes?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface JobFacets {
  disciplines: FacetBucket[];
  countries: FacetBucket[];
  companies: FacetBucket[];
  employmentTypes: FacetBucket[];
  workModes: FacetBucket[];
  seniorities: FacetBucket[];
  sources: FacetBucket[];
  /**
   * Số job khi BỎ bộ lọc quốc gia — dùng cho dòng "Tất cả quốc gia".
   * Không thể lấy bằng cách cộng `countries` lại: những job chưa xác định được
   * quốc gia không nằm trong bucket nào, nên phép cộng cho ra số nhỏ hơn thật
   * (người dùng từng thấy "Tất cả quốc gia 114" trong khi trang có 136 job).
   */
  countriesTotal: number;
  total: number;
}

export interface JobDto {
  id: string;
  title: string;
  slug: string;
  source: string;
  sourceUrl: string;
  company: { id: string; name: string; slug: string; logoUrl: string | null; type: CompanyType } | null;
  country: { code: string; name: string; region: string | null } | null;
  city: string | null;
  locationRaw: string | null;
  discipline: Discipline;
  disciplineConfidence: number;
  seniority: Seniority;
  employmentType: EmploymentType;
  workMode: WorkMode;
  rotation: string | null;
  experienceMinYears: number | null;
  salary: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: SalaryPeriod | null;
    minUsd: number | null;
    maxUsd: number | null;
    display: string | null;
  };
  skills: string[];
  postedAt: string | null;
  scrapedAt: string;
  isActive: boolean;
  description?: string | null;
  descriptionHtml?: string | null;
}
