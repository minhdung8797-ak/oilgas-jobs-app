import * as cheerio from 'cheerio';
import { CompanyType, RawJob, SourceConfig, SourceStrategy, parseFlexibleDate } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  WORKDAY (CXS JSON API)  ·  adapter dùng chung
 * ══════════════════════════════════════════════════════════════
 *  Baker Hughes, Halliburton, Chevron, Equinor… đều chạy Workday.
 *  Workday có endpoint JSON công khai mà chính giao diện web dùng:
 *
 *      POST https://<tenant>.<dc>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs
 *      body: { appliedFacets: {}, limit: 20, offset: 0, searchText: "reservoir" }
 *
 *  => Nhanh hơn Playwright hàng chục lần, không cần trình duyệt, ổn định
 *     hơn nhiều so với parse DOM. Đây LUÔN là lựa chọn ưu tiên khi có.
 *
 *  Chi tiết job:
 *      GET https://<tenant>.<dc>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/job/<path>
 */
export interface WorkdayTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** vd: https://bakerhughes.wd5.myworkdayjobs.com */
  host: string;
  tenant: string;
  /** tên career site, vd: BakerHughes */
  site: string;
  searchTerms?: string[];
  enabled?: boolean;
}

interface WorkdayJobPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

interface WorkdaySearchResponse {
  total: number;
  jobPostings: WorkdayJobPosting[];
}

interface WorkdayJobDetail {
  jobPostingInfo?: {
    id?: string;
    title?: string;
    jobDescription?: string;
    location?: string;
    postedOn?: string;
    startDate?: string;
    timeType?: string;
    jobReqId?: string;
    country?: { descriptor?: string };
  };
}

const DEFAULT_TERMS = ['reservoir', 'petroleum', 'production engineer', 'geoscience', 'petrophysicist', 'geophysicist'];
const PAGE_SIZE = 20;

export class WorkdayScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly tenant: WorkdayTenant) {
    super();
    this.config = {
      key: tenant.key,
      label: tenant.label,
      strategy: SourceStrategy.JSON_API,
      baseUrl: tenant.host,
      defaultCompany: tenant.company,
      companyType: tenant.companyType,
      enabled: tenant.enabled ?? true,
      maxPages: 5,
      priority: 1,
      notes: 'Workday CXS JSON API – nhanh, không cần Playwright',
    };
  }

  private get cxsBase(): string {
    return `${this.tenant.host}/wday/cxs/${this.tenant.tenant}/${this.tenant.site}`;
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const terms = this.tenant.searchTerms ?? DEFAULT_TERMS;

    for (const searchText of terms) {
      for (let page = 0; page < Math.min(ctx.maxPages, this.config.maxPages ?? 5); page++) {
        const offset = page * PAGE_SIZE;
        let res: WorkdaySearchResponse;
        try {
          res = await ctx.http.post<WorkdaySearchResponse>(
            `${this.cxsBase}/jobs`,
            { appliedFacets: {}, limit: PAGE_SIZE, offset, searchText },
            { headers: { Referer: `${this.tenant.host}/${this.tenant.site}` } },
          );
        } catch (e) {
          ctx.logger.warn(`[${this.config.key}] search "${searchText}" offset ${offset}: ${(e as Error).message}`);
          break;
        }

        const postings = res?.jobPostings ?? [];
        if (postings.length === 0) break;

        for (const p of postings) {
          if (!p.title || !p.externalPath) continue;
          jobs.push({
            source: this.config.key,
            sourceUrl: `${this.tenant.host}/${this.tenant.site}${p.externalPath}`,
            externalId: p.bulletFields?.[0] ?? p.externalPath,
            title: p.title,
            companyName: this.tenant.company,
            locationRaw: p.locationsText ?? null,
            postedAtRaw: p.postedOn ?? null,
            postedAt: parseFlexibleDate(p.postedOn ?? null),
            raw: { searchText, externalPath: p.externalPath },
          });
        }

        if (offset + PAGE_SIZE >= (res.total ?? 0)) break;
      }
    }

    return jobs;
  }

  protected async enrich(job: RawJob, ctx: ScrapeContext): Promise<RawJob> {
    const externalPath = (job.raw as { externalPath?: string })?.externalPath;
    if (!externalPath) return job;

    const detail = await ctx.http.get<WorkdayJobDetail>(`${this.cxsBase}${externalPath}`, {
      headers: { Accept: 'application/json' },
    });

    const info = detail?.jobPostingInfo;
    if (!info) return job;

    const html = info.jobDescription ?? null;
    const $ = html ? cheerio.load(html) : null;

    return {
      ...job,
      externalId: info.jobReqId ?? info.id ?? job.externalId,
      locationRaw: info.location ?? job.locationRaw,
      employmentTypeRaw: info.timeType ?? job.employmentTypeRaw ?? null,
      postedAt: job.postedAt ?? parseFlexibleDate(info.postedOn ?? info.startDate ?? null),
      description: $ ? this.toPlainText($.text()) : this.toPlainText(html),
      descriptionHtml: html,
      // Workday hiếm khi công bố lương -> để normalizer đọc từ mô tả
      salaryRaw: extractSalaryLine(this.toPlainText(html) ?? ''),
      raw: { ...job.raw, country: info.country?.descriptor },
    };
  }
}

/** Tìm câu chứa thông tin lương trong mô tả (Workday không có trường riêng). */
export function extractSalaryLine(text: string): string | null {
  if (!text) return null;
  const re =
    /[^.]*?(?:salary|compensation|pay range|day rate|remuneration)[^.]*?[$€£]?\s?\d[\d.,]*\s?(?:k|m)?[^.]*\./i;
  const m = text.match(re);
  return m ? m[0].trim().slice(0, 300) : null;
}

/**
 * Cấu hình tenant.
 * ⚠️ host/tenant/site cần được xác nhận lại theo thực tế của từng công ty
 * (mở trang careers, xem tab Network -> request tới /wday/cxs/...).
 * Sai cấu hình chỉ làm nguồn đó fail, không ảnh hưởng các nguồn khác.
 */
export const WORKDAY_TENANTS: WorkdayTenant[] = [
  {
    key: 'bakerhughes',
    label: 'Baker Hughes Careers',
    company: 'Baker Hughes',
    companyType: CompanyType.SERVICE,
    host: 'https://bakerhughes.wd5.myworkdayjobs.com',
    tenant: 'bakerhughes',
    site: 'BakerHughes',
  },
  {
    key: 'spiritenergy',
    label: 'Spirit Energy Careers',
    company: 'Spirit Energy',
    companyType: CompanyType.IOC,
    host: 'https://spiritenergy.wd3.myworkdayjobs.com',
    tenant: 'spiritenergy',
    site: 'SpiritInternet',
    // Xác minh 2026-09-01: gọi thẳng /wday/cxs/spiritenergy/SpiritInternet/jobs
    // -> HTTP 200, total = 9. Địa điểm dạng "UK - Barrow Terminals", "UK - Aberdeen"
    // (bí danh 'uk' đã có sẵn cho Anh nên nhận diện được).
    // Hiện chưa tin nào thuộc 4 nhóm — toàn kỹ thuật viên, kế toán, IT.
  },
  // ── Đã xác minh 2026-08-30 bằng cách gọi thẳng /wday/cxs/... và nhận HTTP 200 ──
  {
    key: 'chevron',
    label: 'Chevron Careers',
    company: 'Chevron',
    companyType: CompanyType.IOC,
    host: 'https://chevron.wd5.myworkdayjobs.com',
    tenant: 'chevron',
    site: 'jobs', // site đúng là "jobs", không phải "Chevron"
  },
  {
    key: 'oxy',
    label: 'Occidental Petroleum Careers',
    company: 'Occidental Petroleum',
    companyType: CompanyType.IOC,
    host: 'https://oxy.wd5.myworkdayjobs.com',
    tenant: 'oxy',
    site: 'Corporate',
  },
  {
    key: 'continental',
    label: 'Continental Resources Careers',
    company: 'Continental Resources',
    companyType: CompanyType.IOC,
    host: 'https://clr.wd5.myworkdayjobs.com',
    tenant: 'clr',
    site: 'CLR_Careers',
  },
  {
    key: 'diamondback',
    label: 'Diamondback Energy Careers',
    company: 'Diamondback Energy',
    companyType: CompanyType.IOC,
    host: 'https://diamondbackenergy.wd12.myworkdayjobs.com',
    tenant: 'diamondbackenergy',
    site: 'DBE',
  },
  {
    key: 'permianresources',
    label: 'Permian Resources Careers',
    company: 'Permian Resources',
    companyType: CompanyType.IOC,
    host: 'https://permianres.wd12.myworkdayjobs.com',
    tenant: 'permianres',
    site: 'Permian_Resources_Careers',
  },
  {
    key: 'conocophillips',
    label: 'ConocoPhillips Careers',
    company: 'ConocoPhillips',
    companyType: CompanyType.IOC,
    host: 'https://conocophillips.wd1.myworkdayjobs.com',
    tenant: 'conocophillips',
    // Site là 'External', KHÔNG phải 'ConocoPhillips'. Lần đoán trước theo tên
    // công ty đã trượt; giá trị đúng lấy từ link trên careers.conocophillips.com.
    site: 'External',
    // Xác minh 2026-08-30: HTTP 200. Lưu ý kho tin hiện nghiêng hẳn về thực tập
    // và graduate 2027 — classifier sẽ lọc phần lớn vào OTHER.
  },
  {
    key: 'bp',
    label: 'bp Careers',
    company: 'bp',
    companyType: CompanyType.IOC,
    host: 'https://bpinternational.wd3.myworkdayjobs.com',
    // Tenant là 'bpinternational', KHÔNG phải 'bp'.
    // Xác minh 2026-08-30: 9 kết quả cho "reservoir", gồm Reservoir Engineer,
    // Senior Petrophysicist, Petroleum Engineer.
    tenant: 'bpinternational',
    site: 'BPCareers',
  },
  {
    key: 'shell',
    label: 'Shell Careers',
    company: 'Shell',
    companyType: CompanyType.IOC,
    // jobs.shell.com chuyển hướng về đây.
    host: 'https://shell.wd3.myworkdayjobs.com',
    tenant: 'shell',
    site: 'shellcareers',
    // Cấu hình này ĐÚNG — đã kiểm lại 2026-08-31, kể cả biến thể viết hoa
    // 'ShellCareers' (cùng site, cùng kết quả). Toàn công ty chỉ có 11 tin trên
    // cổng này, và 0 tin cho "reservoir"/"geophysicist": chủ yếu là kỹ thuật viên
    // vận hành cùng chương trình graduate/internship 2027.
    //
    // Nói rõ để khỏi mất công dò lại: con số 0 của Shell là SỰ THẬT về kho tin
    // của họ, không phải lỗi cấu hình.
    searchTerms: ['petroleum', 'reservoir', 'production engineer', 'geoscience', 'well', 'geophysicist'],
  },

  // ── Tắt: đã kiểm tra 2026-08-30, các địa chỉ này KHÔNG tồn tại ──
  // Cả hai đều chuyển hướng sang community.workday.com/invalid-url.
  // Halliburton dùng SAP SuccessFactors (jobs.halliburton.com), không phải Workday.
  // Equinor dùng cổng tuyển dụng riêng tại equinor.com/careers/vacancies (SPA).
  // Muốn bật lại thì phải viết scraper riêng cho từng cổng, không dùng WorkdayScraper.
  // Halliburton ĐÃ CHUYỂN sang generic-html.scraper.ts (SAP SuccessFactors tại
  // jobs.halliburton.com, xác minh 2026-08-31). Mục Workday cũ bị xoá hẳn để
  // tránh trùng khoá `halliburton` trong registry.
  {
    key: 'equinor',
    label: 'Equinor Careers',
    company: 'Equinor',
    companyType: CompanyType.IOC,
    host: 'https://equinor.wd3.myworkdayjobs.com',
    tenant: 'equinor',
    // Site là 'EQNR', KHÔNG phải 'Equinor'. Lần đoán theo tên công ty năm ngoái
    // trả về community.workday.com/invalid-url, khiến tôi kết luận nhầm rằng
    // Equinor "dùng cổng riêng dạng SPA". Giá trị đúng lấy từ link trên
    // equinor.com/careers. Đây là lần thứ tư đoán tenant theo tên công ty bị sai
    // (sau bp=bpinternational, ConocoPhillips=External, Chevron=jobs).
    site: 'EQNR',
    // Xác minh 2026-08-31: HTTP 200, toàn công ty có 17 tin. Hiện KHÔNG tin nào
    // thuộc 4 nhóm mục tiêu — chủ yếu là kỹ sư điện/tự động/cơ khí tiếng Na Uy
    // và vận hành viên tiếng Bồ ở Brazil. Vẫn bật vì cấu hình đã đúng.
  },
  // Weatherford ĐÃ CHUYỂN sang oracle-orc.scraper.ts (Oracle Recruiting Cloud
  // tại careers.weatherford.com, xác minh 2026-08-31). Mục Workday cũ — vốn trỏ
  // tới địa chỉ không tồn tại — bị xoá hẳn để tránh trùng khoá.
];
