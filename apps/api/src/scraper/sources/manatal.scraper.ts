import { CompanyType, RawJob, SourceStrategy, SourceConfig } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  MANATAL  ·  careers-page.com
 * ══════════════════════════════════════════════════════════════
 *  Manatal là ATS gốc Singapore, khá phổ biến với công ty dầu khí độc lập ở
 *  Đông Nam Á và Trung Đông. Trang tuyển dụng công khai nằm ở
 *  `careers-page.com/<account>`, chạy Vue nên Cheerio chỉ đọc được 20 tin đầu
 *  của bản dựng sẵn.
 *
 *  Nhưng Manatal có API JSON mở, không cần khoá:
 *
 *      GET https://api.manatal.com/open/v3/career-page/<account>/jobs/?page=N
 *
 *  Trả về dạng phân trang chuẩn Django REST ({count, next, previous, results}),
 *  10 tin mỗi trang, KÈM mô tả HTML đầy đủ. Không cần mở trang chi tiết.
 *
 *  Đã xác minh 2026-09-01 với Mubadala Energy: HTTP 200, count = 47, lấy đủ
 *  47 tin qua 5 trang. Địa điểm trả về TÊN nước ("Indonesia", "United Arab
 *  Emirates") chứ không phải mã, khớp thẳng với bảng alias của normalizer.
 */
export interface ManatalTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** Định danh trong URL: careers-page.com/<account> */
  account: string;
  enabled?: boolean;
}

interface ManatalJob {
  id?: number;
  /** Mã dùng trong URL trang tin, vd 'RY796WR6' */
  hash?: string;
  position_name?: string;
  description?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  location_display?: string | null;
  is_remote?: boolean;
  contract_details?: string | null;
}

interface ManatalPage {
  count?: number;
  next?: string | null;
  results?: ManatalJob[];
}

const API = 'https://api.manatal.com/open/v3/career-page';
const BOARD = 'https://www.careers-page.com';

/** Chặn vòng lặp vô hạn nếu API trả `next` sai. 40 trang × 10 = 400 tin. */
const MAX_PAGES = 40;

export class ManatalScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly t: ManatalTenant) {
    super();
    this.config = {
      key: t.key,
      label: t.label,
      strategy: SourceStrategy.JSON_API,
      baseUrl: BOARD,
      defaultCompany: t.company,
      companyType: t.companyType,
      enabled: t.enabled ?? true,
      maxPages: MAX_PAGES,
      notes: 'Manatal open API — phân trang 10 tin/trang, có sẵn mô tả đầy đủ',
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    let page = 1;

    // Đi theo `next` để biết khi nào hết, nhưng tự dựng URL bằng ?page=N thay vì
    // dùng thẳng `next`: Manatal trả `next` trỏ sang host core.api.manatal.com,
    // một tên miền khác với host ta gọi ban đầu. Đi theo nó là tự ý nhảy sang
    // host chưa kiểm chứng.
    while (page <= MAX_PAGES) {
      let res: ManatalPage;
      try {
        res = await ctx.http.get<ManatalPage>(`${API}/${this.t.account}/jobs/?page=${page}`, {
          headers: { Accept: 'application/json' },
        });
      } catch (e) {
        ctx.logger.warn(`[${this.config.key}] lỗi trang ${page}: ${(e as Error).message}`);
        break;
      }

      for (const j of res.results ?? []) {
        if (!j.position_name || !j.hash) continue;
        jobs.push({
          source: this.config.key,
          sourceUrl: `${BOARD}/${this.t.account}/job/${j.hash}`,
          externalId: j.hash,
          title: j.position_name,
          companyName: this.t.company,
          locationRaw: j.location_display ?? ([j.city, j.state, j.country].filter(Boolean).join(', ') || null),
          description: j.description ? stripHtml(j.description) : null,
          descriptionHtml: j.description ?? null,
          employmentTypeRaw: normalizeContract(j.contract_details),
          // Manatal không trả ngày đăng trong API công khai. Để null; normalizer
          // sẽ dùng thời điểm nhìn thấy lần đầu thay vì bịa ra một ngày.
          postedAtRaw: null,
          raw: j as unknown as Record<string, unknown>,
        });
      }

      if (!res.next) break;
      page++;
    }

    return jobs;
  }
}

/** 'full_time' -> 'Full-time' để khớp bộ nhận diện loại hợp đồng của normalizer. */
function normalizeContract(v?: string | null): string | null {
  if (!v) return null;
  return v.replace(/_/g, '-').replace(/\b\w/g, (c) => c.toUpperCase());
}

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

export const MANATAL_TENANTS: ManatalTenant[] = [
  {
    key: 'mubadalaenergy',
    label: 'Mubadala Energy Careers',
    company: 'Mubadala Energy',
    companyType: CompanyType.IOC,
    account: 'mubadalaenergy',
  },
];
