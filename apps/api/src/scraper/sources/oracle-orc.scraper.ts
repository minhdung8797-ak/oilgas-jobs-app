import { CompanyType, RawJob, SourceStrategy, SourceConfig } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  ORACLE RECRUITING CLOUD (ORC / Fusion Candidate Experience)
 * ══════════════════════════════════════════════════════════════
 *  Eni và nhiều tập đoàn châu Âu dùng nền tảng này. Trang careers là SPA
 *  hoàn toàn — HTML thô KHÔNG chứa một dòng dữ liệu job nào, nên Cheerio
 *  vô dụng. Nhưng phía sau có REST API công khai:
 *
 *      GET https://<fa-host>/hcmRestApi/resources/latest/recruitingCEJobRequisitions
 *          ?onlyData=true
 *          &expand=requisitionList.secondaryLocations
 *          &finder=findReqs;siteNumber=<CX_xxxx>,keyword=<kw>,limit=25
 *
 *  ⚠️ Điểm dễ sai nhất: API KHÔNG nằm ở domain đẹp (jobs.eni.com) mà ở host
 *  Oracle thật phía sau. Cách tìm: mở trang careers, xem HTML nguồn, tìm chuỗi
 *  "oraclecloud.com" — nó nằm trong URL favicon/script.
 *
 *  ⚠️ Điểm dễ sai thứ hai: thiếu tham số `expand` thì `requisitionList` trả về
 *  rỗng nhưng `TotalJobsCount` vẫn có số — dễ tưởng nhầm là API hỏng.
 *
 *  Đã xác minh 2026-08-30 với Eni: HTTP 200, "reservoir" -> 4 kết quả gồm
 *  "Reservoir Engineer @Abidjan, Cote d'Ivoire".
 */
export interface OracleOrcTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** Host Oracle thật, vd: https://fa-evkm-saasfaprod1.fa.ocs.oraclecloud.com */
  apiHost: string;
  /** Domain đẹp dùng để dựng URL cho người dùng bấm vào, vd: https://jobs.eni.com */
  publicHost: string;
  /** Mã site, vd: CX_1004 */
  siteNumber: string;
  /** Tiền tố đường dẫn trang chi tiết trên publicHost */
  jobPathPrefix: string;
  searchTerms?: string[];
  enabled?: boolean;
}

interface OrcRequisition {
  Id?: string;
  Title?: string;
  PostedDate?: string;
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  ShortDescriptionStr?: string;
  JobFamily?: string | null;
  ContractType?: string | null;
  JobSchedule?: string | null;
}

interface OrcResponse {
  items?: Array<{
    TotalJobsCount?: number;
    requisitionList?: OrcRequisition[];
  }>;
}

const DEFAULT_TERMS = ['reservoir', 'petroleum', 'production engineer', 'geoscience', 'petrophysicist', 'geophysicist'];
const PAGE_SIZE = 25;

export class OracleOrcScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly tenant: OracleOrcTenant) {
    super();
    this.config = {
      key: tenant.key,
      label: tenant.label,
      strategy: SourceStrategy.JSON_API,
      baseUrl: tenant.publicHost,
      defaultCompany: tenant.company,
      companyType: tenant.companyType,
      enabled: tenant.enabled ?? true,
      maxPages: 2,
      notes: 'Oracle Recruiting Cloud REST API — không cần Playwright',
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const terms = this.tenant.searchTerms ?? DEFAULT_TERMS;

    for (const keyword of terms) {
      for (let page = 0; page < Math.min(ctx.maxPages, this.config.maxPages ?? 2); page++) {
        const finder =
          `findReqs;siteNumber=${this.tenant.siteNumber},keyword=${keyword},` +
          `limit=${PAGE_SIZE},offset=${page * PAGE_SIZE},sortBy=POSTING_DATES_DESC`;
        const url =
          `${this.tenant.apiHost}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
          `?onlyData=true&expand=requisitionList.secondaryLocations&finder=${encodeURIComponent(finder)}`;

        let res: OrcResponse;
        try {
          res = await ctx.http.get<OrcResponse>(url, {
            headers: { Accept: 'application/json' },
          });
        } catch (e) {
          ctx.logger.warn(`[${this.config.key}] "${keyword}" trang ${page}: ${(e as Error).message}`);
          break;
        }

        const item = res.items?.[0];
        const batch = item?.requisitionList ?? [];
        if (batch.length === 0) break;

        for (const req of batch) {
          if (!req.Title || !req.Id) continue;
          jobs.push({
            source: this.config.key,
            sourceUrl: `${this.tenant.publicHost}${this.tenant.jobPathPrefix}/job/${req.Id}`,
            externalId: req.Id,
            title: req.Title,
            companyName: this.tenant.company,
            locationRaw: req.PrimaryLocation ?? req.PrimaryLocationCountry ?? null,
            description: req.ShortDescriptionStr ?? null,
            employmentTypeRaw: req.ContractType ?? req.JobSchedule ?? null,
            postedAtRaw: req.PostedDate ?? null,
            raw: req as unknown as Record<string, unknown>,
          });
        }

        const total = item?.TotalJobsCount ?? 0;
        if ((page + 1) * PAGE_SIZE >= total) break;
      }
    }

    return jobs;
  }
}

export const ORACLE_ORC_TENANTS: OracleOrcTenant[] = [
  {
    key: 'eni',
    label: 'Eni Careers',
    company: 'Eni',
    companyType: CompanyType.IOC,
    apiHost: 'https://fa-evkm-saasfaprod1.fa.ocs.oraclecloud.com',
    publicHost: 'https://jobs.eni.com',
    siteNumber: 'CX_1004',
    jobPathPrefix: '/en/sites/CX_1004',
    // Tìm kiếm của Eni quét cả phần mô tả nên trả về khá nhiều tin lạc đề
    // ("ACCOUNTANT" cũng khớp "reservoir"). Không sao: prefilter + classifier
    // sẽ loại chúng, còn giữ từ khóa rộng thì không bỏ sót tin thượng nguồn thật.
    searchTerms: ['reservoir', 'petroleum', 'geoscience', 'petrophysicist', 'drilling', 'geophysicist'],
  },
  {
    key: 'petronas',
    label: 'PETRONAS Careers',
    company: 'Petronas',
    companyType: CompanyType.NOC,
    apiHost: 'https://epuc.fa.ap1.oraclecloud.com',
    publicHost: 'https://careers.petronas.com',
    siteNumber: 'CX_1',
    jobPathPrefix: '/en/sites/CX_1',
    // Xác minh 2026-08-30: site này hiện chỉ có vài tin, và chúng là vị trí
    // GIẢNG VIÊN tại Universiti Teknologi PETRONAS (Perak) chứ không phải vị trí
    // vận hành. Vẫn bật vì tái dùng nguyên scraper Oracle, không tốn công thêm,
    // và Petronas có thể mở tuyển vị trí kỹ thuật qua đúng cổng này.
    searchTerms: ['reservoir', 'petroleum', 'geoscience', 'production engineer', 'geophysicist'],
  },
  {
    key: 'weatherford',
    label: 'Weatherford Careers',
    company: 'Weatherford',
    companyType: CompanyType.SERVICE,
    // Weatherford KHÔNG dùng Workday. Cấu hình cũ trỏ tới
    // weatherford.wd1.myworkdayjobs.com — trả về trang bảo trì của Workday.
    // Cổng thật là Oracle Recruiting Cloud; host Oracle lấy từ HTML của
    // careers.weatherford.com (tìm chuỗi "oraclecloud.com").
    apiHost: 'https://fa-exmi-saasfaprod1.fa.ocs.oraclecloud.com',
    publicHost: 'https://careers.weatherford.com',
    siteNumber: 'CX_1',
    jobPathPrefix: '/en/sites/CX_1',
    // Xác minh 2026-08-31: "reservoir" -> 3 tin gồm Operations Geoscience
    // Specialist (Sr. Reservoir Petrophysicist); "geologist" -> Operations
    // Geoscience Specialist IV – Geologist; "production engineer" -> 112 tin.
    searchTerms: ['reservoir', 'petroleum', 'geoscience', 'geologist', 'geophysicist', 'production engineer'],
  },
];
