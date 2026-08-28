import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Discipline, retry } from '@og/shared';

/** Nhãn ngôn ngữ tự nhiên cho zero-shot – model hiểu tốt hơn tên enum. */
const HYPOTHESIS_LABELS: { label: string; discipline: Discipline }[] = [
  { label: 'reservoir engineering, reservoir simulation and reserves estimation', discipline: Discipline.RESERVOIR },
  { label: 'petroleum engineering, drilling and well completion engineering', discipline: Discipline.PETROLEUM },
  { label: 'production engineering, artificial lift and well production optimisation', discipline: Discipline.PRODUCTION },
  { label: 'geoscience, geology, geophysics, petrophysics and formation evaluation', discipline: Discipline.GEOSCIENCE },
  { label: 'unrelated to oil and gas subsurface or well engineering', discipline: Discipline.OTHER },
];

interface HfZeroShotResponse {
  labels: string[];
  scores: number[];
  sequence?: string;
}

/**
 * Lớp NLP tùy chọn. Bật bằng HF_ENABLED=true + HF_API_TOKEN.
 * Chỉ được gọi cho các job mà rule-based không quyết định được (~3-5%),
 * nên chi phí và độ trễ giữ ở mức chấp nhận được.
 *
 * Có in-memory cache theo hash text để tránh gọi lặp trong cùng phiên scrape.
 */
@Injectable()
export class HuggingFaceService {
  private readonly logger = new Logger(HuggingFaceService.name);
  private readonly http: AxiosInstance;
  private readonly cache = new Map<string, Record<Discipline, number>>();
  private readonly MAX_CACHE = 5000;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: 'https://api-inference.huggingface.co/models',
      timeout: this.config.get<number>('classifier.hfTimeoutMs') ?? 15000,
    });
  }

  get enabled(): boolean {
    return (
      Boolean(this.config.get<boolean>('classifier.hfEnabled')) &&
      Boolean(this.config.get<string>('classifier.hfToken'))
    );
  }

  async zeroShot(text: string): Promise<Record<Discipline, number> | null> {
    if (!this.enabled) return null;
    const key = text.slice(0, 400);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const model = this.config.get<string>('classifier.hfModel')!;
    const token = this.config.get<string>('classifier.hfToken')!;

    try {
      const { data } = await retry(
        () =>
          this.http.post<HfZeroShotResponse>(
            `/${model}`,
            {
              inputs: text.slice(0, 2000),
              parameters: {
                candidate_labels: HYPOTHESIS_LABELS.map((l) => l.label),
                multi_label: false,
                hypothesis_template: 'This job posting is about {}.',
              },
              options: { wait_for_model: true },
            },
            { headers: { Authorization: `Bearer ${token}` } },
          ),
        { retries: 2, baseMs: 1200 },
      );

      if (!data?.labels || !data?.scores) return null;

      const result = {
        [Discipline.RESERVOIR]: 0,
        [Discipline.PETROLEUM]: 0,
        [Discipline.PRODUCTION]: 0,
        [Discipline.GEOSCIENCE]: 0,
        [Discipline.OTHER]: 0,
      } as Record<Discipline, number>;

      data.labels.forEach((label, i) => {
        const found = HYPOTHESIS_LABELS.find((l) => l.label === label);
        if (found) result[found.discipline] = data.scores[i];
      });

      if (this.cache.size >= this.MAX_CACHE) this.cache.clear();
      this.cache.set(key, result);
      return result;
    } catch (e) {
      this.logger.warn(`HuggingFace zero-shot lỗi, fallback về rule-based: ${(e as Error).message}`);
      return null;
    }
  }
}
