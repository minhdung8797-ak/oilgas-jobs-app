import * as cheerio from 'cheerio';
import { CompanyType, RawJob, SourceStrategy, SourceConfig } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  SUCCESSFACTORS CAREER SITE BUILDER  ·  qua sitemap.xml
 * ══════════════════════════════════════════════════════════════
 *  Bản SuccessFactors đời mới (Career Site Builder) dựng trang danh sách bằng
 *  React ở phía trình duyệt. Cheerio nhìn vào chỉ thấy khung rỗng — đúng loại
 *  trang từng làm tôi bó tay với SLB.
 *
 *  Nhưng SAP vẫn phát hành `sitemap.xml` để Google lập chỉ mục, và trang CHI
 *  TIẾT thì vẫn dựng sẵn ở máy chủ kèm microdata schema.org. Ghép hai thứ đó
 *  lại là đủ, không cần trình duyệt:
 *
 *      GET /sitemap.xml                    -> mọi tin đang mở + ngày cập nhật
 *      GET /job/<slug>/<id>/               -> itemprop="title", itemprop="description"
 *
 *  Dùng sitemap còn có cái lợi ngoài kỹ thuật: đó là tệp nhà tuyển dụng CHỦ Ý
 *  công bố cho máy đọc, nên không phải mò mẫm phần họ không định cho ai lấy.
 *
 *  TIÊU ĐỀ LẤY Ở ĐÂU
 *  -----------------
 *  Trong slug (`Perth-Senior-Marine-Advisor-WA`) có sẵn tiêu đề, nhưng dính cả
 *  thành phố ở đầu và mã bang ở cuối, mà không có ranh giới nào phân định. Nên:
 *   • Pha 1 (rẻ) chỉ đổi gạch nối thành dấu cách để prefilter có cái mà đọc.
 *   • Pha 2 lấy tiêu đề CHUẨN từ microdata, rồi trừ đúng các từ đó khỏi slug —
 *     phần thừa đầu là thành phố, phần thừa cuối là bang. Không đoán mò.
 *
 *  Đã xác minh 2026-09-01 với INPEX Australia: sitemap 3 tin, cả 3 tách đúng
 *  "Perth" / "WA" và lấy được mô tả dài ~5000 ký tự.
 */
export interface SfSitemapTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** Gốc cổng tuyển dụng, vd 'https://careers.inpex.com.au' */
  host: string;
  /** Tên nước ghép vào địa điểm — sitemap chỉ có thành phố và bang. */
  country: string;
  enabled?: boolean;
}

/**
 * Trần số trang chi tiết mở trong một lần chạy. Mỗi trang cách nhau
 * SCRAPER_REQUEST_DELAY_MS, nên 120 trang ≈ 5 phút — vẫn nằm gọn trong ngân
 * sách 30 phút của cron mà không dội request vào máy chủ của họ.
 */
const MAX_DETAIL = 120;

export class SfSitemapScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly t: SfSitemapTenant) {
    super();
    this.config = {
      key: t.key,
      label: t.label,
      strategy: SourceStrategy.HTTP_CHEERIO,
      baseUrl: t.host,
      defaultCompany: t.company,
      companyType: t.companyType,
      enabled: t.enabled ?? true,
      maxPages: 1,
      notes: 'SuccessFactors CSB — danh sách lấy từ sitemap.xml, chi tiết từ microdata',
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    let xml: string;
    try {
      xml = await ctx.http.get<string>(`${this.t.host}/sitemap.xml`);
    } catch (e) {
      ctx.logger.warn(`[${this.config.key}] không đọc được sitemap: ${(e as Error).message}`);
      return [];
    }

    const entries = [...xml.matchAll(/<loc>\s*([^<\s]*\/job\/([^/]+)\/(\d+)\/?)\s*<\/loc>(?:\s*<lastmod>\s*([^<\s]+))?/g)];
    if (entries.length === 0) {
      ctx.logger.warn(`[${this.config.key}] sitemap không có mục /job/ nào`);
      return [];
    }
    if (entries.length > MAX_DETAIL) {
      ctx.logger.warn(
        `[${this.config.key}] sitemap có ${entries.length} tin, chỉ xử lý ${MAX_DETAIL} tin đầu.`,
      );
    }

    return entries.slice(0, MAX_DETAIL).map(([, url, slug, id, lastmod]) => ({
      source: this.config.key,
      sourceUrl: url,
      externalId: id,
      // Tiêu đề tạm, chỉ để prefilter đọc. enrich() sẽ thay bằng bản chuẩn.
      title: slug.replace(/-/g, ' ').trim(),
      companyName: this.t.company,
      locationRaw: this.t.country,
      description: null,
      descriptionHtml: null,
      employmentTypeRaw: null,
      postedAtRaw: lastmod ?? null,
      raw: { slug, id },
    }));
  }

  protected async enrich(job: RawJob, ctx: ScrapeContext): Promise<RawJob> {
    const html = await ctx.http.get<string>(job.sourceUrl);
    const $ = cheerio.load(html);

    const title = $('[itemprop="title"]').first().text().trim();
    const descEl = $('[itemprop="description"]').first();
    const descriptionHtml = descEl.length ? descEl.html() : null;

    // Không có tiêu đề chuẩn thì giữ nguyên bản từ slug còn hơn ghi đè bằng rỗng.
    if (!title) return { ...job, descriptionHtml, description: descEl.text().trim() || null };

    const slug = String((job.raw as { slug?: string })?.slug ?? '');
    const { city, state } = splitSlug(slug, title);

    return {
      ...job,
      title,
      locationRaw: [city, state, this.t.country].filter(Boolean).join(', '),
      description: descEl.text().replace(/\s{2,}/g, ' ').trim() || null,
      descriptionHtml,
    };
  }
}

/**
 * Trừ tiêu đề khỏi slug để lấy phần thành phố (đứng trước) và bang (đứng sau).
 *
 * So khớp trên CHUỖI đã chuẩn hoá chứ không so từng token, vì số token hai bên
 * không nhất thiết bằng nhau: slug thay mọi ký hiệu bằng gạch nối, nên tiêu đề
 * "Senior R&D Geoscientist" (3 từ) thành "Senior-R-D-Geoscientist" (4 token).
 * So từng token sẽ trượt ở đúng những chức danh như vậy.
 *
 * Không tìm thấy tiêu đề trong slug thì trả rỗng cả hai — thà thiếu thành phố
 * còn hơn gán bừa một từ ngẫu nhiên làm địa điểm.
 */
function splitSlug(slug: string, title: string): { city: string | null; state: string | null } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const words = slug.split('-').filter(Boolean);
  const target = norm(title);
  if (!target) return { city: null, state: null };

  for (let i = 0; i < words.length; i++) {
    let acc = '';
    for (let j = i; j < words.length; j++) {
      acc += norm(words[j]);
      if (acc.length > target.length) break;
      if (acc === target) {
        return {
          city: i > 0 ? words.slice(0, i).join(' ') : null,
          state: words.slice(j + 1).join(' ') || null,
        };
      }
    }
  }
  return { city: null, state: null };
}

export const SF_SITEMAP_TENANTS: SfSitemapTenant[] = [
  {
    key: 'inpex',
    label: 'INPEX Australia Careers',
    company: 'INPEX',
    companyType: CompanyType.IOC,
    host: 'https://careers.inpex.com.au',
    country: 'Australia',
  },
];
