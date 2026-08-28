/**
 * Đánh giá nhanh classifier + normalizer trên tập mẫu có nhãn sẵn.
 * KHÔNG cần database – chạy hoàn toàn offline.
 *
 *   pnpm --filter @og/api exec ts-node src/scripts/classifier-eval.ts
 *
 * Dùng mỗi khi sửa packages/shared/src/keywords.ts để chắc chắn
 * thay đổi không làm tụt độ chính xác các case đã đúng trước đó.
 */
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Discipline, SalaryPeriod } from '@og/shared';
import { ClassifierService } from '../classifier/classifier.service';
import { HuggingFaceService } from '../classifier/huggingface.service';
import { NormalizerService } from '../normalizer/normalizer.service';

interface Sample {
  title: string;
  description: string;
  expected: Discipline;
}

const SAMPLES: Sample[] = [
  {
    title: 'Senior Reservoir Engineer',
    description:
      'Perform reservoir simulation and history matching using Eclipse and Petrel RE. Estimate STOIIP and reserves per SPE-PRMS. Support field development planning and waterflood optimisation for an offshore carbonate field.',
    expected: Discipline.RESERVOIR,
  },
  {
    title: 'Reservoir Simulation Specialist – EOR',
    description:
      'Build dynamic models, run streamline simulation, evaluate enhanced oil recovery schemes including gas injection. Experience with CMG GEM and material balance (MBAL) required. Oil and gas upstream.',
    expected: Discipline.RESERVOIR,
  },
  {
    title: 'Drilling Engineer – Offshore Jack-up',
    description:
      'Prepare drilling programmes, casing design and torque and drag analysis using WELLPLAN. Manage mud weight window, kick tolerance and well control. Liaise with rig superintendent on a 28/28 rotation. Salary USD 140,000 - 180,000 per year.',
    expected: Discipline.PETROLEUM,
  },
  {
    title: 'Well Completion Engineer',
    description:
      'Design lower and upper completions, sand control and hydraulic fracturing programmes. Support well intervention, coiled tubing and workover operations for an onshore unconventional asset. Minimum 8 years of relevant experience.',
    expected: Discipline.PETROLEUM,
  },
  {
    title: 'Production Engineer – Artificial Lift',
    description:
      'Optimise ESP and gas lift performance, run nodal analysis in PROSPER and GAP, and manage flow assurance issues including hydrate and wax deposition using PIPESIM/OLGA. Well surveillance and production allocation.',
    expected: Discipline.PRODUCTION,
  },
  {
    title: 'Production Technologist',
    description:
      'Well performance monitoring, production optimisation, scale and asphaltene inhibition, choke modelling, digital oil field initiatives. Offshore FPSO operations, oil and gas upstream, 14/14 rotation.',
    expected: Discipline.PRODUCTION,
  },
  {
    title: 'Senior Petrophysicist',
    description:
      'Formation evaluation and log analysis using Techlog and Interactive Petrophysics. Core analysis / SCAL integration, saturation height modelling and NMR log interpretation for clastic and carbonate reservoirs.',
    expected: Discipline.GEOSCIENCE,
  },
  {
    title: 'Exploration Geophysicist',
    description:
      'Seismic interpretation and inversion, AVO / quantitative interpretation, depth conversion and velocity modelling in Petrel and OpendTect. Basin modelling and prospect risking for an offshore exploration portfolio.',
    expected: Discipline.GEOSCIENCE,
  },
  {
    title: 'Wellsite Geologist',
    description:
      'Operations geology support at the wellsite, mud logging supervision, formation tops picking, pore pressure prediction and biostratigraphy liaison. Offshore drilling campaign.',
    expected: Discipline.GEOSCIENCE,
  },
  // ── Các case PHẢI bị loại (OTHER) ──
  {
    title: 'Video Production Engineer',
    description: 'Manage broadcast studio equipment, media content production and live streaming workflows.',
    expected: Discipline.OTHER,
  },
  {
    title: 'Petroleum Accountant',
    description: 'Joint venture accounting, revenue allocation, royalty reporting and tax compliance for oil and gas assets.',
    expected: Discipline.OTHER,
  },
  {
    title: 'Production Line Operator',
    description: 'Operate manufacturing production line machinery in a food production facility. Shift work.',
    expected: Discipline.OTHER,
  },
  {
    title: 'Senior Software Engineer',
    description: 'Build React and Node.js microservices, CI/CD pipelines, AWS infrastructure for a fintech platform.',
    expected: Discipline.OTHER,
  },
];

/** ConfigService giả lập – tránh phải khởi động cả Nest app. */
class FakeConfig {
  private readonly values: Record<string, unknown> = {
    classifier: { minScore: 6, minMargin: 2, hfEnabled: false },
    'classifier.hfEnabled': false,
    'classifier.hfToken': undefined,
    'classifier.hfModel': 'none',
    'classifier.hfTimeoutMs': 15000,
    'fx.apiUrl': '',
  };
  get<T>(key: string): T {
    return this.values[key] as T;
  }
}

/** FxService giả lập: không chạm DB, dùng tỉ giá cố định. */
class FakeFx {
  async rate(code: string | null): Promise<number> {
    const map: Record<string, number> = { USD: 1, GBP: 0.79, AED: 3.67, NOK: 10.6 };
    return code ? (map[code] ?? 1) : 1;
  }
  async toUsdAnnual(s: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: SalaryPeriod | null;
  }): Promise<{ min: number | null; max: number | null }> {
    const per: Record<SalaryPeriod, number> = {
      [SalaryPeriod.HOUR]: 2080,
      [SalaryPeriod.DAY]: 220,
      [SalaryPeriod.WEEK]: 52,
      [SalaryPeriod.MONTH]: 12,
      [SalaryPeriod.YEAR]: 1,
    };
    const rate = await this.rate(s.currency);
    const f = per[s.period ?? SalaryPeriod.YEAR];
    const c = (v: number | null) => (v === null ? null : Math.round((v / rate) * f));
    return { min: c(s.min), max: c(s.max) };
  }
}

async function main(): Promise<void> {
  const config = new FakeConfig() as unknown as ConfigService;
  const hf = new HuggingFaceService(config);
  const classifier = new ClassifierService(config, hf);
  const normalizer = new NormalizerService(new FakeFx() as never, classifier);

  const rows: Record<string, string | number>[] = [];
  let correct = 0;

  for (const s of SAMPLES) {
    const r = await classifier.classify({ title: s.title, description: s.description });
    const ok = r.discipline === s.expected;
    if (ok) correct++;
    rows.push({
      title: s.title.slice(0, 42),
      expected: s.expected,
      got: r.discipline,
      conf: r.confidence,
      ok: ok ? '✓' : '✗',
    });
  }

  // eslint-disable-next-line no-console
  console.table(rows);
  // eslint-disable-next-line no-console
  console.log(`\nĐộ chính xác: ${correct}/${SAMPLES.length} = ${Math.round((correct / SAMPLES.length) * 100)}%\n`);

  // ── Kiểm tra normalizer ──
  const locCases = [
    'Abu Dhabi, United Arab Emirates',
    'Aberdeen, UK',
    'Houston, TX',
    'Stavanger, Norway',
    'Kuala Lumpur, Malaysia',
  ];
  // eslint-disable-next-line no-console
  console.table(locCases.map((l) => ({ input: l, ...normalizer.parseLocation(l) })));

  const salaryCases = [
    '$120,000 - $150,000 per year',
    '£650 per day',
    'AED 45,000 monthly',
    'USD 90k-110k per annum',
    'Competitive salary',
  ];
  // eslint-disable-next-line no-console
  console.table(salaryCases.map((s) => ({ input: s, ...normalizer.parseSalary(s, null) })));

  const miscCases = [
    'Offshore role on a 28/28 rotation, minimum 10 years of relevant experience, permanent contract',
    'Hybrid working, fixed-term contract, 3 years experience',
  ];
  // eslint-disable-next-line no-console
  console.table(
    miscCases.map((t) => ({
      workMode: normalizer.parseWorkMode(t),
      employment: normalizer.parseEmploymentType(t),
      rotation: normalizer.parseRotation(t),
      years: normalizer.parseExperience(t),
    })),
  );

  process.exitCode = correct === SAMPLES.length ? 0 : 1;
}

void main();
