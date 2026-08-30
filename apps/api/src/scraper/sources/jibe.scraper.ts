import { CompanyType, RawJob, SourceStrategy, SourceConfig } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  JIBE  ·  career site engine (jibeapply.com)
 * ══════════════════════════════════════════════════════════════
 *  QatarEnergy dùng nền tảng này. Trang là SPA — HTML thô không chứa dữ liệu
 *  job — nhưng có REST API rất gọn, trả về CẢ MÔ TẢ ĐẦY ĐỦ ngay ở trang danh
 *  sách, nên không cần bước `enrich` mở từng trang chi tiết.
 *
 *      GET https://<host>/api/jobs?keywords=<kw>&page=1&internal=false
 *          &tags1=<nhóm tuyển dụng>&domain=<tenant>.jibeapply.com
 *
 *  Cách tìm ra: mở trang tìm việc, gõ từ khóa rồi xem tab Network —
 *  request duy nhất có ích là `/api/jobs`.
 *
 *  Đã xác minh 2026-08-30 với QatarEnergy: HTTP 200, "geologist" -> 3 kết quả
 *  (PRINCIPAL GEOLOGIST, PRINCIPAL GEOPHYSICIST, PRINCIPAL GEOLOGIST (STUDIES)).
 */
export interface JibeTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** vd: https://careerportal.qatarenergy.qa */
  host: string;
  /** giá trị tham số `domain`, vd: qatarenergy.jibeapply.com */
  apiDomain: string;
  /** Lọc theo nhóm tuyển dụng; bỏ trống thì lấy tất cả */
  tags1?: string;
  /** Tiền tố URL trang chi tiết cho người dùng bấm vào */
  jobPathPrefix: string;
  searchTerms?: string[];
  enabled?: boolean;
}

interface JibeJobData {
  slug?: string;
  req_id?: string;
  title?: string;
  description?: string;
  city?: string;
  country?: string;
  country_code?: string;
  full_location?: string;
  short_location?: string;
  posted_date?: string;
  apply_url?: string;
  category?: string;
}

interface JibeResponse {
  jobs?: Array<{ data?: JibeJobData }>;
  totalCount?: number;
}

const DEFAULT_TERMS = ['reservoir', 'petroleum', 'production engineer', 'geologist', 'petrophysicist'];
const MAX_PAGES = 3;

export class JibeScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly tenant: JibeTenant) {
    super();
    this.config = {
      key: tenant.key,
      label: tenant.label,
      strategy: SourceStrategy.JSON_API,
      baseUrl: tenant.host,
      defaultCompany: tenant.company,
      companyType: tenant.companyType,
      enabled: tenant.enabled ?? true,
      maxPages: MAX_PAGES,
      notes: 'Jibe /api/jobs — trả cả mô tả, không cần mở trang chi tiết',
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const terms = this.tenant.searchTerms ?? DEFAULT_TERMS;

    for (const keyword of terms) {
      for (let page = 1; page <= Math.min(ctx.maxPages, this.config.maxPages ?? MAX_PAGES); page++) {
        const params = new URLSearchParams({
          keywords: keyword,
          sortBy: 'relevance',
          page: String(page),
          internal: 'false',
          domain: this.tenant.apiDomain,
        });
        if (this.tenant.tags1) params.set('tags1', this.tenant.tags1);

        let res: JibeResponse;
        try {
          res = await ctx.http.get<JibeResponse>(`${this.tenant.host}/api/jobs?${params.toString()}`, {
            headers: { Accept: 'application/json' },
          });
        } catch (e) {
          ctx.logger.warn(`[${this.config.key}] "${keyword}" trang ${page}: ${(e as Error).message}`);
          break;
        }

        const batch = res.jobs ?? [];
        if (batch.length === 0) break;

        for (const item of batch) {
          const d = item.data;
          if (!d?.title || !d.req_id) continue;
          jobs.push({
            source: this.config.key,
            sourceUrl: `${this.tenant.host}${this.tenant.jobPathPrefix}/${d.req_id}?lang=en-us`,
            externalId: d.req_id,
            title: d.title,
            companyName: this.tenant.company,
            // country_code có sẵn nên ghép "city, country" cho normalizer dễ khớp
            locationRaw:
              d.full_location ?? [d.city, d.country].filter(Boolean).join(', ') ?? d.short_location ?? null,
            description: d.description ? stripHtml(d.description) : null,
            descriptionHtml: d.description ?? null,
            postedAtRaw: d.posted_date ?? null,
            raw: d as unknown as Record<string, unknown>,
          });
        }

        const total = res.totalCount ?? 0;
        if (page * batch.length >= total) break;
      }
    }

    return jobs;
  }
}

/** Jibe trả mô tả dạng HTML; classifier chỉ cần text thuần. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const JIBE_TENANTS: JibeTenant[] = [
  {
    key: 'qatarenergy',
    label: 'QatarEnergy Careers',
    company: 'QatarEnergy',
    companyType: CompanyType.NOC,
    host: 'https://careerportal.qatarenergy.qa',
    apiDomain: 'qatarenergy.jibeapply.com',
    // Chỉ lấy nhánh tuyển dụng có kinh nghiệm; nhánh còn lại là sinh viên/học bổng.
    tags1: 'Experienced / Professional Recruitment',
    jobPathPrefix: '/experienced-talent/jobs',
  },
];
