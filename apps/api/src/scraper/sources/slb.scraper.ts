import { CompanyType, RawJob, SourceConfig, SourceStrategy, parseFlexibleDate } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  SLB CAREERS  ·  https://careers.slb.com
 * ══════════════════════════════════════════════════════════════
 *  Chiến lược : Playwright (SPA – kết quả render bằng JavaScript)
 *  Vì sao không dùng Cheerio: HTML trả về ban đầu chỉ là khung rỗng,
 *  danh sách job được nạp qua XHR sau khi JS chạy.
 *
 *  Kỹ thuật tối ưu:
 *   • Chặn ảnh/font/CSS (cấu hình sẵn trong BrowserPool) -> tải nhanh hơn ~3×
 *   • waitForSelector thay vì sleep cứng -> ổn định trên mạng chậm
 *   • Trích dữ liệu bằng 1 lần page.$$eval -> chỉ 1 lần chuyển context Node↔Browser
 *   • Nếu bắt được XHR trả JSON, ưu tiên đọc JSON (nhanh & bền hơn DOM)
 */
const SELECTORS = {
  cookieAccept: '#onetrust-accept-btn-handler, button[aria-label*="Accept"]',
  searchResults: '[data-ph-at-id="jobs-list"], .jobs-list, ul.search-results-list, [role="list"]',
  card: '[data-ph-at-id="job-item"], li.jobs-list-item, article.job-tile',
  title: '[data-ph-at-id="job-title"], a.job-title, h3 a, a[data-ph-at-job-title-text]',
  location: '[data-ph-at-id="job-location"], .job-location, span.location',
  category: '[data-ph-at-id="job-category"], .job-category',
  posted: '[data-ph-at-id="job-post-date"], .job-date, time',
  loadMore: 'button[data-ph-at-id="pagination-next-button"], a[aria-label="Next"], button.next',
  detailBody: '.job-description, [data-ph-at-id="job-description"], .jd-info, main article',
};

const SEARCH_TERMS = ['reservoir', 'petroleum engineer', 'production engineer', 'petrophysic', 'geolog'];

export class SlbScraper extends BaseScraper {
  readonly config: SourceConfig = {
    key: 'slb',
    label: 'SLB Careers',
    strategy: SourceStrategy.PLAYWRIGHT,
    baseUrl: 'https://careers.slb.com',
    defaultCompany: 'SLB',
    companyType: CompanyType.SERVICE,
    enabled: false, // Playwright cần >=2GB RAM — Render free (512MB) không đủ.
    // Nguồn này vẫn được thu thập, nhưng do GitHub Actions chạy (runner có 7GB).
    maxPages: 4,
    priority: 2,
  };

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    for (const term of SEARCH_TERMS) {
      try {
        const found = await ctx.browser.withPage(async (page) => {
          const collected: RawJob[] = [];

          // Bắt song song các response JSON – nhiều SPA trả sẵn payload đầy đủ
          page.on('response', async (res) => {
            const url = res.url();
            if (!/search|jobs|api/i.test(url)) return;
            const ctype = res.headers()['content-type'] ?? '';
            if (!ctype.includes('application/json')) return;
            try {
              const data = (await res.json()) as unknown;
              const parsed = parsePhenomPayload(data, this.config.baseUrl, this.config.key);
              collected.push(...parsed);
            } catch {
              /* payload không phải danh sách job */
            }
          });

          const url = `${this.config.baseUrl}/search-jobs/${encodeURIComponent(term)}`;
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.click(SELECTORS.cookieAccept, { timeout: 3000 }).catch(() => undefined);

          for (let p = 0; p < Math.min(ctx.maxPages, this.config.maxPages ?? 4); p++) {
            const ok = await page
              .waitForSelector(SELECTORS.card, { timeout: 15000, state: 'attached' })
              .then(() => true)
              .catch(() => false);
            if (!ok) break;

            const pageJobs = await page.$$eval(
              SELECTORS.card,
              (nodes, sel) =>
                nodes.map((n) => {
                  const q = (s: string) => n.querySelector(s);
                  const titleEl = q(sel.title) as HTMLAnchorElement | null;
                  return {
                    title: titleEl?.textContent?.trim() ?? '',
                    href: titleEl?.getAttribute('href') ?? '',
                    location: q(sel.location)?.textContent?.trim() ?? '',
                    category: q(sel.category)?.textContent?.trim() ?? '',
                    posted: q(sel.posted)?.textContent?.trim() ?? '',
                  };
                }),
              SELECTORS,
            );

            for (const j of pageJobs) {
              if (!j.title || !j.href) continue;
              collected.push({
                source: this.config.key,
                sourceUrl: this.absoluteUrl(j.href, this.config.baseUrl),
                externalId: extractSlbId(j.href),
                title: j.title,
                companyName: this.config.defaultCompany ?? 'SLB',
                locationRaw: j.location || null,
                postedAtRaw: j.posted || null,
                postedAt: parseFlexibleDate(j.posted),
                description: j.category || null,
                raw: { term, category: j.category },
              });
            }

            const next = await page.$(SELECTORS.loadMore);
            const disabled = next ? await next.getAttribute('disabled') : 'true';
            if (!next || disabled !== null) break;
            await next.click().catch(() => undefined);
            await page.waitForTimeout(1200);
          }

          return collected;
        });

        jobs.push(...found);
      } catch (e) {
        ctx.logger.warn(`[slb] Lỗi khi tìm "${term}": ${(e as Error).message}`);
      }
    }

    return jobs;
  }

  protected async enrich(job: RawJob, ctx: ScrapeContext): Promise<RawJob> {
    return ctx.browser.withPage(async (page) => {
      await page.goto(job.sourceUrl, { waitUntil: 'domcontentloaded' });
      const body = await page
        .waitForSelector(SELECTORS.detailBody, { timeout: 12000 })
        .then((h) => h?.innerHTML() ?? null)
        .catch(() => null);

      // JSON-LD trên trang chi tiết (Phenom People có nhúng sẵn)
      const ld = await page
        .$eval('script[type="application/ld+json"]', (el) => el.textContent ?? '')
        .catch(() => '');
      let datePosted: string | null = null;
      let employmentType: string | null = null;
      try {
        const parsed = JSON.parse(ld) as {
          datePosted?: string;
          employmentType?: string | string[];
        };
        datePosted = parsed?.datePosted ?? null;
        employmentType = Array.isArray(parsed?.employmentType)
          ? parsed.employmentType[0]
          : (parsed?.employmentType ?? null);
      } catch {
        /* không có JSON-LD */
      }

      return {
        ...job,
        description: this.toPlainText(body) ?? job.description,
        descriptionHtml: body ?? job.descriptionHtml ?? null,
        employmentTypeRaw: employmentType ?? job.employmentTypeRaw ?? null,
        postedAt: job.postedAt ?? parseFlexibleDate(datePosted),
      };
    });
  }
}

/** Payload dạng Phenom People (SLB, Halliburton, nhiều IOC dùng chung nền tảng). */
function parsePhenomPayload(data: unknown, baseUrl: string, source: string): RawJob[] {
  const root = data as {
    refineSearch?: { data?: { jobs?: PhenomJob[] } };
    eagerLoadRefineSearch?: { data?: { jobs?: PhenomJob[] } };
    jobs?: PhenomJob[];
  };
  const list =
    root?.refineSearch?.data?.jobs ?? root?.eagerLoadRefineSearch?.data?.jobs ?? root?.jobs ?? [];
  if (!Array.isArray(list)) return [];

  return list
    .filter((j) => j?.title && (j.jobUrl || j.applyUrl))
    .map((j) => ({
      source,
      sourceUrl: new URL(j.jobUrl ?? j.applyUrl!, baseUrl).toString(),
      externalId: j.jobId ?? j.reqId ?? null,
      title: j.title!,
      companyName: j.company ?? 'SLB',
      locationRaw: [j.city, j.state, j.country].filter(Boolean).join(', ') || j.location || null,
      description: j.descriptionTeaser ?? j.description ?? null,
      postedAtRaw: j.postedDate ?? null,
      postedAt: parseFlexibleDate(j.postedDate ?? null),
      employmentTypeRaw: j.type ?? null,
      raw: { via: 'xhr' },
    }));
}

interface PhenomJob {
  jobId?: string;
  reqId?: string;
  title?: string;
  jobUrl?: string;
  applyUrl?: string;
  company?: string;
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  description?: string;
  descriptionTeaser?: string;
  postedDate?: string;
  type?: string;
}

function extractSlbId(href: string): string | null {
  const m = href.match(/\/job\/([\w-]+)/) ?? href.match(/(\d{6,})/);
  return m ? m[1] : null;
}
