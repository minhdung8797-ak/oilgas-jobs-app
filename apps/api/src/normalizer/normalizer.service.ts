import { Injectable, Logger } from '@nestjs/common';
import {
  COUNTRIES,
  CURRENCY_SYMBOLS,
  Discipline,
  EmploymentType,
  NormalizedJob,
  RawJob,
  SalaryPeriod,
  Seniority,
  SKILL_PATTERNS,
  WorkMode,
  contentHash,
  normalizeText,
  parseFlexibleDate,
  slugify,
  truncate,
  uniq,
} from '@og/shared';
import { FxService } from './fx.service';
import { ClassifierService } from '../classifier/classifier.service';

/** Bảng tra alias -> country code, build 1 lần lúc khởi động (O(1) lookup). */
const ALIAS_INDEX: { alias: string; code: string; isCity: boolean }[] = (() => {
  const rows: { alias: string; code: string; isCity: boolean }[] = [];
  for (const c of COUNTRIES) {
    rows.push({ alias: c.name.toLowerCase(), code: c.code, isCity: false });
    rows.push({ alias: c.iso3.toLowerCase(), code: c.code, isCity: false });
    for (const a of c.aliases) {
      rows.push({ alias: a.toLowerCase(), code: c.code, isCity: a.split(' ').length <= 3 });
    }
  }
  // alias dài match trước để "united arab emirates" không bị "uae" cắt ngang
  return rows.sort((a, b) => b.alias.length - a.alias.length);
})();

/** Mã ISO alpha-2 viết thường, chỉ dùng cho tiền tố địa điểm kiểu Workday. */
const ISO2_SET = new Set(COUNTRIES.map((c) => c.code.toLowerCase()));

const SKILL_REGEXES = SKILL_PATTERNS.map((s) => ({ ...s, re: new RegExp(s.pattern, 'i') }));

@Injectable()
export class NormalizerService {
  private readonly logger = new Logger(NormalizerService.name);

  constructor(
    private readonly fx: FxService,
    private readonly classifier: ClassifierService,
  ) {}

  /** Pipeline chính: RawJob -> NormalizedJob (đã phân loại, đã quy đổi USD). */
  async normalize(raw: RawJob): Promise<NormalizedJob> {
    const title = raw.title.trim().replace(/\s{2,}/g, ' ');
    const titleNorm = normalizeText(title);
    const descText = raw.description
      ? normalizeText(raw.description)
      : normalizeText(raw.descriptionHtml);

    const classification = await this.classifier.classify({
      title,
      description: raw.description ?? raw.descriptionHtml ?? '',
      company: raw.companyName ?? '',
    });

    const location = this.parseLocation(raw.locationRaw);
    const salary = this.parseSalary(raw.salaryRaw ?? '', location.countryCode);
    const salaryUsd = await this.fx.toUsdAnnual(salary);

    const employmentType = this.parseEmploymentType(
      `${raw.employmentTypeRaw ?? ''} ${titleNorm} ${truncate(descText, 3000)}`,
    );
    const workMode = this.parseWorkMode(`${titleNorm} ${raw.locationRaw ?? ''} ${truncate(descText, 5000)}`);

    const postedAt = raw.postedAt ?? parseFlexibleDate(raw.postedAtRaw);

    return {
      source: raw.source,
      sourceUrl: raw.sourceUrl,
      externalId: raw.externalId ?? null,
      title,
      titleNormalized: titleNorm,
      description: raw.description ? truncate(raw.description, 60000) : null,
      descriptionHtml: raw.descriptionHtml ? truncate(raw.descriptionHtml, 120000) : null,
      companyName: raw.companyName?.trim() || null,
      companySlug: raw.companyName ? slugify(raw.companyName) : null,
      countryCode: location.countryCode,
      city: location.city,
      locationRaw: raw.locationRaw?.trim().slice(0, 300) ?? null,
      discipline: classification.discipline,
      disciplineConfidence: classification.confidence,
      disciplineScores: classification.scores,
      classifierVersion: classification.version,
      seniority: this.parseSeniority(titleNorm, descText),
      employmentType,
      workMode,
      rotation: this.parseRotation(`${titleNorm} ${descText}`),
      experienceMinYears: this.parseExperience(descText),
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,
      salaryMinUsd: salaryUsd.min,
      salaryMaxUsd: salaryUsd.max,
      skills: this.extractSkills(`${titleNorm} ${descText}`),
      postedAt,
      contentHash: contentHash([title, raw.companyName, raw.locationRaw, descText.slice(0, 5000)]),
      raw: (raw.raw as Record<string, unknown>) ?? null,
    };
  }

  // ───────────────────────── LOCATION ─────────────────────────
  /**
   * "Abu Dhabi, United Arab Emirates" -> { city: 'Abu Dhabi', countryCode: 'AE' }
   * "Aberdeen, UK"                    -> { city: 'Aberdeen', countryCode: 'GB' }
   * "Houston, TX"                     -> { city: 'Houston', countryCode: 'US' }
   */
  parseLocation(input: string | null | undefined): { city: string | null; countryCode: string | null } {
    if (!input) return { city: null, countryCode: null };
    const cleaned = input.replace(/\s{2,}/g, ' ').trim();
    const lower = cleaned.toLowerCase();

    let countryCode: string | null = null;
    let workdayCity: string | null = null;

    // Workday (Baker Hughes, Halliburton, Equinor) ghi địa điểm dạng
    //   "IT-Pescara-Cepagatti- VIA Nazionale, 46"
    //   "IN-HARYANA-GURUGRAM-10th Floor, Tower 10B, DLF Cyber City"
    // Hai chữ cái đầu là mã ISO alpha-2. Không thể đưa mã 2 ký tự vào ALIAS_INDEX
    // vì 'in', 'it', 'no', 'de', 'is' trùng với từ tiếng Anh thông thường và sẽ
    // gán nhầm nước cho hàng loạt job. Nhưng khi mã đứng ngay đầu chuỗi và có dấu
    // gạch nối theo sau thì gần như chắc chắn đó là mã nước, nên xét riêng ở đây.
    const iso2Prefix = /^([a-z]{2})-(.*)$/.exec(lower);
    if (iso2Prefix && ISO2_SET.has(iso2Prefix[1])) {
      countryCode = iso2Prefix[1].toUpperCase();
      // Đoạn ngay sau mã nước là thành phố: "IT-Pescara-..." -> "Pescara".
      // Không có nó thì city sẽ là cả chuỗi "IT-Pescara-Cepagatti- VIA Nazionale".
      //
      // Workday hay chèn mã vùng viết hoa vào giữa: mã bang/tỉnh
      // ("US-TX-THE WOODLANDS", "CA-AB-LEDUC", "BR-RJ-RIO DE JANEIRO") hoặc mã
      // sân bay ("MY-KUL-KUALA LUMPUR"). Lấy token đầu sẽ ra "TX"/"RJ"/"KUL".
      // Bỏ qua token viết hoa toàn bộ dài 2–3 ký tự; tên thành phố thật hầu như
      // luôn dài hơn hoặc có chữ thường ("Baku", "Pescara" vẫn được giữ).
      const tokens = cleaned
        .slice(3)
        .split(/[-,|·•–]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const token = tokens.find((t) => !/^[A-Z]{2,3}$/.test(t));
      if (token && token.length >= 2 && token.length <= 60) {
        workdayCity = token;
      }
    }

    if (!countryCode) {
      for (const row of ALIAS_INDEX) {
        const re = new RegExp(`(^|[^a-z])${escapeRegex(row.alias)}([^a-z]|$)`, 'i');
        if (re.test(lower)) {
          countryCode = row.code;
          break;
        }
      }
    }

    if (workdayCity) return { city: workdayCity, countryCode };

    // City = phần đầu trước dấu phẩy, trừ khi phần đó chính là TÊN NƯỚC.
    // Lưu ý: không loại theo `aliases` vì aliases chứa cả tên thành phố
    // ("houston", "aberdeen") – đó chính là những giá trị ta muốn giữ làm city.
    const parts = cleaned.split(/[,|·•–]/).map((p) => p.trim()).filter(Boolean);
    let city: string | null = null;
    if (parts.length > 0) {
      const first = parts[0];
      const firstLower = first.toLowerCase();
      const isCountryName = COUNTRIES.some(
        (c) =>
          c.name.toLowerCase() === firstLower ||
          c.iso3.toLowerCase() === firstLower ||
          c.code.toLowerCase() === firstLower,
      );
      if (!isCountryName && first.length <= 80 && !/^(remote|various|multiple)/i.test(first)) {
        city = first;
      }
    }
    return { city, countryCode };
  }

  // ───────────────────────── SALARY ───────────────────────────
  /**
   * Hỗ trợ: "$120,000 - $150,000 per year", "£650/day", "USD 90k-110k",
   * "AED 45,000 monthly", "Competitive" (-> null).
   */
  parseSalary(
    input: string,
    countryCode: string | null,
  ): { min: number | null; max: number | null; currency: string | null; period: SalaryPeriod | null } {
    const empty = { min: null, max: null, currency: null, period: null };
    if (!input) return empty;
    const s = input.toLowerCase().replace(/\s{2,}/g, ' ').trim();
    if (/competitive|negotiab|doe\b|market rate|attractive/.test(s) && !/\d/.test(s)) return empty;

    // currency
    let currency: string | null = null;
    for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
      if (s.includes(sym)) {
        currency = code;
        break;
      }
    }
    if (!currency && countryCode) {
      currency = COUNTRIES.find((c) => c.code === countryCode)?.currency ?? null;
    }

    // period
    let period: SalaryPeriod | null = null;
    if (/\b(per\s+hour|hourly|\/hr|\/hour|per hr)\b/.test(s)) period = SalaryPeriod.HOUR;
    else if (/\b(per\s+day|daily|\/day|day rate|per diem)\b/.test(s)) period = SalaryPeriod.DAY;
    else if (/\b(per\s+week|weekly|\/week)\b/.test(s)) period = SalaryPeriod.WEEK;
    else if (/\b(per\s+month|monthly|\/month|pm\b|p\.m\.)\b/.test(s)) period = SalaryPeriod.MONTH;
    else if (/\b(per\s+(year|annum)|annual(ly)?|\/year|pa\b|p\.a\.)\b/.test(s)) period = SalaryPeriod.YEAR;

    // numbers: hỗ trợ 120,000 | 120000 | 120k | 1.2m
    const nums = [...s.matchAll(/(\d[\d.,]*)\s*(k|m)?\b/g)]
      .map((m) => {
        const base = parseFloat(m[1].replace(/,/g, ''));
        if (!Number.isFinite(base)) return NaN;
        if (m[2] === 'k') return base * 1_000;
        if (m[2] === 'm') return base * 1_000_000;
        return base;
      })
      .filter((n) => Number.isFinite(n) && n >= 10); // loại "8 hours", "5 years"

    if (nums.length === 0) return { ...empty, currency };

    const min = Math.min(...nums);
    const max = Math.max(...nums);

    // Suy luận period nếu thiếu, dựa trên độ lớn con số
    if (!period) {
      if (max < 500) period = SalaryPeriod.HOUR;
      else if (max < 5_000) period = SalaryPeriod.DAY;
      else if (max < 40_000) period = SalaryPeriod.MONTH;
      else period = SalaryPeriod.YEAR;
    }

    return { min, max: max === min ? null : max, currency, period };
  }

  // ───────────────────────── ENUM PARSERS ─────────────────────
  /**
   * Thứ tự kiểm tra rất quan trọng: chuỗi "permanent contract" hay
   * "fixed-term contract" đều chứa từ "contract" nhưng KHÔNG phải hợp đồng
   * nhà thầu. Vì vậy các nhãn cụ thể hơn được xét trước.
   */
  parseEmploymentType(text: string): EmploymentType {
    const s = text.toLowerCase();
    if (/\b(intern|internship|trainee\s+program|apprentice)\b/.test(s)) return EmploymentType.INTERNSHIP;
    if (/\b(graduate\s+(program|scheme|role)|new grad|early career)\b/.test(s)) return EmploymentType.GRADUATE;
    if (/\b(part[- ]time)\b/.test(s)) return EmploymentType.PART_TIME;
    if (/\b(permanent|full[- ]time|staff position)\b/.test(s)) return EmploymentType.FULL_TIME;
    if (/\b(temporary|temp\b|fixed[- ]term|seasonal|secondment)\b/.test(s)) return EmploymentType.TEMPORARY;
    if (/\b(contract(or|ual)?|freelance|consultant|agency|day rate|ltd company)\b/.test(s))
      return EmploymentType.CONTRACT;
    return EmploymentType.UNKNOWN;
  }

  parseWorkMode(text: string): WorkMode {
    const s = text.toLowerCase();
    if (/\b(\d{1,2}\s*\/\s*\d{1,2}\s*(rotation|schedule)|rotational|rotation basis|fifo)\b/.test(s))
      return WorkMode.ROTATIONAL;
    if (/\b(offshore|platform based|rig[- ]based|fpso|jack[- ]?up|drillship)\b/.test(s))
      return WorkMode.OFFSHORE;
    if (/\bhybrid\b/.test(s)) return WorkMode.HYBRID;
    if (/\b(fully remote|100% remote|work from home|remote position|remote role)\b/.test(s))
      return WorkMode.REMOTE;
    if (/\b(on[- ]site|onsite|office based|field based)\b/.test(s)) return WorkMode.ONSITE;
    return WorkMode.UNKNOWN;
  }

  parseSeniority(title: string, description: string): Seniority {
    const t = title.toLowerCase();
    if (/\b(intern|internship|student|apprentice)\b/.test(t)) return Seniority.INTERN;
    if (/\b(director|vp\b|vice president|head of)\b/.test(t)) return Seniority.DIRECTOR;
    if (/\b(manager|superintendent)\b/.test(t)) return Seniority.MANAGER;
    if (/\b(lead|principal|chief|team leader|supervisor)\b/.test(t)) return Seniority.LEAD;
    if (/\b(senior|snr\b|sr\.?\b|expert|specialist iii)\b/.test(t)) return Seniority.SENIOR;
    if (/\b(junior|jr\.?\b|graduate|entry[- ]level|associate|trainee)\b/.test(t)) return Seniority.ENTRY;

    const years = this.parseExperience(description);
    if (years !== null) {
      if (years >= 12) return Seniority.LEAD;
      if (years >= 7) return Seniority.SENIOR;
      if (years >= 3) return Seniority.MID;
      return Seniority.ENTRY;
    }
    return Seniority.UNKNOWN;
  }

  /** "minimum 8 years of experience" -> 8 */
  parseExperience(text: string): number | null {
    const m = text.match(
      /(\d{1,2})\s*(?:\+|plus)?\s*(?:-|to|–)?\s*(\d{1,2})?\s*years?(?:'|’)?\s*(?:of\s+)?(?:relevant\s+|related\s+|industry\s+)?experience/i,
    );
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n >= 0 && n <= 45 ? n : null;
  }

  /** "28/28 rotation" -> "28/28" */
  parseRotation(text: string): string | null {
    const m = text.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b(?=[^\d]{0,20}(rotation|schedule|on|off))/i);
    if (m) return `${m[1]}/${m[2]}`;
    const m2 = text.match(/\b(\d{1,3})\s*(?:days?)?\s*on\s*(?:\/|and)?\s*(\d{1,3})\s*(?:days?)?\s*off\b/i);
    return m2 ? `${m2[1]}/${m2[2]}` : null;
  }

  extractSkills(text: string): string[] {
    const found: string[] = [];
    for (const s of SKILL_REGEXES) {
      if (s.re.test(text)) found.push(s.slug);
    }
    return uniq(found);
  }

  /** slug SEO duy nhất, đuôi hash 6 ký tự chống trùng. */
  buildSlug(title: string, company: string | null, city: string | null, hash: string): string {
    return slugify([title, company, city].filter(Boolean).join(' ')).slice(0, 200) + '-' + hash.slice(0, 6);
  }

  /** Job chỉ được publish khi thuộc 4 nhóm mục tiêu. */
  isTargetDiscipline(d: Discipline): boolean {
    return d !== Discipline.OTHER;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
