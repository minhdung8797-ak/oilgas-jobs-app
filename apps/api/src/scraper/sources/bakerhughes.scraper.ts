import { CompanyType, RawJob } from '@og/shared';
import { ScrapeContext } from '../lib/base-scraper';
import { WorkdayScraper, WorkdayTenant } from './workday.scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  BAKER HUGHES  ·  https://careers.bakerhughes.com
 * ══════════════════════════════════════════════════════════════
 *  Baker Hughes chạy Workday, nên kế thừa WorkdayScraper và chỉ
 *  bổ sung phần đặc thù:
 *   • Bộ từ khóa tìm kiếm bám sát 4 nhóm ngành
 *   • Chuẩn hóa location kiểu Workday: "Abu Dhabi, United Arab Emirates"
 *     đôi khi trả về dạng "United Arab Emirates - Abu Dhabi"
 *   • Loại các req nội bộ (Internal Only) và các vị trí không phải kỹ thuật
 *
 *  Đây là mẫu chuẩn để thêm bất kỳ công ty Workday nào khác:
 *  chỉ cần copy file này, đổi tenant + searchTerms.
 */
const TENANT: WorkdayTenant = {
  key: 'bakerhughes',
  label: 'Baker Hughes Careers',
  company: 'Baker Hughes',
  companyType: CompanyType.SERVICE,
  host: 'https://bakerhughes.wd5.myworkdayjobs.com',
  tenant: 'bakerhughes',
  site: 'BakerHughes',
  searchTerms: [
    'reservoir engineer',
    'petroleum engineer',
    'production engineer',
    'petrophysicist',
    'geologist',
    'well intervention',
    'artificial lift',
    'formation evaluation',
    'geophysicist',
  ],
};

const EXCLUDE_TITLE = /\b(internal only|intern program|finance|legal|hr\b|payroll|it support|talent acquisition)\b/i;

export class BakerHughesScraper extends WorkdayScraper {
  constructor() {
    super(TENANT);
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const jobs = await super.listJobs(ctx);
    return jobs
      .filter((j) => !EXCLUDE_TITLE.test(j.title))
      .map((j) => ({ ...j, locationRaw: normalizeWorkdayLocation(j.locationRaw) }));
  }

  protected async enrich(job: RawJob, ctx: ScrapeContext): Promise<RawJob> {
    const enriched = await super.enrich(job, ctx);
    return { ...enriched, locationRaw: normalizeWorkdayLocation(enriched.locationRaw) };
  }
}

/**
 * Workday trả location theo nhiều định dạng khác nhau:
 *   "United Arab Emirates - Abu Dhabi"  -> "Abu Dhabi, United Arab Emirates"
 *   "2 Locations"                       -> null (không xác định được)
 *   "Abu Dhabi, United Arab Emirates"   -> giữ nguyên
 */
export function normalizeWorkdayLocation(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^\d+\s+locations?$/i.test(s)) return null;
  const m = s.match(/^([A-Za-z\s.'-]+)\s+-\s+(.+)$/);
  if (m) return `${m[2].trim()}, ${m[1].trim()}`;
  return s;
}
