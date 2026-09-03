import { CompanyType, RawJob, SourceConfig, SourceStrategy } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  SLB CAREERS  ·  https://careers.slb.com
 * ══════════════════════════════════════════════════════════════
 *  LỊCH SỬ, vì đây là nguồn tốn nhiều công nhất trong cả app:
 *
 *  Bản cũ dùng Playwright vì trang danh sách render bằng JavaScript. Nó không
 *  bao giờ chạy được: lớp phủ xin phép cookie che kết quả, và không bắt được
 *  request XHR nào để đọc thẳng. Nguồn nằm im ở `enabled: false` suốt.
 *
 *  Thử lại bằng mẹo sitemap (cách đã cứu INPEX) cũng KHÔNG được:
 *  careers.slb.com/sitemap.xml có 213 địa chỉ nhưng toàn trang giới thiệu,
 *  không có mục /job/ nào.
 *
 *  Đường đi được nằm ở chỗ khác: tìm kiếm việc làm của SLB chạy trên COVEO
 *  (thấy qua thẻ script `js-atomic-job-listing-search.js`). Cả bốn tham số cần
 *  thiết nằm trong input ẩn của trang /job-listing, mà trang đó dựng sẵn ở máy
 *  chủ — đọc được bằng một request thường:
 *
 *      #organizationId   -> schlumbergerproduction0cs2zrh7
 *      #accessToken      -> khoá API công khai của Coveo
 *      #searchHub        -> CoveoJobsHub
 *      #searchsource     -> ATS_Jobs_Source - Prod
 *
 *  rồi gọi:
 *      POST https://<org>.org.coveo.com/rest/search/v2
 *
 *  VÌ SAO ĐỌC KHOÁ TỪ TRANG MỖI LẦN CHẠY, KHÔNG GHI CỨNG VÀO CODE
 *  --------------------------------------------------------------
 *  Khoá này SLB tự phát cho trình duyệt khách và có thể đổi bất cứ lúc nào.
 *  Ghi cứng thì ngày nó đổi, nguồn sẽ chết lặng lẽ. Đọc lại mỗi lần chạy tốn
 *  thêm đúng một request.
 *
 *  Đã xác minh 2026-09-03: HTTP 200; lọc theo nguồn việc làm ra 979 tin;
 *  "reservoir engineer" 43 tin, "petrophysicist" 26 tin, kèm thành phố, quốc
 *  gia, mô tả và ngày đăng.
 */

const HOST = 'https://careers.slb.com';
const LISTING_PAGE = `${HOST}/job-listing`;

/** Coveo trả tối đa 100 kết quả/lần; 50 là mức vừa phải cho cả hai phía. */
const PAGE_SIZE = 50;

/**
 * Số trang lấy cho mỗi từ khoá. Khai riêng ở đây thay vì đọc `config.maxPages`
 * lúc chạy: trường đó là tuỳ chọn trong SourceConfig nên kiểu của nó có thể
 * `undefined`, dùng thẳng trong vòng lặp sẽ khiến vòng lặp không chạy lần nào.
 */
const MAX_PAGES = 2;

const SEARCH_TERMS = [
  'reservoir engineer',
  'petroleum engineer',
  'production engineer',
  'petrophysicist',
  'geologist',
  'geophysicist',
  'geoscientist',
  'subsurface',
];

interface CoveoConfig {
  org: string;
  token: string;
  searchHub: string;
  source: string;
}

interface CoveoResult {
  title?: string;
  clickUri?: string;
  raw?: {
    title?: string;
    city?: string;
    country?: string | string[];
    category?: string | string[];
    jobexperiencelevel?: string | string[];
    description?: string;
    date?: number;
    permanentid?: string;
    clickableuri?: string;
  };
}

interface CoveoResponse {
  totalCount?: number;
  results?: CoveoResult[];
}

export class SlbScraper extends BaseScraper {
  readonly config: SourceConfig = {
    key: 'slb',
    label: 'SLB Careers',
    strategy: SourceStrategy.JSON_API,
    baseUrl: HOST,
    defaultCompany: 'SLB',
    companyType: CompanyType.SERVICE,
    enabled: true,
    // Mỗi từ khoá lấy tối đa 2 trang × 50 = 100 tin. Với 8 từ khoá là 16 request,
    // đủ phủ hết phần liên quan trong 979 tin mà không quét cả kho.
    maxPages: MAX_PAGES,
    priority: 2,
    notes: 'Coveo Search API · khoá đọc lại từ trang mỗi lần chạy',
  };

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const cfg = await this.readCoveoConfig(ctx);
    if (!cfg) return [];

    const jobs: RawJob[] = [];

    for (const term of SEARCH_TERMS) {
      for (let page = 0; page < MAX_PAGES; page++) {
        let res: CoveoResponse;
        try {
          res = await ctx.http.post<CoveoResponse>(
            `https://${cfg.org}.org.coveo.com/rest/search/v2`,
            {
              q: term,
              numberOfResults: PAGE_SIZE,
              firstResult: page * PAGE_SIZE,
              searchHub: cfg.searchHub,
              // Giới hạn trong kho tin tuyển dụng. Thiếu bộ lọc này thì Coveo
              // trả về cả chỉ mục website (đo được 315.143 tài liệu).
              aq: `@source=="${cfg.source}"`,
            },
            { headers: { Authorization: `Bearer ${cfg.token}` } },
          );
        } catch (e) {
          ctx.logger.warn(`[slb] "${term}" trang ${page}: ${(e as Error).message}`);
          break;
        }

        const results = res.results ?? [];
        for (const r of results) {
          const job = toRawJob(r, this.config.key);
          if (job) jobs.push(job);
        }

        if (results.length < PAGE_SIZE) break;
      }
    }

    ctx.logger.log(`[slb] ${SEARCH_TERMS.length} từ khoá -> ${jobs.length} tin (trước khử trùng lặp)`);
    return jobs;
  }

  /**
   * Lấy 4 tham số Coveo từ input ẩn của trang danh sách.
   * Trả null nếu thiếu bất kỳ tham số nào — thà không thu thập còn hơn gọi API
   * bằng tham số đoán mò rồi nhận về dữ liệu của kho khác.
   */
  private async readCoveoConfig(ctx: ScrapeContext): Promise<CoveoConfig | null> {
    let html: string;
    try {
      html = await ctx.http.get<string>(LISTING_PAGE);
    } catch (e) {
      ctx.logger.warn(`[slb] không tải được trang danh sách: ${(e as Error).message}`);
      return null;
    }

    const read = (id: string): string | null => {
      // Thuộc tính value có thể đứng trước hoặc sau id tuỳ cách render.
      const m =
        new RegExp(`id="${id}"[^>]*value="([^"]*)"`, 'i').exec(html) ??
        new RegExp(`value="([^"]*)"[^>]*id="${id}"`, 'i').exec(html);
      return m?.[1]?.trim() || null;
    };

    const org = read('organizationId');
    const token = read('accessToken');
    const searchHub = read('searchHub');
    const source = read('searchsource');

    if (!org || !token || !searchHub || !source) {
      ctx.logger.warn(
        `[slb] thiếu tham số Coveo trên trang (org=${!!org} token=${!!token} hub=${!!searchHub} source=${!!source}) — trang có thể đã đổi cấu trúc`,
      );
      return null;
    }
    return { org, token, searchHub, source };
  }
}

function toRawJob(r: CoveoResult, source: string): RawJob | null {
  const raw = r.raw ?? {};
  const title = (raw.title ?? r.title ?? '').trim();
  const url = raw.clickableuri ?? r.clickUri;
  if (!title || !url) return null;

  return {
    source,
    // Mã tin của SLB CÓ CHỨA khoảng trắng ("...id=EF13810-en_US 1"). Đã kiểm
    // chứng: bỏ phần sau khoảng trắng thì trang trả về 46KB không có nội dung
    // tin, giữ nguyên thì 107KB có đủ. Nên mã hoá chứ tuyệt đối không cắt.
    sourceUrl: url.trim().replace(/ /g, '%20'),
    externalId: raw.permanentid ?? null,
    title,
    companyName: 'SLB',
    locationRaw: formatLocation(raw.city, raw.country),
    description: stripCdataHtml(raw.description),
    descriptionHtml: null,
    employmentTypeRaw: null,
    postedAtRaw: raw.date ? new Date(raw.date).toISOString() : null,
    raw: raw as unknown as Record<string, unknown>,
  };
}

/**
 * Ghép thành phố với quốc gia.
 *
 * Bỏ "Multi-Location": đó là chữ SLB dùng cho tin tuyển nhiều nơi, không phải
 * tên thành phố. Giữ lại sẽ khiến normalizer lấy nó làm city và hiện lên giao
 * diện như một địa danh có thật.
 */
function formatLocation(city?: string, country?: string | string[]): string | null {
  const c = Array.isArray(country) ? country[0] : country;
  const realCity = city && !/multi-?location/i.test(city) ? city : null;
  return [realCity, c].filter(Boolean).join(', ') || null;
}

/** Coveo trả mô tả bọc trong CDATA và còn nguyên thẻ HTML. */
function stripCdataHtml(v?: string): string | null {
  if (!v) return null;
  return (
    v
      .replace(/^\s*<!\[CDATA\[/, '')
      .replace(/\]\]>\s*$/, '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s{2,}/g, ' ')
      .trim() || null
  );
}
