import { CompanyType, RawJob, SourceStrategy, SourceConfig } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  PHENOM PEOPLE  ·  career site engine
 * ══════════════════════════════════════════════════════════════
 *  Nhiều công ty dầu khí Trung Đông và nhà thầu dịch vụ dùng nền tảng này
 *  (ADNOC, SLB…). Trang hiển thị bằng JavaScript, nhưng phía sau có một
 *  endpoint JSON gọi được bằng HTTP thuần — không cần Chromium:
 *
 *      POST https://<host>/widgets
 *      body: { ddoKey: "refineSearch", keywords, from, size, ... }
 *
 *  Nhờ vậy nguồn Phenom chạy được trên Render gói free 512 MB, khác với
 *  cách cũ phải dùng Playwright.
 *
 *  ⚠️ Endpoint này KHÔNG có tài liệu công khai. Đã xác minh thủ công
 *  2026-08-30 với ADNOC (HTTP 200, 12 kết quả cho "engineer").
 *  Nếu Phenom đổi giao thức, nguồn này fail độc lập, không ảnh hưởng nguồn khác.
 */
export interface PhenomTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** vd: https://jobs.adnoc.ae */
  host: string;
  /** Đường dẫn ngôn ngữ trong URL chi tiết, vd: "us/en" */
  localePath: string;
  searchTerms?: string[];
  enabled?: boolean;
}

interface PhenomJob {
  title?: string;
  jobId?: string;
  jobSeqNo?: string;
  city?: string;
  state?: string;
  country?: string;
  cityStateCountry?: string;
  location?: string;
  postedDate?: string;
  descriptionTeaser?: string;
  applyUrl?: string;
  type?: string;
  category?: string;
}

interface PhenomResponse {
  refineSearch?: {
    totalHits?: number;
    data?: { jobs?: PhenomJob[] };
  };
}

const DEFAULT_TERMS = ['reservoir', 'petroleum', 'production engineer', 'geoscience', 'petrophysicist'];
const PAGE_SIZE = 20;

export class PhenomScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly tenant: PhenomTenant) {
    super();
    this.config = {
      key: tenant.key,
      label: tenant.label,
      strategy: SourceStrategy.JSON_API,
      baseUrl: tenant.host,
      defaultCompany: tenant.company,
      companyType: tenant.companyType,
      enabled: tenant.enabled ?? true,
      maxPages: 3,
      notes: 'Phenom People /widgets JSON API — không cần Playwright',
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const terms = this.tenant.searchTerms ?? DEFAULT_TERMS;

    for (const keywords of terms) {
      for (let page = 0; page < Math.min(ctx.maxPages, this.config.maxPages ?? 3); page++) {
        let res: PhenomResponse;
        try {
          res = await ctx.http.post<PhenomResponse>(
            `${this.tenant.host}/widgets`,
            {
              lang: 'en_us',
              deviceType: 'desktop',
              country: 'us',
              pageName: 'search-results',
              ddoKey: 'refineSearch',
              sortBy: '',
              subsearch: '',
              from: page * PAGE_SIZE,
              jobs: true,
              counts: true,
              all_fields: ['category', 'country', 'state', 'city'],
              size: PAGE_SIZE,
              clearAll: false,
              jdsource: 'facets',
              isSliderEnable: false,
              pageId: 'page11',
              siteType: 'external',
              keywords,
              global: true,
              selected_fields: {},
              sort: { order: '', field: '' },
              locationData: {},
            },
            { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
          );
        } catch (e) {
          ctx.logger.warn(`[${this.config.key}] "${keywords}" trang ${page}: ${(e as Error).message}`);
          break;
        }

        const batch = res.refineSearch?.data?.jobs ?? [];
        if (batch.length === 0) break;

        for (const j of batch) {
          const raw = this.toRawJob(j);
          if (raw) jobs.push(raw);
        }

        // Hết dữ liệu thì dừng sớm, đỡ gọi thừa
        const total = res.refineSearch?.totalHits ?? 0;
        if ((page + 1) * PAGE_SIZE >= total) break;
      }
    }

    return jobs;
  }

  private toRawJob(j: PhenomJob): RawJob | null {
    if (!j.title) return null;

    // URL chi tiết của Phenom: /<locale>/job/<jobSeqNo>/<title-slug>
    // applyUrl đôi khi rỗng nên tự dựng lại từ jobSeqNo — đây là khóa
    // duy nhất của bản ghi, cũng dùng làm sourceUrl (unique trong DB).
    const slug = j.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const sourceUrl =
      j.applyUrl && j.applyUrl.startsWith('http')
        ? j.applyUrl
        : `${this.tenant.host}/${this.tenant.localePath}/job/${j.jobSeqNo ?? j.jobId}/${slug}`;

    const locationRaw =
      j.cityStateCountry ??
      j.location ??
      [j.city, j.state, j.country].filter(Boolean).join(', ') ??
      null;

    return {
      source: this.config.key,
      sourceUrl,
      externalId: j.jobId ?? j.jobSeqNo ?? null,
      title: j.title,
      companyName: this.tenant.company,
      locationRaw: locationRaw || null,
      description: j.descriptionTeaser ?? null,
      employmentTypeRaw: j.type ?? null,
      postedAtRaw: j.postedDate ?? null,
      raw: j as unknown as Record<string, unknown>,
    };
  }
}

export const PHENOM_TENANTS: PhenomTenant[] = [
  {
    key: 'adnoc',
    label: 'ADNOC Group Careers',
    company: 'ADNOC',
    companyType: CompanyType.NOC,
    host: 'https://jobs.adnoc.ae',
    localePath: 'us/en',
    // ADNOC hiện không có tin nào khớp "reservoir" hay "geologist" (đã kiểm tra
    // 2026-08-30) — kho tuyển của họ nghiêng về vận hành nhà máy. Giữ bộ từ khóa
    // rộng hơn để không bỏ sót khi họ mở tuyển các vị trí thượng nguồn.
    searchTerms: ['petroleum', 'reservoir', 'production engineer', 'geoscience', 'drilling', 'well'],
  },
];
