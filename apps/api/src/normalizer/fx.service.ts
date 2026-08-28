import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { FALLBACK_FX_TO_USD, SalaryPeriod } from '@og/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Số kỳ trong 1 năm để quy đổi mọi mức lương về USD/năm – so sánh được giữa các nước. */
const PERIODS_PER_YEAR: Record<SalaryPeriod, number> = {
  [SalaryPeriod.HOUR]: 2080, // 40h/tuần × 52
  [SalaryPeriod.DAY]: 220, // ngày công thực tế
  [SalaryPeriod.WEEK]: 52,
  [SalaryPeriod.MONTH]: 12,
  [SalaryPeriod.YEAR]: 1,
};

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  /** cache in-memory, refresh khi cron chạy hoặc sau 6h */
  private cache: Record<string, number> = { ...FALLBACK_FX_TO_USD };
  private cacheAt = 0;
  private readonly TTL_MS = 6 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async ensureCache(): Promise<void> {
    if (Date.now() - this.cacheAt < this.TTL_MS) return;
    try {
      const rows = await this.prisma.fxRate.findMany();
      if (rows.length > 0) {
        this.cache = rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.code] = Number(r.rateToUsd);
          return acc;
        }, {});
      }
      this.cacheAt = Date.now();
    } catch (e) {
      this.logger.warn(`Không đọc được fx_rates, dùng fallback: ${(e as Error).message}`);
    }
  }

  /** Lấy tỉ giá: 1 USD = X <code> */
  async rate(code: string | null): Promise<number> {
    if (!code) return 1;
    await this.ensureCache();
    return this.cache[code.toUpperCase()] ?? FALLBACK_FX_TO_USD[code.toUpperCase()] ?? 1;
  }

  /** Quy đổi khoảng lương về USD/năm. */
  async toUsdAnnual(salary: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: SalaryPeriod | null;
  }): Promise<{ min: number | null; max: number | null }> {
    if (salary.min === null && salary.max === null) return { min: null, max: null };
    const rate = await this.rate(salary.currency ?? 'USD');
    const factor = PERIODS_PER_YEAR[salary.period ?? SalaryPeriod.YEAR];
    const conv = (v: number | null): number | null =>
      v === null ? null : Math.round((v / rate) * factor * 100) / 100;
    return { min: conv(salary.min), max: conv(salary.max) };
  }

  /** Cron gọi hàm này: kéo tỉ giá mới và ghi vào DB. */
  async refreshRates(): Promise<number> {
    const url = this.config.get<string>('fx.apiUrl')!;
    try {
      const { data } = await axios.get<{ rates?: Record<string, number> }>(url, { timeout: 15000 });
      const rates = data?.rates;
      if (!rates || Object.keys(rates).length === 0) {
        throw new Error('Response không có trường rates');
      }
      const codes = Object.keys(FALLBACK_FX_TO_USD);
      const ops = codes
        .filter((c) => Number.isFinite(rates[c]))
        .map((code) =>
          this.prisma.fxRate.upsert({
            where: { code },
            update: { rateToUsd: rates[code], fetchedAt: new Date() },
            create: { code, rateToUsd: rates[code] },
          }),
        );
      await this.prisma.$transaction(ops);
      this.cacheAt = 0; // ép reload
      this.logger.log(`Đã cập nhật ${ops.length} tỉ giá`);
      return ops.length;
    } catch (e) {
      this.logger.error(`Refresh FX thất bại, giữ tỉ giá cũ: ${(e as Error).message}`);
      return 0;
    }
  }
}
