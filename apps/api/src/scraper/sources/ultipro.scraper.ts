import { CompanyType, RawJob, SourceStrategy, SourceConfig } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  UKG / ULTIPRO RECRUITING  ·  recruiting<N>.ultipro.com
 * ══════════════════════════════════════════════════════════════
 *  Nền tảng tuyển dụng của UKG (trước là Ultimate Software). Nhiều công ty dầu
 *  khí cỡ vừa ở Mỹ và Trung Đông dùng nó — HKN Energy là ca đầu tiên.
 *
 *  Cổng công khai có một endpoint JSON không cần đăng nhập:
 *
 *      POST https://recruiting<N>.ultipro.com/<TENANT>/JobBoard/<BOARD>/JobBoardView/LoadSearchResults
 *      body: { opportunitySearch: { Top, Skip, QueryString, OrderBy, Filters } }
 *
 *  Giống Workable ở điểm quan trọng nhất: endpoint KHÔNG cần từ khoá, một
 *  request trả về toàn bộ tin đang mở. Nên không bao giờ bỏ sót vì chọn sai từ
 *  khoá, đổi lại phần lớn tin trả về sẽ lạc đề (kế toán, đầu bếp, an ninh) —
 *  prefilter + classifier lo việc lọc, đúng như thiết kế.
 *
 *  VÌ SAO KHÔNG MỞ TRANG CHI TIẾT ĐỂ LẤY MÔ TẢ ĐẦY ĐỦ
 *  ---------------------------------------------------
 *  Trang `/OpportunityDetail?opportunityId=...` có chứa mô tả, nhưng nằm trong
 *  một khối JSON được nhúng vào chuỗi JavaScript và escape HAI LỚP
 *  (`<p>...`). Cheerio không thấy nó vì đó không phải HTML thật, còn
 *  bóc bằng regex thì sẽ vỡ ngay lần đầu UKG đổi cách render.
 *
 *  `BriefDescription` trong danh sách là mô tả thật do nhà tuyển dụng viết, đủ
 *  cho classifier và cho phần tóm tắt. Đánh đổi này khiến toàn bộ nguồn chỉ tốn
 *  ĐÚNG MỘT request thay vì 1 + N.
 *
 *  Đã xác minh 2026-09-01 với HKN Energy: HTTP 200, totalCount = 38, có
 *  "Production Engineer" ×3, "Senior Petroleum Engineer" ×2, "E&I Production
 *  Engineer". Trang chi tiết trả 200.
 */
export interface UltiproTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** Số trong hostname: recruiting2.ultipro.com -> 2 */
  host: string;
  /** Mã khách hàng trong URL, vd 'HIL1010HIDC' */
  tenant: string;
  /** GUID của job board */
  board: string;
  enabled?: boolean;
}

interface UltiproLocation {
  LocalizedDescription?: string | null;
  Address?: {
    City?: string | null;
    State?: { Name?: string | null; Code?: string | null } | null;
    Country?: { Name?: string | null; Code?: string | null } | null;
  } | null;
}

interface UltiproOpportunity {
  Id?: string;
  Title?: string;
  RequisitionNumber?: string | null;
  FullTime?: boolean;
  JobCategoryName?: string | null;
  Locations?: UltiproLocation[];
  PostedDate?: string | null;
  BriefDescription?: string | null;
}

interface UltiproResponse {
  opportunities?: UltiproOpportunity[];
  totalCount?: number;
}

/** Trần an toàn: chưa thấy job board dầu khí nào vượt con số này. */
const PAGE_SIZE = 200;

export class UltiproScraper extends BaseScraper {
  readonly config: SourceConfig;
  private readonly base: string;

  constructor(private readonly t: UltiproTenant) {
    super();
    this.base = `https://recruiting${t.host}.ultipro.com/${t.tenant}/JobBoard/${t.board}`;
    this.config = {
      key: t.key,
      label: t.label,
      strategy: SourceStrategy.JSON_API,
      baseUrl: `https://recruiting${t.host}.ultipro.com`,
      defaultCompany: t.company,
      companyType: t.companyType,
      enabled: t.enabled ?? true,
      maxPages: 1, // một request lấy hết
      notes: 'UKG/UltiPro JobBoard API — 1 request lấy toàn bộ tin đang mở',
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    let res: UltiproResponse;
    try {
      res = await ctx.http.post<UltiproResponse>(`${this.base}/JobBoardView/LoadSearchResults`, {
        opportunitySearch: {
          Top: PAGE_SIZE,
          Skip: 0,
          QueryString: '',
          OrderBy: [{ Value: 'postedDateDesc', PropertyName: 'PostedDate', Ascending: false }],
          Filters: [],
        },
      });
    } catch (e) {
      ctx.logger.warn(`[${this.config.key}] không gọi được API: ${(e as Error).message}`);
      return [];
    }

    const list = res.opportunities ?? [];
    if (res.totalCount && res.totalCount > list.length) {
      // Không im lặng bỏ sót: nếu công ty vượt trần thì phải biết mà thêm phân trang.
      ctx.logger.warn(
        `[${this.config.key}] có ${res.totalCount} tin nhưng chỉ lấy được ${list.length} — cần thêm phân trang.`,
      );
    }

    const jobs: RawJob[] = [];
    for (const o of list) {
      if (!o.Title || !o.Id) continue;

      jobs.push({
        source: this.config.key,
        sourceUrl: `${this.base}/OpportunityDetail?opportunityId=${o.Id}`,
        externalId: o.RequisitionNumber ?? o.Id,
        title: o.Title,
        companyName: this.t.company,
        locationRaw: formatLocation(o.Locations),
        // JobCategoryName ("HKN Well Services Department") là tín hiệu phân loại
        // tốt, ghép vào mô tả để classifier dùng được.
        description: [o.BriefDescription, o.JobCategoryName].filter(Boolean).join(' — ') || null,
        descriptionHtml: null,
        employmentTypeRaw: o.FullTime === true ? 'Full-time' : o.FullTime === false ? 'Part-time' : null,
        postedAtRaw: o.PostedDate ?? null,
        raw: o as unknown as Record<string, unknown>,
      });
    }
    return jobs;
  }
}

/**
 * Ghép địa điểm thành chuỗi mà normalizer đọc được.
 *
 * Dùng Country.Name ("Iraq") chứ KHÔNG dùng Country.Code — UltiPro trả mã
 * alpha-3 ("IRQ") trong khi bảng quốc gia của app đánh chỉ mục theo alpha-2
 * ("IQ"), nên đưa mã vào sẽ ra country = null.
 *
 * Bỏ qua Coordinates: HKN trả 39.76 / -98.50 cho mọi tin — đó là tâm địa lý
 * nước Mỹ, tức giá trị mặc định khi không định vị được, không phải toạ độ thật.
 */
function formatLocation(locs?: UltiproLocation[]): string | null {
  const a = locs?.[0]?.Address;
  if (!a) return locs?.[0]?.LocalizedDescription ?? null;
  return [a.City, a.State?.Name, a.Country?.Name].filter(Boolean).join(', ') || null;
}

export const ULTIPRO_TENANTS: UltiproTenant[] = [
  {
    key: 'hknenergy',
    label: 'HKN Energy Careers',
    company: 'HKN Energy',
    companyType: CompanyType.IOC,
    host: '2',
    tenant: 'HIL1010HIDC',
    board: 'd6b19ebf-299c-4e89-aaa6-bb9dd6df689c',
  },
];
