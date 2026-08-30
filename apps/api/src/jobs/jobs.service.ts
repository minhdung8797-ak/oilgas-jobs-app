import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DISCIPLINE_LABELS,
  Discipline,
  JobDto,
  JobFacets,
  NormalizedJob,
  PaginatedResult,
  SalaryPeriod,
  slugify,
} from '@og/shared';
import { PrismaService } from '../prisma/prisma.service';
import { isSafeUrl, sanitizeHtml } from '../common/sanitize-html';
import { buildMeta } from '../common/dto/pagination.dto';
import { JobSort, QueryJobsDto } from './dto/query-jobs.dto';

/** select dùng chung cho list – KHÔNG kéo description (nặng) về ở endpoint list. */
const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  source: true,
  sourceUrl: true,
  city: true,
  locationRaw: true,
  discipline: true,
  disciplineConfidence: true,
  seniority: true,
  employmentType: true,
  workMode: true,
  rotation: true,
  experienceMinYears: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryPeriod: true,
  salaryMinUsd: true,
  salaryMaxUsd: true,
  postedAt: true,
  scrapedAt: true,
  isActive: true,
  company: { select: { id: true, name: true, slug: true, logoUrl: true, type: true } },
  country: { select: { code: true, name: true, region: true } },
  skills: { select: { skill: { select: { slug: true } } } },
} satisfies Prisma.JobSelect;

type JobRow = Prisma.JobGetPayload<{ select: typeof LIST_SELECT }> & {
  description?: string | null;
  descriptionHtml?: string | null;
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════ QUERY ══════════════════════════
  async findAll(query: QueryJobsDto): Promise<PaginatedResult<JobDto>> {
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query.sort);

    // Full-text search: dùng GIN index trên search_vector (migration 002).
    // Prisma chưa hỗ trợ tsvector nên lấy id qua $queryRaw rồi join lại.
    if (query.q && query.q.trim().length > 1) {
      return this.findAllWithSearch(query, where);
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        select: LIST_SELECT,
        orderBy,
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toDto(r as JobRow)),
      meta: buildMeta(total, query.page, query.pageSize),
    };
  }

  /**
   * Nhánh full-text: websearch_to_tsquery hỗ trợ cú pháp "reservoir -intern",
   * "gas lift" (dấu nháy) giống Google. ts_rank_cd cho relevance.
   */
  private async findAllWithSearch(
    query: QueryJobsDto,
    where: Prisma.JobWhereInput,
  ): Promise<PaginatedResult<JobDto>> {
    const q = query.q!.trim();
    const idRows = await this.prisma.$queryRaw<{ id: string; rank: number }[]>(Prisma.sql`
      SELECT id, ts_rank_cd(search_vector, websearch_to_tsquery('english', ${q})) AS rank
      FROM jobs
      WHERE search_vector @@ websearch_to_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT 3000
    `);

    if (idRows.length === 0) {
      return { data: [], meta: buildMeta(0, query.page, query.pageSize) };
    }

    const rankMap = new Map(idRows.map((r) => [r.id, Number(r.rank)]));
    const scopedWhere: Prisma.JobWhereInput = { AND: [where, { id: { in: idRows.map((r) => r.id) } }] };

    // Sắp xếp theo relevance: lấy rộng rồi xếp theo rank trong bộ nhớ (rank đến từ
    // truy vấn raw phía trên, Prisma không sắp xếp theo nó được).
    // Các kiểu sắp xếp khác: để Postgres lo, chỉ lấy đúng 1 trang.
    //
    // Lưu ý: KHÔNG dùng spread có điều kiện (`...(a ? {x} : {y})`) trong đối số của
    // Prisma — TypeScript sẽ suy ra kiểu union và Prisma từ chối. Truyền một object
    // literal duy nhất, các trường không dùng đặt `undefined`.
    const isRelevanceSort = query.sort === JobSort.RELEVANCE;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where: scopedWhere,
        select: LIST_SELECT,
        orderBy: isRelevanceSort ? undefined : this.buildOrderBy(query.sort),
        skip: isRelevanceSort ? undefined : query.skip,
        take: isRelevanceSort ? 3000 : query.pageSize,
      }),
      this.prisma.job.count({ where: scopedWhere }),
    ]);

    let data = rows.map((r) => this.toDto(r as JobRow));
    if (query.sort === JobSort.RELEVANCE) {
      data = data
        .sort((a, b) => (rankMap.get(b.id) ?? 0) - (rankMap.get(a.id) ?? 0))
        .slice(query.skip, query.skip + query.pageSize);
    }

    return { data, meta: buildMeta(total, query.page, query.pageSize) };
  }

  async findOne(idOrSlug: string): Promise<JobDto & { related: JobDto[] }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const job = await this.prisma.job.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      select: { ...LIST_SELECT, description: true, descriptionHtml: true },
    });
    if (!job) throw new NotFoundException(`Không tìm thấy job "${idOrSlug}"`);

    // Job liên quan: cùng nhóm ngành, ưu tiên cùng nước hoặc cùng công ty
    const relatedOr: Prisma.JobWhereInput[] = [];
    if (job.country) relatedOr.push({ country: { code: job.country.code } });
    if (job.company) relatedOr.push({ company: { slug: job.company.slug } });

    const relatedWhere: Prisma.JobWhereInput = {
      id: { not: job.id },
      isActive: true,
      discipline: job.discipline,
      // `undefined` = bỏ qua điều kiện. Không dùng spread có điều kiện ở đây
      // vì TypeScript sẽ suy ra kiểu union mà Prisma từ chối.
      OR: relatedOr.length > 0 ? relatedOr : undefined,
    };

    const related = await this.prisma.job.findMany({
      where: relatedWhere,
      select: LIST_SELECT,
      orderBy: { postedAt: 'desc' },
      take: 6,
    });

    return {
      ...this.toDto(job as JobRow),
      description: job.description,
      // Làm sạch NGAY LÚC TRẢ VỀ, không phải lúc lưu: dữ liệu đã nằm sẵn trong
      // DB từ trước cũng được lọc mà không cần scrape lại. Frontend đưa chuỗi
      // này thẳng vào dangerouslySetInnerHTML nên đây là lớp phòng thủ duy nhất.
      descriptionHtml: sanitizeHtml(job.descriptionHtml),
      related: related.map((r) => this.toDto(r as JobRow)),
    };
  }

  /** Facets tính bằng groupBy – 1 round-trip/nhóm, đủ nhanh với index đã tạo. */
  async facets(query: QueryJobsDto): Promise<JobFacets> {
    const where = this.buildWhere(query);

    const [disciplines, countries, companies, employmentTypes, workModes, seniorities, sources, total] =
      await Promise.all([
        this.prisma.job.groupBy({ by: ['discipline'], where, _count: { _all: true } }),
        this.prisma.job.groupBy({ by: ['countryId'], where, _count: { _all: true } }),
        this.prisma.job.groupBy({ by: ['companyId'], where, _count: { _all: true } }),
        this.prisma.job.groupBy({ by: ['employmentType'], where, _count: { _all: true } }),
        this.prisma.job.groupBy({ by: ['workMode'], where, _count: { _all: true } }),
        this.prisma.job.groupBy({ by: ['seniority'], where, _count: { _all: true } }),
        this.prisma.job.groupBy({ by: ['source'], where, _count: { _all: true } }),
        this.prisma.job.count({ where }),
      ]);

    const countryIds = countries.map((c) => c.countryId).filter((v): v is number => v !== null);
    const companyIds = companies.map((c) => c.companyId).filter((v): v is string => v !== null);

    const [countryRows, companyRows] = await Promise.all([
      this.prisma.country.findMany({ where: { id: { in: countryIds } }, select: { id: true, code: true, name: true } }),
      this.prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, slug: true, name: true } }),
    ]);
    const countryMap = new Map<number, { id: number; code: string; name: string }>(
      countryRows.map((c) => [c.id, c]),
    );
    const companyMap = new Map<string, { id: string; slug: string; name: string }>(
      companyRows.map((c) => [c.id, c]),
    );

    const sortDesc = (a: { count: number }, b: { count: number }) => b.count - a.count;

    return {
      total,
      disciplines: disciplines
        .map((d) => ({
          value: d.discipline,
          label: DISCIPLINE_LABELS[d.discipline as Discipline],
          count: d._count._all,
        }))
        .sort(sortDesc),
      countries: countries
        .filter((c) => c.countryId !== null)
        .map((c) => ({
          value: countryMap.get(c.countryId!)?.code ?? '??',
          label: countryMap.get(c.countryId!)?.name ?? 'Unknown',
          count: c._count._all,
        }))
        .sort(sortDesc),
      companies: companies
        .filter((c) => c.companyId !== null)
        .map((c) => ({
          value: companyMap.get(c.companyId!)?.slug ?? '',
          label: companyMap.get(c.companyId!)?.name ?? 'Unknown',
          count: c._count._all,
        }))
        .sort(sortDesc)
        .slice(0, 40),
      employmentTypes: employmentTypes
        .map((e) => ({ value: e.employmentType, label: e.employmentType, count: e._count._all }))
        .sort(sortDesc),
      workModes: workModes
        .map((w) => ({ value: w.workMode, label: w.workMode, count: w._count._all }))
        .sort(sortDesc),
      seniorities: seniorities
        .map((s) => ({ value: s.seniority, label: s.seniority, count: s._count._all }))
        .sort(sortDesc),
      sources: sources.map((s) => ({ value: s.source, label: s.source, count: s._count._all })).sort(sortDesc),
    };
  }

  /** Gợi ý autocomplete dùng pg_trgm. */
  async suggest(term: string, limit = 8): Promise<string[]> {
    if (term.trim().length < 2) return [];
    const rows = await this.prisma.$queryRaw<{ title: string }[]>(Prisma.sql`
      SELECT DISTINCT title
      FROM jobs
      WHERE is_active = true
        AND discipline <> 'OTHER'
        AND title_normalized % ${term.toLowerCase()}
      ORDER BY similarity(title_normalized, ${term.toLowerCase()}) DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => r.title);
  }

  // ══════════════════════════ WRITE ══════════════════════════
  /**
   * Upsert 1 job đã chuẩn hóa.
   * Trả về 'inserted' | 'updated' | 'skipped' để scrape_runs thống kê.
   * skipped = contentHash không đổi -> chỉ chạm last_seen_at (1 UPDATE nhẹ).
   */
  async upsertNormalized(job: NormalizedJob): Promise<'inserted' | 'updated' | 'skipped'> {
    const existing = await this.prisma.job.findUnique({
      where: { sourceUrl: job.sourceUrl },
      select: { id: true, contentHash: true },
    });

    if (existing && existing.contentHash === job.contentHash) {
      await this.prisma.job.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), isActive: job.discipline !== Discipline.OTHER },
      });
      return 'skipped';
    }

    const companyId = job.companyName ? await this.resolveCompanyId(job.companyName) : null;
    const countryId = job.countryCode ? await this.resolveCountryId(job.countryCode) : null;
    const skillIds = await this.resolveSkillIds(job.skills);

    const data: Prisma.JobUncheckedCreateInput = {
      slug: `${slugify([job.title, job.companyName, job.city].filter(Boolean).join(' ')).slice(0, 200)}-${job.contentHash.slice(0, 6)}`,
      source: job.source,
      // Chặn `javascript:` / `data:` ngay từ lúc ghi. sourceUrl sẽ trở thành
      // href của nút "Ứng tuyển" trên frontend; một URL độc từ nguồn ngoài lọt
      // vào đây là XSS khi người dùng bấm.
      sourceUrl: isSafeUrl(job.sourceUrl) ? job.sourceUrl : '',
      externalId: job.externalId,
      title: job.title.slice(0, 400),
      titleNormalized: job.titleNormalized.slice(0, 400),
      description: job.description,
      descriptionHtml: job.descriptionHtml,
      companyId,
      countryId,
      city: job.city?.slice(0, 160) ?? null,
      locationRaw: job.locationRaw,
      discipline: job.discipline as never,
      disciplineConfidence: job.disciplineConfidence,
      disciplineScores: job.disciplineScores as unknown as Prisma.InputJsonValue,
      classifierVersion: job.classifierVersion,
      matchedKeywords: [],
      seniority: job.seniority as never,
      employmentType: job.employmentType as never,
      workMode: job.workMode as never,
      rotation: job.rotation,
      experienceMinYears: job.experienceMinYears,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryPeriod: (job.salaryPeriod as SalaryPeriod | null) as never,
      salaryMinUsd: job.salaryMinUsd,
      salaryMaxUsd: job.salaryMaxUsd,
      postedAt: job.postedAt,
      lastSeenAt: new Date(),
      isActive: job.discipline !== Discipline.OTHER,
      contentHash: job.contentHash,
      raw: (job.raw ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    const saved = await this.prisma.job.upsert({
      where: { sourceUrl: job.sourceUrl },
      create: data,
      update: { ...data, slug: undefined }, // giữ nguyên slug cũ để không hỏng URL đã index
      select: { id: true },
    });

    // Đồng bộ quan hệ skills
    await this.prisma.jobSkill.deleteMany({ where: { jobId: saved.id } });
    if (skillIds.length > 0) {
      await this.prisma.jobSkill.createMany({
        data: skillIds.map((skillId) => ({ jobId: saved.id, skillId })),
        skipDuplicates: true,
      });
    }

    return existing ? 'updated' : 'inserted';
  }

  /** Đánh dấu hết hạn job không còn xuất hiện trên nguồn quá TTL ngày. */
  async expireStale(ttlDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlDays * 86_400_000);
    const res = await this.prisma.job.updateMany({
      where: { isActive: true, lastSeenAt: { lt: cutoff } },
      data: { isActive: false, expiresAt: new Date() },
    });
    this.logger.log(`Đã ẩn ${res.count} job quá hạn (>${ttlDays} ngày không thấy lại)`);
    return res.count;
  }

  // ═══════════════════════ INTERNAL ═══════════════════════════
  private companyCache = new Map<string, string>();
  private countryCache = new Map<string, number>();
  private skillCache = new Map<string, number>();

  private async resolveCompanyId(name: string): Promise<string> {
    const slug = slugify(name);
    const cached = this.companyCache.get(slug);
    if (cached) return cached;
    const company = await this.prisma.company.upsert({
      where: { slug },
      update: {},
      create: { slug, name: name.slice(0, 200) },
      select: { id: true },
    });
    this.companyCache.set(slug, company.id);
    return company.id;
  }

  private async resolveCountryId(code: string): Promise<number | null> {
    const cached = this.countryCache.get(code);
    if (cached) return cached;
    const country = await this.prisma.country.findUnique({ where: { code }, select: { id: true } });
    if (!country) return null;
    this.countryCache.set(code, country.id);
    return country.id;
  }

  private async resolveSkillIds(slugs: string[]): Promise<number[]> {
    const out: number[] = [];
    for (const slug of slugs) {
      const cached = this.skillCache.get(slug);
      if (cached) {
        out.push(cached);
        continue;
      }
      const skill = await this.prisma.skill.findUnique({ where: { slug }, select: { id: true } });
      if (skill) {
        this.skillCache.set(slug, skill.id);
        out.push(skill.id);
      }
    }
    return out;
  }

  private buildWhere(query: QueryJobsDto): Prisma.JobWhereInput {
    const and: Prisma.JobWhereInput[] = [
      { isActive: true },
      // Mặc định chỉ trả về 4 nhóm mục tiêu
      { discipline: { not: 'OTHER' } },
    ];

    if (query.discipline?.length) and.push({ discipline: { in: query.discipline as never[] } });
    if (query.country?.length) and.push({ country: { code: { in: query.country.map((c) => c.toUpperCase()) } } });
    if (query.region?.length) and.push({ country: { region: { in: query.region } } });
    if (query.company?.length) and.push({ company: { slug: { in: query.company } } });
    if (query.source?.length) and.push({ source: { in: query.source } });
    if (query.employmentType?.length) and.push({ employmentType: { in: query.employmentType as never[] } });
    if (query.workMode?.length) and.push({ workMode: { in: query.workMode as never[] } });
    if (query.seniority?.length) and.push({ seniority: { in: query.seniority as never[] } });
    if (query.skill?.length) and.push({ skills: { some: { skill: { slug: { in: query.skill } } } } });
    if (query.salaryMinUsd !== undefined) and.push({ salaryMaxUsd: { gte: query.salaryMinUsd } });
    if (query.hasSalary) and.push({ OR: [{ salaryMinUsd: { not: null } }, { salaryMaxUsd: { not: null } }] });
    if (query.maxExperienceYears !== undefined)
      and.push({
        OR: [{ experienceMinYears: null }, { experienceMinYears: { lte: query.maxExperienceYears } }],
      });
    if (query.minConfidence !== undefined) and.push({ disciplineConfidence: { gte: query.minConfidence } });
    if (query.postedWithinDays) {
      and.push({ postedAt: { gte: new Date(Date.now() - query.postedWithinDays * 86_400_000) } });
    }

    return { AND: and };
  }

  private buildOrderBy(sort?: JobSort): Prisma.JobOrderByWithRelationInput[] {
    switch (sort) {
      case JobSort.SALARY_DESC:
        return [{ salaryMaxUsd: { sort: 'desc', nulls: 'last' } }, { postedAt: 'desc' }];
      case JobSort.SALARY_ASC:
        return [{ salaryMinUsd: { sort: 'asc', nulls: 'last' } }, { postedAt: 'desc' }];
      case JobSort.COMPANY:
        return [{ company: { name: 'asc' } }, { postedAt: 'desc' }];
      case JobSort.RECENT:
      default:
        return [{ postedAt: { sort: 'desc', nulls: 'last' } }, { scrapedAt: 'desc' }];
    }
  }

  private toDto(row: JobRow): JobDto {
    const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));
    const min = num(row.salaryMin as Prisma.Decimal | null);
    const max = num(row.salaryMax as Prisma.Decimal | null);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      source: row.source,
      sourceUrl: row.sourceUrl,
      company: row.company
        ? {
            id: row.company.id,
            name: row.company.name,
            slug: row.company.slug,
            logoUrl: row.company.logoUrl,
            type: row.company.type as never,
          }
        : null,
      country: row.country
        ? { code: row.country.code, name: row.country.name, region: row.country.region }
        : null,
      city: row.city,
      locationRaw: row.locationRaw,
      discipline: row.discipline as unknown as Discipline,
      disciplineConfidence: row.disciplineConfidence,
      seniority: row.seniority as never,
      employmentType: row.employmentType as never,
      workMode: row.workMode as never,
      rotation: row.rotation,
      experienceMinYears: row.experienceMinYears,
      salary: {
        min,
        max,
        currency: row.salaryCurrency,
        period: row.salaryPeriod as never,
        minUsd: num(row.salaryMinUsd as Prisma.Decimal | null),
        maxUsd: num(row.salaryMaxUsd as Prisma.Decimal | null),
        display: formatSalary(min, max, row.salaryCurrency, row.salaryPeriod),
      },
      skills: row.skills?.map((s) => s.skill.slug) ?? [],
      postedAt: row.postedAt ? row.postedAt.toISOString() : null,
      scrapedAt: row.scrapedAt.toISOString(),
      isActive: row.isActive,
    };
  }
}

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
  period: string | null,
): string | null {
  if (min === null && max === null) return null;
  const fmt = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const range = min !== null && max !== null ? `${fmt(min)} – ${fmt(max)}` : fmt((min ?? max)!);
  const per: Record<string, string> = {
    HOUR: '/hr',
    DAY: '/day',
    WEEK: '/week',
    MONTH: '/month',
    YEAR: '/year',
  };
  return `${currency ?? ''} ${range}${period ? per[period] ?? '' : ''}`.trim();
}
