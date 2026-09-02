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
/**
 * ──────────────────────────────────────────────────────────────
 *  QUY TẮC CHỌN NGUỒN
 * ──────────────────────────────────────────────────────────────
 *  Chỉ nhận TRANG TUYỂN DỤNG CHÍNH THỨC CỦA CÔNG TY. Không nhận job board
 *  tổng hợp, cũng không nhận công ty tuyển dụng trung gian.
 *
 *  Lý do không phải chuyện pháp lý mà là TÍNH ĐÚNG CỦA DỮ LIỆU: app hiển thị
 *  `defaultCompany` của nguồn ở ô "công ty". Với trung gian, nhà tuyển dụng thật
 *  bị ẩn danh, nên ô đó sẽ ghi tên công ty tuyển dụng — người tìm việc đọc vào
 *  sẽ hiểu sai ai đang tuyển mình.
 *
 *  Các trường hợp đã xét và LOẠI:
 *   • rigzone, oilandgasjobsearch — job board, Terms of Use cấm thu thập
 *   • sofomation (xét 2026-08-31) — công ty tuyển dụng. Trang chi tiết chỉ ghi
 *     "Domain Industry: Oil & Gas", không nêu tên khách hàng. Ngoài ra 0/6 tin
 *     thuộc 4 nhóm ngành, tin cũ 6 tháng, và phân trang chạy bằng POST ajax nên
 *     chỉ lấy được trang đầu.
 *
 *  Muốn phá lệ thì phải thêm trường phân biệt "nhà tuyển dụng" với "đơn vị môi
 *  giới" trong DTO và hiển thị rõ trên giao diện — chưa làm.
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
  /**
   * Địa điểm dùng khi thẻ tin KHÔNG có ô địa điểm nào.
   *
   * Vài cổng SuccessFactors tắt hẳn cột địa điểm (Vår Energi, Origin). Thiếu nó
   * thì `country` thành null và tin biến mất khỏi bộ lọc quốc gia. Chỉ đặt cho
   * nhà tuyển dụng chỉ hoạt động ở MỘT nước — đặt bừa sẽ gán sai nước cho tin
   * ở nơi khác, mà sai kiểu đó trông vẫn hợp lệ nên rất khó phát hiện.
   */
  defaultLocation?: string;
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
            locationRaw:
              (s.location ? this.clean($c.find(s.location).first().text()) : null) ||
              this.def.defaultLocation ||
              null,
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
    keywords: ['reservoir engineer', 'petroleum engineer', 'production engineer', 'geoscience', 'geophysicist'],
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
    keywords: ['reservoir', 'petroleum', 'production engineer', 'geoscience', 'geophysicist'],
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
    keywords: ['reservoir', 'petroleum', 'production engineer', 'geologist', 'petrophysicist', 'geophysicist'],
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
    // ⚠️ TẮT. Lịch sử đầy đủ, vì đây là ca dễ chẩn đoán sai nhất trong cả app:
    //
    // 2026-08-30: chạy 939 giây -> found=0. Kết luận "site chặn bot". Tắt.
    // 2026-08-31: mở careers.aramco.com bằng trình duyệt -> 200 trong <500ms,
    //   "reservoir" ra 6 tin thật. Kết luận "chỉ bị tiết lưu tạm thời". Bật lại.
    // 2026-08-31 (sau đó): chạy lại từ Render -> 1131 giây, LẠI found=0.
    //
    // Kết luận đúng: Aramco chặn theo ĐỊA CHỈ IP TRUNG TÂM DỮ LIỆU. Trình duyệt
    // của tôi đi từ IP dân dụng nên vào được; scraper đi từ IP Render (Oregon)
    // nên bị chặn. Hai phép thử cho hai kết quả trái ngược vì chúng KHÔNG cùng
    // điều kiện — đó là chỗ tôi sai.
    //
    // Con số 1131 giây tự nó là bằng chứng: 6 từ khoá × 45 giây timeout × 4 lần
    // thử lại ≈ 1080 giây. Mọi request đều treo tới hết giờ chứ không bị từ chối
    // ngay — đúng đặc trưng của tường lửa chống bot, không phải lỗi cấu hình.
    //
    // BÀI HỌC CHUNG: mở được bằng trình duyệt KHÔNG chứng minh scraper vào được.
    // Phải đối chiếu bằng lần chạy thật từ Render, hoặc ít nhất coi kết quả từ
    // trình duyệt là chưa đủ. Áp dụng cho mọi nguồn mới.
    //
    // Muốn bật lại: cần proxy có IP dân dụng — nằm ngoài phạm vi bản $0/tháng.
    // KHÔNG lách bằng cách giả User-Agent trình duyệt: đó là vượt rào chống bot.
    // Selector bên dưới đã xác minh đúng, giữ nguyên để dùng lại sau này.
    enabled: false,
    notes: 'SuccessFactors RMK · selector đúng, nhưng Aramco chặn IP trung tâm dữ liệu (đo 2 lần: 939s và 1131s, đều found=0)',
  },
  {
    key: 'totalenergies',
    label: 'TotalEnergies Careers',
    company: 'TotalEnergies',
    companyType: CompanyType.IOC,
    baseUrl: 'https://jobs.totalenergies.com',
    // Nền tảng Avature. Ba cái bẫy, đều đã trả giá để tìm ra:
    //  1. careers.totalenergies.com chỉ là trang giới thiệu, không có tin nào.
    //  2. Gõ thẳng jobs.totalenergies.com sẽ bị đá sang đăng nhập Microsoft —
    //     đó là cổng NỘI BỘ. Đường dẫn /en_US/careers/ mới là cổng công khai.
    //  3. Tham số tìm kiếm là `search`, KHÔNG phải `keyword`. Dùng `keyword` thì
    //     server im lặng bỏ qua và luôn trả về 20 tin mới nhất — trông như đang
    //     chạy đúng nhưng thực chất mọi từ khoá cho cùng kết quả.
    searchUrlTemplate: 'https://jobs.totalenergies.com/en_US/careers/SearchJobs/?search={keyword}',
    keywords: ['reservoir', 'petroleum', 'geologist', 'geophysicist', 'production engineer'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      card: 'div.article--result',
      title: 'a',
      location: '.list-item-jobCountry',
      posted: '.list-item-jobCreationDate',
      detailBody: '.article__content, .job-description, [itemprop="description"]',
    },
    enabled: true,
    // Xác minh 2026-08-31: "geophysicist" -> Senior Geophysicist Redetermination,
    // Petrophysicist; "reservoir" -> Ingénieur Réservoir, Géophysicien.
    // Phần lớn tin bằng TIẾNG PHÁP — chỉ phân loại đúng nhờ normalizeText đã bỏ
    // dấu (xem packages/shared/src/utils.ts).
    notes: 'Avature · tham số là `search` · nhiều tin tiếng Pháp',
  },
  {
    key: 'halliburton',
    label: 'Halliburton Careers',
    company: 'Halliburton',
    companyType: CompanyType.SERVICE,
    baseUrl: 'https://jobs.halliburton.com',
    // Halliburton KHÔNG dùng Workday. Cấu hình cũ trỏ tới
    // halliburton.wd1.myworkdayjobs.com — địa chỉ không tồn tại, đó là lý do
    // nguồn này im lặng suốt. Cổng thật là SAP SuccessFactors ở đây.
    searchUrlTemplate: 'https://jobs.halliburton.com/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'geologist', 'geophysicist', 'production engineer'],
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
    // Xác minh 2026-08-31: "reservoir" -> 19 tin gồm Reservoir Engineering &
    // Geoscience Consultant, Reservoir Engineering Advisor, Geology Advisor;
    // "geologist" -> 10 tin gồm Logging Geologist II.
    notes: 'SuccessFactors RMK · xác minh 2026-08-31 · nguồn giàu tin nhất nhóm dịch vụ',
  },
  {
    key: 'exxonmobil',
    label: 'ExxonMobil Careers',
    company: 'ExxonMobil',
    companyType: CompanyType.IOC,
    baseUrl: 'https://jobs.exxonmobil.com',
    searchUrlTemplate: 'https://jobs.exxonmobil.com/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'geologist', 'geoscientist', 'production engineer', 'geophysicist'],
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
    key: 'perenco',
    label: 'Perenco Careers',
    company: 'Perenco',
    companyType: CompanyType.IOC,
    baseUrl: 'https://perenco-careers.talent-soft.com',
    // Nền tảng TalentSoft (Cegid). Trang perenco.com/job-offers chỉ là vỏ chứa
    // iframe trỏ tới đây — scrape trang vỏ sẽ không ra gì.
    //
    // {keyword} CỐ Ý không xuất hiện trong URL: cổng này chỉ có ~11 tin nên lấy
    // trọn danh sách một lần rẻ hơn và không bao giờ bỏ sót vì chọn sai từ khoá.
    // Vì vậy `keywords` bên dưới chỉ có MỘT phần tử — nhiều hơn sẽ tải trùng.
    searchUrlTemplate: 'https://perenco-careers.talent-soft.com/offre-de-emploi/liste-offres.aspx?LCID=2057',
    keywords: ['*'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      card: 'li.ts-offer-list-item',
      title: 'a.ts-offer-list-item__title-link',
      // Mô tả gộp cả ngày đăng, loại hợp đồng và khu vực:
      // "27/08/2026Permanent ContractAfrique centrale"
      location: '.ts-offer-list-item__description',
      detailBody: '.ts-offer-page, #description, .contenu',
    },
    enabled: true,
    // Xác minh 2026-08-31: 8 tin hiển thị, có "Field production Engineer".
    notes: 'TalentSoft · trang gốc là iframe trong perenco.com · xác minh 2026-08-31',
  },
  {
    key: 'trident',
    label: 'Trident Energy Careers',
    company: 'Trident Energy',
    companyType: CompanyType.IOC,
    baseUrl: 'https://tridentenergy-hr.my.salesforce-sites.com',
    // Salesforce Recruiting (Visualforce) — bảng render sẵn phía server.
    // Cũng nằm trong iframe của trang trident-energy.com, cùng lý do như Perenco.
    // Không có tham số từ khoá; lấy trọn bảng một lần.
    searchUrlTemplate: 'https://tridentenergy-hr.my.salesforce-sites.com/recruit/fRecruit__ApplyJobList',
    keywords: ['*'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      // Bỏ qua hàng tiêu đề: chỉ hàng dữ liệu mới có class `dataRow`.
      card: 'tr.dataRow',
      title: 'a[href*="fRecruit__ApplyJob"]',
      // Cột 4-5 là quốc gia và khu vực; lấy cả hàng rồi để normalizer tự tách.
      location: 'td.dataCell',
      detailBody: '.bPageBlock, .pbBody',
    },
    enabled: true,
    // Xác minh 2026-08-31: 9 tin, hiện toàn Brazil và nghiêng về tự động hoá,
    // đo lường, xây lắp — phần lớn sẽ bị classifier xếp OTHER. Vẫn bật vì Trident
    // là nhà điều hành thượng nguồn thực thụ, tin sẽ đổi.
    notes: 'Salesforce Recruiting · xác minh 2026-08-31',
  },
  {
    key: 'crescent',
    label: 'Crescent Petroleum Careers',
    company: 'Crescent Petroleum',
    companyType: CompanyType.IOC,
    baseUrl: 'https://careers.crescent.ae',
    // Lưu ý đường dẫn có tiền tố /CrescentPetroleum, khác các cổng SF khác.
    searchUrlTemplate: 'https://careers.crescent.ae/CrescentPetroleum/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'geologist', 'geophysicist', 'production engineer'],
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
    // Xác minh 2026-08-31: 8 tin toàn site, trong đó có "Lead Geologist" (Sharjah, AE).
    notes: 'SuccessFactors RMK · xác minh 2026-08-31',
  },
  {
    key: 'northoil',
    label: 'North Oil Company Careers',
    company: 'North Oil Company',
    companyType: CompanyType.NOC,
    baseUrl: 'https://careers.noc.qa',
    searchUrlTemplate: 'https://careers.noc.qa/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'geologist', 'geophysicist', 'production engineer'],
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
    // Xác minh 2026-08-31: cổng hoạt động nhưng chỉ có 3 tin toàn site
    // (Data Architect, Lead Subsea Operations, Controls & Assurance Developee)
    // và KHÔNG tin nào thuộc 4 nhóm mục tiêu. Vẫn bật vì cấu hình đã đúng,
    // chỉ tốn 5 request/ngày, có tin mới là tự vào.
    notes: 'SuccessFactors RMK · hiện chưa có tin thuộc nhóm mục tiêu',
  },
  {
    key: 'harbourenergy',
    label: 'Harbour Energy Careers',
    company: 'Harbour Energy',
    companyType: CompanyType.IOC,
    baseUrl: 'https://careers.harbourenergy.com',
    searchUrlTemplate: 'https://careers.harbourenergy.com/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'production', 'subsurface', 'geoscience', 'geophysicist'],
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
    keywords: ['reservoir', 'petroleum', 'production', 'geoscience', 'geophysicist'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      // Nhận CẢ HAI bố cục của SuccessFactors: bảng (`tr.data-row`) và tile
      // (`li.job-tile`). Woodside đã đổi sang tile, nên Tullow đổi lúc nào không
      // biết trước — mà nếu chỉ khai một kiểu thì hôm đổi sẽ thành "0 tin" im
      // lặng, trông hệt như công ty không tuyển, rất khó phát hiện.
      card: 'tr.data-row, li.job-tile',
      title: 'a.jobTitle-link',
      location: 'span.jobLocation, [id$="-section-location-value"]',
      posted: 'span.jobDate, [id$="-section-date-value"]',
      detailBody: '.job, .jobDescriptionSection, [itemprop="description"]',
    },
    enabled: true,
    // 2026-08-30: đúng 1 tin toàn site ("Finance Business Advisor").
    // 2026-09-01: kiểm tra lại — 0 tin, trang tìm kiếm không còn dòng nào.
    // Vẫn bật vì cấu hình đúng và chỉ tốn 5 request/ngày; có tin mới là tự vào.
    notes: 'SuccessFactors · 2026-09-01 không có tin nào đang mở',
  },
  {
    key: 'woodside',
    label: 'Woodside Energy Careers',
    company: 'Woodside Energy',
    companyType: CompanyType.IOC,
    baseUrl: 'https://careers.woodside.com.au',
    searchUrlTemplate: 'https://careers.woodside.com.au/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'production', 'geologist', 'geophysicist', 'petrophysicist'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      // Woodside dùng bố cục "tile" đời mới của SuccessFactors, KHÔNG phải bảng
      // `tr.data-row` như Tullow/Aramco. Cùng một nền tảng nhưng hai kiểu dựng
      // trang khác hẳn — selector không dùng chung được.
      card: 'li.job-tile',
      title: 'a.jobTitle-link',
      // Địa điểm nằm trong ô riêng có id kết thúc bằng '-section-location-value'.
      // Không dùng '.section-field.location' vì ô đó gồm cả nhãn chữ "Location",
      // lấy nguyên text sẽ ra "Location AU".
      location: '[id$="-section-location-value"]',
      posted: '[id$="-section-date-value"]',
      detailBody: '.job, .jobDescriptionSection, [itemprop="description"]',
    },
    enabled: true,
    // Xác minh 2026-09-01: 19 tin toàn site, có "Reservoir Engineer" và
    // "Senior Production Allocation Engineer - LA LNG".
    //
    // Hai điểm đã đo được, ghi lại để khỏi chẩn đoán lại:
    //  • Ô địa điểm chỉ chứa MÃ ISO 2 KÝ TỰ ('AU', 'MX', 'US') hoặc dạng
    //    'TX, US, 77056'. Normalizer có luật riêng cho hai dạng này.
    //  • Từ khoá không khớp thì máy chủ trả về TOÀN BỘ tin thay vì rỗng. Vô hại
    //    ở đây (khử trùng lặp theo URL rồi classifier lọc tiếp), nhưng đừng dựa
    //    vào số kết quả để kết luận từ khoá có khớp hay không.
    notes: 'SuccessFactors bố cục tile · 19 tin · địa điểm là mã ISO2',
  },
  {
    key: 'omv',
    label: 'OMV Careers',
    company: 'OMV',
    companyType: CompanyType.IOC,
    baseUrl: 'https://careers.omv.com',
    searchUrlTemplate: 'https://careers.omv.com/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'production', 'geologist', 'geophysicist', 'petrophysicist'],
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
    // Xác minh 2026-09-01: bố cục bảng, 24 dòng ở trang đầu. Địa điểm ghi đầy đủ
    // ("Bucharest, RO, 013329", "Schwechat, Lower Austria, AT, 2320") nên không
    // cần defaultLocation. Áo đã được thêm vào bảng quốc gia cho nguồn này.
    notes: 'SuccessFactors bố cục bảng · phần lớn tin ở Romania và Áo',
  },
  {
    key: 'varenergi',
    label: 'Vår Energi Careers',
    company: 'Vår Energi',
    companyType: CompanyType.IOC,
    baseUrl: 'https://jobs.varenergi.no',
    searchUrlTemplate: 'https://jobs.varenergi.no/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'production', 'geologist', 'geophysicist', 'subsurface'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      card: 'li.job-tile',
      title: 'a.jobTitle-link',
      // KHÔNG khai location: Vår Energi tắt hẳn cột địa điểm trên thẻ tin.
      posted: '[id$="-section-date-value"]',
      detailBody: '.job, .jobDescriptionSection, [itemprop="description"]',
    },
    // Vår Energi chỉ hoạt động ở Na Uy (Sandnes, Stavanger, Hammerfest), nên gán
    // mặc định là an toàn. Nếu sau này họ mở văn phòng nước khác thì phải bỏ dòng này.
    defaultLocation: 'Norway',
    enabled: true,
    // Xác minh 2026-09-01: 15 tin, có "Experienced Explorationists",
    // "Subsurface Professionals", "Experienced Drilling & Well Professionals".
    notes: 'SuccessFactors bố cục tile · thẻ tin không có ô địa điểm',
  },
  {
    key: 'origin',
    label: 'Origin Energy Careers',
    company: 'Origin Energy',
    companyType: CompanyType.IOC,
    baseUrl: 'https://careers.originenergy.com.au',
    searchUrlTemplate: 'https://careers.originenergy.com.au/search/?q={keyword}&startrow={page}',
    keywords: ['reservoir', 'petroleum', 'production engineer', 'geologist', 'subsurface'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      card: 'tr.data-row, li.job-tile',
      title: 'a.jobTitle-link',
      posted: 'span.jobDate, [id$="-section-date-value"]',
      detailBody: '.job, .jobDescriptionSection, [itemprop="description"]',
    },
    defaultLocation: 'Australia',
    enabled: true,
    // Xác minh 2026-09-01: bố cục bảng, ô địa điểm để trống trên mọi dòng.
    // Origin chủ yếu là bán lẻ điện/khí; phần thượng nguồn là APLNG nên số tin
    // thuộc 4 nhóm sẽ ít.
    notes: 'SuccessFactors · thẻ tin không có ô địa điểm · phần lớn tin ngoài ngành',
  },
  {
    key: 'santos',
    label: 'Santos Careers',
    company: 'Santos',
    companyType: CompanyType.IOC,
    baseUrl: 'https://recruitment.santos.com',
    searchUrlTemplate: 'https://recruitment.santos.com/careers/SearchJobs?search={keyword}&jobOffset={page}',
    keywords: ['reservoir', 'petroleum', 'production', 'geologist', 'geophysicist', 'subsurface'],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      card: 'article.article--result',
      title: 'h3.article__header__text__title a',
      // Dòng phụ ghi "Brisbane • Ref #ATR 611715 • Posted 20-Aug-2026". Trông lộn
      // xộn nhưng dùng được: normalizer tách chuỗi ở dấu '•' nên lấy đúng "Brisbane".
      location: '.article__header__text__subtitle',
      detailBody: '.article__content, [itemprop="description"]',
    },
    enabled: true,
    // Xác minh 2026-09-01: Avature, 13 tin, 6 tin/trang, HTML dựng sẵn ở máy chủ.
    // Tìm kiếm hoạt động THẬT (?search=reservoir trả 0 kết quả thay vì trả hết),
    // khác Woodside — nên từ khoá ở đây có ý nghĩa.
    notes: 'Avature · 13 tin · tìm kiếm theo từ khoá hoạt động đúng',
  },
  {
    key: 'ithaca',
    label: 'Ithaca Energy Vacancies',
    company: 'Ithaca Energy',
    companyType: CompanyType.IOC,
    baseUrl: 'https://www.ithacaenergy.com',
    // Trang này không có tham số tìm kiếm nào — mọi tin nằm trên một trang tĩnh.
    // Template không chứa {keyword}/{page} nên chỉ sinh đúng 1 request.
    searchUrlTemplate: 'https://www.ithacaenergy.com/careers/apply',
    keywords: [''],
    firstPage: 0,
    maxPages: 1,
    selectors: {
      card: '.CardsBlock__item',
      title: 'h3.Card__title',
      detailBody: '.job-description, [itemprop="description"], main',
    },
    // Ithaca chỉ khai thác ở Biển Bắc thuộc Anh, trụ sở Aberdeen/London.
    defaultLocation: 'United Kingdom',
    enabled: true,
    // Xác minh 2026-09-01: 1 tin ("Maintenance Technician - Mechanical"), không
    // thuộc 4 nhóm. Link tin trỏ sang bảng tuyển dụng PeopleHR của họ.
    // Thẻ tin chỉ có chức danh, không có địa điểm.
    notes: 'HTML tĩnh · 1 tin · link apply trỏ sang PeopleHR',
  },
];
