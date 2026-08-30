import * as cheerio from 'cheerio';
import { CompanyType, RawJob, SourceConfig, SourceStrategy, parseFlexibleDate, sleep } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';
import {
  extractJobPostingJsonLd,
  formatJsonLdLocation,
  formatJsonLdSalary,
} from './rigzone.scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  GENERIC HTML SCRAPER (cấu hình bằng dữ liệu, không cần code mới)
 * ══════════════════════════════════════════════════════════════
 *  Dùng cho các job board / career site render server-side.
 *  Thêm nguồn mới = thêm 1 object vào GENERIC_SOURCES, KHÔNG viết class mới.
 *
 *  Ưu tiên đọc JSON-LD (schema.org/JobPosting) ở trang chi tiết vì
 *  đó là dữ liệu có cấu trúc, bền vững hơn selector CSS.
 */
export interface GenericSourceDef {
  key: string;
  label: string;
  company?: string;
  companyType: CompanyType;
  baseUrl: string;
  /** {keyword} và {page} sẽ được thay thế */
  searchUrlTemplate: string;
  keywords: string[];
  /** Trang bắt đầu: 0 hay 1 tùy site */
  firstPage: number;
  maxPages: number;
  selectors: {
    card: string;
    title: string;
    company?: string;
    location?: string;
    salary?: string;
    posted?: string;
    snippet?: string;
    detailBody?: string;
  };
  enabled: boolean;
  notes?: string;
}

export class GenericHtmlScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly def: GenericSourceDef) {
    super();
    this.config = {
      key: def.key,
      label: def.label,
      strategy: SourceStrategy.HTTP_CHEERIO,
      baseUrl: def.baseUrl,
      defaultCompany: def.company,
      companyType: def.companyType,
      enabled: def.enabled,
      maxPages: def.maxPages,
      priority: 3,
      notes: def.notes,
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const s = this.def.selectors;

    for (const keyword of this.def.keywords) {
      for (
        let page = this.def.firstPage;
        page < this.def.firstPage + Math.min(ctx.maxPages, this.def.maxPages);
        page++
      ) {
        const url = this.def.searchUrlTemplate
          .replace('{keyword}', encodeURIComponent(keyword))
          .replace('{page}', String(page));

        let html: string;
        try {
          html = await ctx.http.get<string>(url);
        } catch (e) {
          ctx.logger.warn(`[${this.def.key}] ${url}: ${(e as Error).message}`);
          break;
        }

        const $ = cheerio.load(html);
        const cards = $(s.card);
        if (cards.length === 0) break;

        cards.each((_, el) => {
          const $c = $(el);
          const $t = $c.find(s.title).first();
          const title = this.clean($t.text());
          const href = $t.attr('href') ?? $c.find('a').first().attr('href');
          if (!title || !href) return;

          const posted = s.posted ? this.clean($c.find(s.posted).first().text()) : null;
          jobs.push({
            source: this.def.key,
            sourceUrl: this.absoluteUrl(href, this.def.baseUrl),
            externalId: null,
            title,
            companyName: s.company ? this.clean($c.find(s.company).first().text()) : (this.def.company ?? null),
            locationRaw: s.location ? this.clean($c.find(s.location).first().text()) : null,
            salaryRaw: s.salary ? this.clean($c.find(s.salary).first().text()) : null,
            postedAtRaw: posted,
            postedAt: parseFlexibleDate(posted),
            description: s.snippet ? this.clean($c.find(s.snippet).first().text()) : null,
            raw: { keyword, page },
          });
        });

        await sleep(150);
      }
    }

    return jobs;
  }

  protected async enrich(job: RawJob, ctx: ScrapeContext): Promise<RawJob> {
    const html = await ctx.http.get<string>(job.sourceUrl);
    const $ = cheerio.load(html);
    const ld = extractJobPostingJsonLd($);

    const bodySel = this.def.selectors.detailBody ?? '[itemprop="description"], .job-description, main';
    const bodyHtml = $(bodySel).first().html();

    return {
      ...job,
      companyName: ld?.hiringOrganization?.name ?? job.companyName ?? this.def.company ?? null,
      locationRaw: formatJsonLdLocation(ld) ?? job.locationRaw,
      salaryRaw: formatJsonLdSalary(ld) ?? job.salaryRaw ?? null,
      employmentTypeRaw:
        (Array.isArray(ld?.employmentType) ? ld?.employmentType[0] : ld?.employmentType) ?? null,
      postedAt: job.postedAt ?? parseFlexibleDate(ld?.datePosted ?? null),
      description: this.toPlainText(bodyHtml ?? ld?.description ?? null) ?? job.description,
      descriptionHtml: bodyHtml ?? null,
    };
  }
}

/**
 * Danh mục nguồn cấu hình sẵn.
 * ⚠️ Selector và URL cần kiểm chứng lại trước khi bật `enabled: true`
 * trên production (mỗi site đổi giao diện độc lập).
 * Bật/tắt từng nguồn không cần deploy lại code: sửa cờ rồi restart.
 */
export const GENERIC_SOURCES: GenericSourceDef[] = [
  {
    key: 'oilandgasjobsearch',
    label: 'Oil and Gas Job Search',
    companyType: CompanyType.JOB_BOARD,
    baseUrl: 'https://www.oilandgasjobsearch.com',
    searchUrlTemplate: 'https://www.oilandgasjobsearch.com/jobs?keywords={keyword}&page={page}',
    keywords: ['reservoir engineer', 'petroleum engineer', 'production engineer', 'geoscience'],
    firstPage: 1,
    maxPages: 5,
    selectors: {
      card: '.job-result, .job-item, article.job',
      title: 'h2 a, h3 a, a.job-title',
      company: '.company, .employer',
      location: '.location',
      salary: '.salary',
      posted: '.date, time',
      snippet: '.summary, .job-summary',
      detailBody: '.job-description, #job-description',
    },
    // TẮT trong đợt rà soát 2026-08-30, hai lý do độc lập:
    //  1. Job board bên thứ ba — cùng vấn đề ToU như rigzone.
    //  2. Selector bên trên CHƯA TỪNG được xác minh, khác với mọi nguồn khác
    //     đều có ghi chú "xác minh <ngày>". Nhiều khả năng nó vẫn luôn trả về 0.
    enabled: false,
    notes: 'TẮT: job board bên thứ ba + selector chưa xác minh (rà soát 2026-08-30)',
  },
  {
    key: 'totalenergies',
    label: 'TotalEnergies Careers',
    company: 'TotalEnergies',
    companyType: CompanyType.IOC,
    baseUrl: 'https://careers.totalenergies.com',
    searchUrlTemplate: 'https://careers.totalenergies.com/en/search-jobs?keyword={keyword}&page={page}',
    keywords: ['reservoir', 'petroleum', 'production engineer', 'geoscience'],
    firstPage: 1,
    maxPages: 3,
    selectors: {
      card: '.job-card, li.job-item, article',
      title: 'a.job-title, h3 a, a',
      location: '.job-location, .location',
      posted: '.job-date, time',
      detailBody: '.job-description, .description',
    },
    enabled: false,
    notes: 'Bật sau khi xác nhận selector thực tế',
  },
  // ADNOC đã chuyển sang PhenomScraper (xem phenom.scraper.ts): cổng thật là
  // jobs.adnoc.ae chạy Phenom People, không phải SuccessFactors ở careers.adnoc.ae.
  {
    key: 'aramco',
    label: 'Saudi Aramco Careers',
    company: 'Saudi Aramco',
    companyType: CompanyType.NOC,
    baseUrl: 'https://careers.aramco.com',
    // Cổng GỐC, không phải /saudi/. Đã kiểm tra 2026-08-30:
    //   /saudi/search/?q=reservoir  -> 0 kết quả, chỉ có tin tuyển chung chung
    //   /search/?q=reservoir        -> 6 kết quả gồm "Gas Reservoir Engineer",
    //                                  "Reservoir Engineer", "Brine Reservoir Engineer"
    // Nhánh /saudi/ dành riêng cho ứng viên Saudi nên không đăng chức danh cụ thể.
    searchUrlTemplate: 'https://careers.aramco.com/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'production engineer', 'geologist', 'petrophysicist'],
    firstPage: 0,
    // maxPages = 1 là CỐ Ý. `{page}` được thay bằng số trang (0,1,2…) nhưng
    // SuccessFactors dùng `startrow` theo bước 25 (0,25,50…). Đặt >1 sẽ gọi
    // startrow=1 rồi startrow=2 — trùng gần hết trang đầu, tốn request vô ích.
    // Mỗi từ khóa của Aramco hiện chỉ ra dưới 25 kết quả nên trang đầu là đủ.
    // Cần lấy sâu hơn thì phải sửa GenericHtmlScraper để nhân {page} với bước nhảy.
    maxPages: 1,
    selectors: {
      // SAP SuccessFactors RMK render bảng phía server -> Cheerio đọc được,
      // không cần trình duyệt. Cấu trúc xác minh từ HTML thật.
      card: 'tr.data-row',
      title: 'a.jobTitle-link',
      location: '.jobLocation, span.jobLocation',
      posted: '.jobDate, span.jobDate',
      detailBody: '.job, .jobDescriptionSection, [itemprop="description"]',
    },
    // TẮT sau khi chạy thật 2026-08-30: mất 939 giây (15,6 phút) rồi trả về
    // found=0 mà không ghi nhận lỗi nào — mọi request đều treo rồi bị bắt lỗi.
    // Kiểm tra ngay sau đó bằng trình duyệt thật: careers.aramco.com không tải
    // nổi, dù một tiếng trước vẫn vào bình thường. Site đang chặn/giới hạn
    // truy cập tự động.
    //
    // KHÔNG lách bằng cách giả User-Agent trình duyệt: đó là vượt rào chống bot.
    // Selector bên dưới đã xác minh đúng, nên nếu sau này họ mở lại thì chỉ cần
    // đổi enabled thành true.
    enabled: false,
    notes: 'SuccessFactors RMK · selector đúng nhưng site chặn bot (đo 2026-08-30)',
  },
  {
    key: 'exxonmobil',
    label: 'ExxonMobil Careers',
    company: 'ExxonMobil',
    companyType: CompanyType.IOC,
    baseUrl: 'https://jobs.exxonmobil.com',
    searchUrlTemplate: 'https://jobs.exxonmobil.com/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'geologist', 'geoscientist', 'production engineer'],
    firstPage: 0,
    // Mỗi trang SuccessFactors trả 25 dòng; "reservoir" hiện ra 24 kết quả nên
    // một trang là đủ. Xem ghi chú ở nguồn aramco về việc {page} không khớp
    // bước nhảy startrow.
    maxPages: 1,
    selectors: {
      card: 'tr.data-row',
      title: 'a.jobTitle-link',
      location: 'span.jobLocation',
      posted: 'span.jobDate',
      detailBody: '.job, .jobDescriptionSection, [itemprop="description"]',
    },
    enabled: true,
    // Xác minh 2026-08-30: "reservoir" -> 24 tin gồm Reservoir Engineer –
    // Technology Development, Reservoir Simulation Engineer, Petroleum Engineer;
    // "geologist" -> 6 tin gồm Unconventional Operations Geologist.
    notes: 'SuccessFactors RMK · xác minh 2026-08-30 · nguồn giàu tin nhất nhóm IOC',
  },
  {
    key: 'harbourenergy',
    label: 'Harbour Energy Careers',
    company: 'Harbour Energy',
    companyType: CompanyType.IOC,
    baseUrl: 'https://careers.harbourenergy.com',
    searchUrlTemplate: 'https://careers.harbourenergy.com/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'production', 'subsurface', 'geoscience'],
    firstPage: 0,
    // Toàn site chỉ có 10 tin -> một trang là đủ. Xem ghi chú ở nguồn aramco
    // về việc {page} không khớp bước nhảy startrow của SuccessFactors.
    maxPages: 1,
    selectors: {
      card: 'tr.data-row',
      title: 'a.jobTitle-link',
      location: 'span.jobLocation',
      posted: 'span.jobDate',
      detailBody: '.job, .jobDescriptionSection, [itemprop="description"]',
    },
    enabled: true,
    // Xác minh 2026-08-30: 10 tin toàn site, trong đó có "Reservoir Engineering
    // Advisor" và "Production Engineering Advisor" (Stavanger, NO).
    notes: 'SuccessFactors RMK · xác minh 2026-08-30',
  },
  {
    key: 'tullow',
    label: 'Tullow Oil Careers',
    company: 'Tullow Oil',
    companyType: CompanyType.IOC,
    baseUrl: 'https://careers.tullowoil.com',
    searchUrlTemplate: 'https://careers.tullowoil.com/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'production', 'geoscience'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      card: 'tr.data-row',
      title: 'a.jobTitle-link',
      location: 'span.jobLocation',
      posted: 'span.jobDate',
      detailBody: '.job, .jobDescriptionSection, [itemprop="description"]',
    },
    enabled: true,
    // Xác minh 2026-08-30: Tullow đang mở ĐÚNG 1 vị trí trên toàn site
    // ("Finance Business Advisor"), không thuộc 4 nhóm ngành. Vẫn bật vì cấu
    // hình đã đúng và chỉ tốn 4 request/ngày — có tin mới là tự vào.
    notes: 'SuccessFactors RMK · hiện chỉ 1 tin, không thuộc nhóm mục tiêu',
  },
];
