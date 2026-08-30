import * as cheerio from 'cheerio';
import { CompanyType, RawJob, SourceConfig, SourceStrategy, parseFlexibleDate, sleep } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  RIGZONE  ·  https://www.rigzone.com/oil/jobs/search/
 * ══════════════════════════════════════════════════════════════
 *  Chiến lược : Axios + Cheerio (trang render server-side, không cần JS)
 *  Phân trang  : ?page=N
 *  Từ khóa     : lặp qua 4 keyword ứng với 4 nhóm ngành -> giảm nhiễu ngay từ nguồn
 *
 *  LƯU Ý VẬN HÀNH:
 *  • DOM của job board thay đổi vài lần mỗi năm. Toàn bộ selector được gom
 *    vào hằng số SELECTORS bên dưới; khi site đổi chỉ cần sửa 1 chỗ.
 *  • Mỗi selector đều có fallback (chuỗi selector nối bằng dấu phẩy) để
 *    scraper không chết ngay khi class name đổi nhẹ.
 *  • Luôn kiểm tra robots.txt và Terms of Use của nguồn trước khi bật
 *    scraper trên production; tôn trọng crawl-delay.
 */
const SELECTORS = {
  card: '.update-block, .job-listing, article.job, [data-job-id]',
  title: '.heading a, h3 a, a.job-title, [data-testid="job-title"]',
  company: '.heading-employer, .company, [itemprop="hiringOrganization"]',
  location: '.location, .heading-location, [itemprop="jobLocation"]',
  posted: '.update-block-footer, .posted-date, time',
  salary: '.salary, .compensation',
  snippet: '.description, .job-snippet, p',
  nextPage: 'a[rel="next"], .pagination a.next',
  // Trang chi tiết
  detailBody: '#job-description, .job-description, [itemprop="description"], .jobDetail',
  detailEmployment: '.employment-type, .job-type',
  detailSalary: '.salary, .compensation, .job-salary',
};

const SEARCH_KEYWORDS = [
  'reservoir engineer',
  'petroleum engineer',
  'production engineer',
  'geologist geophysicist petrophysicist',
];

export class RigzoneScraper extends BaseScraper {
  readonly config: SourceConfig = {
    key: 'rigzone',
    label: 'Rigzone',
    strategy: SourceStrategy.HTTP_CHEERIO,
    baseUrl: 'https://www.rigzone.com',
    companyType: CompanyType.JOB_BOARD,
    // TẮT trong đợt rà soát 2026-08-30.
    //
    // Rigzone là job board bên thứ ba và Terms of Use của họ cấm thu thập tự
    // động. Khác hẳn 14 nguồn đang bật — đều là career site CHÍNH THỨC của
    // công ty, nơi dữ liệu được chủ động công bố để tuyển người.
    //
    // App này chạy công khai và chia sẻ cho người khác dùng, nên rủi ro không
    // chỉ là bị chặn IP mà còn là trách nhiệm pháp lý. App cũng KHÔNG có cơ chế
    // đọc robots.txt (xem ghi chú ở generic-html.scraper.ts), nên không có lớp
    // bảo vệ tự động nào.
    //
    // Muốn dữ liệu từ board này thì cách đúng là xin API/RSS chính thức từ họ.
    enabled: false,
    maxPages: 5,
    priority: 1,
    notes: 'TẮT: job board bên thứ ba, ToU cấm scraping (rà soát 2026-08-30)',
  };

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    for (const keyword of SEARCH_KEYWORDS) {
      for (let page = 1; page <= Math.min(ctx.maxPages, this.config.maxPages ?? 5); page++) {
        const url =
          `${this.config.baseUrl}/oil/jobs/search/?keyword=${encodeURIComponent(keyword)}` +
          `&page=${page}&sortby=DATE`;

        let html: string;
        try {
          html = await ctx.http.get<string>(url);
        } catch (e) {
          ctx.logger.warn(`[rigzone] Bỏ qua trang lỗi ${url}: ${(e as Error).message}`);
          break;
        }

        const $ = cheerio.load(html);
        const cards = $(SELECTORS.card);
        if (cards.length === 0) {
          ctx.logger.debug(`[rigzone] "${keyword}" trang ${page}: hết kết quả`);
          break;
        }

        cards.each((_, el) => {
          const $card = $(el);
          const $title = $card.find(SELECTORS.title).first();
          const title = this.clean($title.text());
          const href = $title.attr('href');
          if (!title || !href) return;

          const sourceUrl = this.absoluteUrl(href, this.config.baseUrl);
          const postedRaw = this.clean($card.find(SELECTORS.posted).first().text());

          jobs.push({
            source: this.config.key,
            sourceUrl,
            externalId: $card.attr('data-job-id') ?? extractIdFromUrl(sourceUrl),
            title,
            companyName: this.clean($card.find(SELECTORS.company).first().text()),
            locationRaw: this.clean($card.find(SELECTORS.location).first().text()),
            salaryRaw: this.clean($card.find(SELECTORS.salary).first().text()),
            postedAtRaw: postedRaw,
            postedAt: parseFlexibleDate(postedRaw),
            description: this.clean($card.find(SELECTORS.snippet).first().text()),
            raw: { keyword, page },
          });
        });

        // Không còn trang kế -> dừng sớm, tiết kiệm request
        if ($(SELECTORS.nextPage).length === 0) break;
        await sleep(200);
      }
    }

    return jobs;
  }

  protected async enrich(job: RawJob, ctx: ScrapeContext): Promise<RawJob> {
    const html = await ctx.http.get<string>(job.sourceUrl);
    const $ = cheerio.load(html);

    const $body = $(SELECTORS.detailBody).first();
    const descriptionHtml = $body.length > 0 ? $body.html() : null;

    // Nhiều trang job có JSON-LD schema.org/JobPosting – dữ liệu sạch hơn DOM
    const jsonLd = extractJobPostingJsonLd($);

    return {
      ...job,
      companyName: jsonLd?.hiringOrganization?.name ?? job.companyName,
      locationRaw:
        formatJsonLdLocation(jsonLd) ?? job.locationRaw,
      employmentTypeRaw:
        (Array.isArray(jsonLd?.employmentType) ? jsonLd?.employmentType[0] : jsonLd?.employmentType) ??
        this.clean($(SELECTORS.detailEmployment).first().text()),
      salaryRaw:
        formatJsonLdSalary(jsonLd) ?? this.clean($(SELECTORS.detailSalary).first().text()) ?? job.salaryRaw,
      postedAt: job.postedAt ?? parseFlexibleDate(jsonLd?.datePosted ?? null),
      description: this.toPlainText(descriptionHtml ?? jsonLd?.description ?? null) ?? job.description,
      descriptionHtml: descriptionHtml ?? job.descriptionHtml ?? null,
      raw: { ...job.raw, hasJsonLd: Boolean(jsonLd) },
    };
  }
}

// ─────────────────────── helpers dùng chung ───────────────────────
interface JobPostingLd {
  '@type'?: string;
  title?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string | string[];
  hiringOrganization?: { name?: string };
  jobLocation?:
    | { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } } }
    | Array<{ address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } } }>;
  baseSalary?: {
    currency?: string;
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string };
  };
}

/** Trích JSON-LD JobPosting – chuẩn schema.org mà hầu hết job board đều nhúng. */
export function extractJobPostingJsonLd($: cheerio.CheerioAPI): JobPostingLd | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const raw = $(scripts[i]).contents().text();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as JobPostingLd | JobPostingLd[] | { '@graph'?: JobPostingLd[] };
      const candidates: JobPostingLd[] = Array.isArray(parsed)
        ? parsed
        : '@graph' in parsed && Array.isArray(parsed['@graph'])
          ? parsed['@graph']!
          : [parsed as JobPostingLd];
      const found = candidates.find((c) => c?.['@type'] === 'JobPosting');
      if (found) return found;
    } catch {
      // JSON-LD hỏng là chuyện thường – bỏ qua, dùng DOM thay thế
    }
  }
  return null;
}

export function formatJsonLdLocation(ld: JobPostingLd | null): string | null {
  if (!ld?.jobLocation) return null;
  const loc = Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation;
  const a = loc?.address;
  if (!a) return null;
  const country = typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name;
  return [a.addressLocality, a.addressRegion, country].filter(Boolean).join(', ') || null;
}

export function formatJsonLdSalary(ld: JobPostingLd | null): string | null {
  const bs = ld?.baseSalary;
  if (!bs?.value) return null;
  const { minValue, maxValue, value, unitText } = bs.value;
  const nums = [minValue, maxValue, value].filter((n): n is number => typeof n === 'number');
  if (nums.length === 0) return null;
  const range = nums.length > 1 ? `${Math.min(...nums)} - ${Math.max(...nums)}` : `${nums[0]}`;
  const period = unitText ? ` per ${unitText.toLowerCase()}` : '';
  return `${bs.currency ?? ''} ${range}${period}`.trim();
}

function extractIdFromUrl(url: string): string | null {
  const m = url.match(/(\d{5,})/);
  return m ? m[1] : null;
}
