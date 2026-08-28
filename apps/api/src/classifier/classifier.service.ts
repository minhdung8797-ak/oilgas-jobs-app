import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CLASSIFIER_VERSION,
  ClassificationResult,
  DISCIPLINE_KEYWORDS,
  Discipline,
  INDUSTRY_SIGNALS,
  KeywordRule,
  NEGATIVE_KEYWORDS,
  PREFILTER_TERMS,
  clamp,
  normalizeText,
  truncate,
  uniq,
} from '@og/shared';
import { HuggingFaceService } from './huggingface.service';

interface CompiledRule extends KeywordRule {
  re: RegExp;
}
interface CompiledDict {
  discipline: Discipline;
  titleBoost: number;
  rules: CompiledRule[];
}

export interface ClassifyInput {
  title: string;
  description?: string;
  company?: string;
}

/**
 * ══════════════════════════════════════════════════════════════
 *  NLP CLASSIFICATION PIPELINE
 * ══════════════════════════════════════════════════════════════
 *  Bước 1 – PREFILTER  : loại rác bằng substring match (rẻ, O(n))
 *  Bước 2 – INDUSTRY   : job có thuộc ngành O&G không?
 *  Bước 3 – RULE SCORE : cộng điểm keyword có trọng số × vị trí
 *  Bước 4 – PENALTY    : trừ điểm negative keyword
 *  Bước 5 – DECISION   : so sánh top1 vs top2 (margin) và ngưỡng
 *  Bước 6 – HF FALLBACK: zero-shot khi kết quả mơ hồ (tùy chọn)
 * ══════════════════════════════════════════════════════════════
 *  Thiết kế rule-first vì:
 *   • Deterministic, giải thích được (audit matchedKeywords)
 *   • ~0.1ms/job -> xử lý 50k job/lần scrape không tốn kém
 *   • Không phụ thuộc API bên ngoài; HF chỉ là lớp phụ cho <5% case
 */
@Injectable()
export class ClassifierService {
  private readonly logger = new Logger(ClassifierService.name);
  private readonly dicts: CompiledDict[];
  private readonly negatives: CompiledRule[];
  private readonly industry: CompiledRule[];

  constructor(
    private readonly config: ConfigService,
    private readonly hf: HuggingFaceService,
  ) {
    // Compile regex 1 lần lúc khởi động – tránh new RegExp trong vòng lặp
    this.dicts = DISCIPLINE_KEYWORDS.map((d) => ({
      discipline: d.discipline,
      titleBoost: d.titleBoost,
      rules: d.keywords.map((k) => ({ ...k, re: new RegExp(k.pattern, 'i') })),
    }));
    this.negatives = NEGATIVE_KEYWORDS.map((k) => ({ ...k, re: new RegExp(k.pattern, 'i') }));
    this.industry = INDUSTRY_SIGNALS.map((k) => ({ ...k, re: new RegExp(k.pattern, 'i') }));
  }

  /**
   * Bước 1: tiền lọc cực rẻ, chạy trên danh sách kết quả tìm kiếm
   * TRƯỚC khi tốn request fetch trang chi tiết. Giảm ~80% lưu lượng.
   */
  prefilter(title: string, snippet = ''): boolean {
    const text = `${title} ${snippet}`.toLowerCase();
    return PREFILTER_TERMS.some((t) => text.includes(t));
  }

  /** Điểm tín hiệu ngành O&G – dùng làm cổng chặn job ngoài ngành. */
  industryScore(text: string): number {
    return this.industry.reduce((sum, r) => (r.re.test(text) ? sum + r.weight : sum), 0);
  }

  async classify(input: ClassifyInput): Promise<ClassificationResult> {
    const cfg = this.config.get('classifier') as {
      minScore: number;
      minMargin: number;
      hfEnabled: boolean;
    };

    const title = normalizeText(input.title);
    // Chỉ lấy 12k ký tự đầu của mô tả: phần sau thường là boilerplate pháp lý
    const body = normalizeText(truncate(input.description ?? '', 12000));
    const full = `${title} ${body}`;

    const rule = this.scoreRuleBased(title, body, full);

    // Cổng ngành: nếu không có tín hiệu O&G và điểm thấp -> OTHER ngay
    const industry = this.industryScore(full);
    if (industry < 4 && rule.top.score < cfg.minScore * 2) {
      return {
        discipline: Discipline.OTHER,
        confidence: 0,
        scores: rule.scores,
        matchedKeywords: rule.matched,
        method: 'rule',
        version: CLASSIFIER_VERSION,
      };
    }

    const decided = rule.top.score >= cfg.minScore && rule.margin >= cfg.minMargin;

    if (decided) {
      return {
        discipline: rule.top.discipline,
        confidence: this.toConfidence(rule.top.score, rule.margin),
        scores: rule.scores,
        matchedKeywords: rule.matched,
        method: 'rule',
        version: CLASSIFIER_VERSION,
      };
    }

    // Bước 6 – mơ hồ: thử HuggingFace zero-shot (nếu bật)
    if (cfg.hfEnabled && rule.top.score > 0) {
      const hfResult = await this.hf.zeroShot(`${input.title}. ${truncate(body, 1500)}`);
      if (hfResult) {
        // Hybrid: kết hợp điểm rule (đã chuẩn hóa) với xác suất HF
        const blended = this.blend(rule.scores, hfResult);
        const top = this.topOf(blended);
        if (top.score >= 0.45) {
          return {
            discipline: top.discipline,
            confidence: Math.round(top.score * 100) / 100,
            scores: rule.scores,
            matchedKeywords: rule.matched,
            method: 'hybrid',
            version: `${CLASSIFIER_VERSION}+hf`,
          };
        }
      }
    }

    // Vẫn mơ hồ nhưng có điểm khá -> vẫn gán nhãn với confidence thấp
    if (rule.top.score >= cfg.minScore) {
      return {
        discipline: rule.top.discipline,
        confidence: this.toConfidence(rule.top.score, rule.margin) * 0.7,
        scores: rule.scores,
        matchedKeywords: rule.matched,
        method: 'rule',
        version: CLASSIFIER_VERSION,
      };
    }

    return {
      discipline: Discipline.OTHER,
      confidence: 0,
      scores: rule.scores,
      matchedKeywords: rule.matched,
      method: 'rule',
      version: CLASSIFIER_VERSION,
    };
  }

  // ─────────────────────── RULE ENGINE ───────────────────────
  private scoreRuleBased(title: string, body: string, full: string) {
    const scores = {
      [Discipline.RESERVOIR]: 0,
      [Discipline.PETROLEUM]: 0,
      [Discipline.PRODUCTION]: 0,
      [Discipline.GEOSCIENCE]: 0,
      [Discipline.OTHER]: 0,
    } as Record<Discipline, number>;
    const matched: string[] = [];

    for (const dict of this.dicts) {
      let score = 0;
      for (const rule of dict.rules) {
        const inTitle = rule.re.test(title);
        const inBody = rule.titleOnly ? false : rule.re.test(body);
        if (!inTitle && !inBody) continue;

        // Tiêu đề là tín hiệu mạnh nhất -> nhân titleBoost.
        // Mô tả chỉ tính 1 lần (không đếm tần suất) để tránh spam keyword.
        if (inTitle) score += rule.weight * dict.titleBoost;
        if (inBody) score += rule.weight * 0.55;

        const m = full.match(rule.re);
        if (m) matched.push(m[0].trim());
      }
      scores[dict.discipline] = Math.round(score * 100) / 100;
    }

    // Penalty toàn cục
    let penalty = 0;
    for (const n of this.negatives) {
      if (n.re.test(full)) penalty += n.weight;
    }
    if (penalty > 0) {
      for (const d of Object.keys(scores) as Discipline[]) {
        scores[d] = Math.max(0, Math.round((scores[d] - penalty) * 100) / 100);
      }
    }

    const ranked = (Object.entries(scores) as [Discipline, number][])
      .filter(([d]) => d !== Discipline.OTHER)
      .sort((a, b) => b[1] - a[1]);

    const top = { discipline: ranked[0][0], score: ranked[0][1] };
    const second = ranked[1]?.[1] ?? 0;

    return { scores, matched: uniq(matched).slice(0, 25), top, margin: top.score - second, penalty };
  }

  /** Ánh xạ điểm thô -> confidence 0..1 (logistic mềm, không bao giờ đạt 1.0). */
  private toConfidence(score: number, margin: number): number {
    const base = 1 - Math.exp(-score / 25);
    const marginBoost = clamp(margin / 30, 0, 0.25);
    return Math.round(clamp(base * 0.8 + marginBoost, 0, 0.99) * 100) / 100;
  }

  private blend(
    ruleScores: Record<Discipline, number>,
    hfScores: Record<Discipline, number>,
  ): Record<Discipline, number> {
    const maxRule = Math.max(...Object.values(ruleScores), 1);
    const out = {} as Record<Discipline, number>;
    for (const d of Object.keys(ruleScores) as Discipline[]) {
      const r = ruleScores[d] / maxRule; // chuẩn hóa 0..1
      const h = hfScores[d] ?? 0;
      out[d] = Math.round((0.6 * r + 0.4 * h) * 1000) / 1000; // rule vẫn nặng hơn
    }
    return out;
  }

  private topOf(scores: Record<Discipline, number>): { discipline: Discipline; score: number } {
    const ranked = (Object.entries(scores) as [Discipline, number][])
      .filter(([d]) => d !== Discipline.OTHER)
      .sort((a, b) => b[1] - a[1]);
    return { discipline: ranked[0][0], score: ranked[0][1] };
  }
}
