import { CompanyType, RawJob, SourceStrategy, SourceConfig } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  WORKABLE  ·  apply.workable.com
 * ══════════════════════════════════════════════════════════════
 *  Các công ty dầu khí độc lập cỡ vừa (BW Energy, Assala Energy…) hay dùng
 *  Workable thay vì Workday/SuccessFactors. Nền tảng này có API widget công khai:
 *
 *      GET https://apply.workable.com/api/v1/widget/accounts/<account>?details=true
 *
 *  Khác biệt quan trọng so với mọi scraper còn lại: endpoint này KHÔNG nhận từ
 *  khoá — nó trả về TOÀN BỘ tin đang mở trong đúng MỘT request. Với công ty cỡ
 *  20 tin thì đây là cách rẻ nhất có thể, và cũng không bao giờ bỏ sót vì chọn
 *  sai từ khoá. Đổi lại, phần lớn tin trả về sẽ lạc đề (kế toán, IT, HSE) —
 *  prefilter + classifier lo việc lọc, đúng như thiết kế.
 *
 *  Mô tả job cũng có sẵn trong cùng response nên không cần bước `enrich`.
 *
 *  Đã xác minh 2026-08-31: assala-energy 17 tin, bw-energy 22 tin, HTTP 200.
 */
export interface WorkableTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** Định danh tài khoản trong URL, vd: 'bw-energy' */
  account: string;
  enabled?: boolean;
}

interface WorkableJob {
  title?: string;
  shortcode?: string;
  code?: string;
  employment_type?: string;
  url?: string;
  application_url?: string;
  shortlink?: string;
  published_on?: string;
  created_at?: string;
  country?: string;
  city?: string;
  state?: string;
  description?: string;
}

interface WorkableResponse {
  name?: string;
  jobs?: WorkableJob[];
}

const HOST = 'https://apply.workable.com';

export class WorkableScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly tenant: WorkableTenant) {
    super();
    this.config = {
      key: tenant.key,
      label: tenant.label,
      strategy: SourceStrategy.JSON_API,
      baseUrl: HOST,
      defaultCompany: tenant.company,
      companyType: tenant.companyType,
      enabled: tenant.enabled ?? true,
      maxPages: 1, // API trả hết trong một lần, không có phân trang
      notes: 'Workable widget API — 1 request lấy toàn bộ tin đang mở',
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    let res: WorkableResponse;
    try {
      res = await ctx.http.get<WorkableResponse>(
        `${HOST}/api/v1/widget/accounts/${this.tenant.account}?details=true`,
        { headers: { Accept: 'application/json' } },
      );
    } catch (e) {
      ctx.logger.warn(`[${this.config.key}] không gọi được API: ${(e as Error).message}`);
      return [];
    }

    const jobs: RawJob[] = [];
    for (const j of res.jobs ?? []) {
      if (!j.title) continue;
      const url = j.url ?? j.shortlink ?? j.application_url;
      if (!url) continue;

      jobs.push({
        source: this.config.key,
        sourceUrl: url,
        externalId: j.shortcode ?? j.code ?? null,
        title: j.title,
        companyName: this.tenant.company,
        locationRaw: [j.city, j.state, j.country].filter(Boolean).join(', ') || null,
        description: j.description ? stripHtml(j.description) : null,
        descriptionHtml: j.description ?? null,
        employmentTypeRaw: j.employment_type ?? null,
        postedAtRaw: j.published_on ?? j.created_at ?? null,
        raw: j as unknown as Record<string, unknown>,
      });
    }
    return jobs;
  }
}

/** Workable trả mô tả dạng HTML; classifier chỉ cần text thuần. */
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

export const WORKABLE_TENANTS: WorkableTenant[] = [
  {
    key: 'bwenergy',
    label: 'BW Energy Careers',
    company: 'BW Energy',
    companyType: CompanyType.IOC,
    account: 'bw-energy',
  },
  {
    key: 'assala',
    label: 'Assala Energy Careers',
    company: 'Assala Energy',
    companyType: CompanyType.IOC,
    account: 'assala-energy',
  },
];
