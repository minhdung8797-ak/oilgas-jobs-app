/**
 * Seed dữ liệu nền: countries, companies, skills, fx_rates.
 * Chạy: pnpm db:seed
 * Đặt SEED_DEMO_JOBS=true để chèn thêm vài job demo (dùng khi phát triển FE).
 */
import { CompanyType, PrismaClient, SkillCategory } from '@prisma/client';
import { COUNTRIES, FALLBACK_FX_TO_USD, SKILL_PATTERNS, slugify } from '@og/shared';

const prisma = new PrismaClient();

const COMPANIES: {
  name: string;
  type: CompanyType;
  website?: string;
  careersUrl?: string;
  hq?: string;
}[] = [
  { name: 'SLB', type: 'SERVICE', website: 'https://www.slb.com', careersUrl: 'https://careers.slb.com', hq: 'US' },
  { name: 'Baker Hughes', type: 'SERVICE', website: 'https://www.bakerhughes.com', careersUrl: 'https://careers.bakerhughes.com', hq: 'US' },
  { name: 'Halliburton', type: 'SERVICE', website: 'https://www.halliburton.com', careersUrl: 'https://jobs.halliburton.com', hq: 'US' },
  { name: 'Weatherford', type: 'SERVICE', website: 'https://www.weatherford.com', hq: 'US' },
  { name: 'ExxonMobil', type: 'IOC', website: 'https://corporate.exxonmobil.com', careersUrl: 'https://jobs.exxonmobil.com', hq: 'US' },
  { name: 'Chevron', type: 'IOC', website: 'https://www.chevron.com', careersUrl: 'https://careers.chevron.com', hq: 'US' },
  { name: 'ConocoPhillips', type: 'IOC', website: 'https://www.conocophillips.com', hq: 'US' },
  { name: 'bp', type: 'IOC', website: 'https://www.bp.com', careersUrl: 'https://www.bp.com/en/global/corporate/careers.html', hq: 'GB' },
  { name: 'Shell', type: 'IOC', website: 'https://www.shell.com', careersUrl: 'https://www.shell.com/careers.html', hq: 'GB' },
  { name: 'TotalEnergies', type: 'IOC', website: 'https://totalenergies.com', careersUrl: 'https://careers.totalenergies.com', hq: 'FR' },
  { name: 'Eni', type: 'IOC', website: 'https://www.eni.com', hq: 'IT' },
  { name: 'Equinor', type: 'IOC', website: 'https://www.equinor.com', careersUrl: 'https://www.equinor.com/careers', hq: 'NO' },
  { name: 'Aker BP', type: 'IOC', website: 'https://www.akerbp.com', hq: 'NO' },
  { name: 'Woodside Energy', type: 'IOC', website: 'https://www.woodside.com', hq: 'AU' },
  { name: 'Petronas', type: 'NOC', website: 'https://www.petronas.com', careersUrl: 'https://www.petronas.com/careers', hq: 'MY' },
  { name: 'ADNOC', type: 'NOC', website: 'https://www.adnoc.ae', careersUrl: 'https://careers.adnoc.ae', hq: 'AE' },
  { name: 'Saudi Aramco', type: 'NOC', website: 'https://www.aramco.com', careersUrl: 'https://www.aramco.com/en/careers', hq: 'SA' },
  { name: 'QatarEnergy', type: 'NOC', website: 'https://www.qatarenergy.qa', hq: 'QA' },
  { name: 'KOC (Kuwait Oil Company)', type: 'NOC', website: 'https://www.kockw.com', hq: 'KW' },
  { name: 'PDO (Petroleum Development Oman)', type: 'NOC', website: 'https://www.pdo.co.om', hq: 'OM' },
  { name: 'Petrobras', type: 'NOC', website: 'https://petrobras.com.br', hq: 'BR' },
  { name: 'Sonangol', type: 'NOC', website: 'https://www.sonangol.co.ao', hq: 'AO' },
  { name: 'NNPC', type: 'NOC', website: 'https://www.nnpcgroup.com', hq: 'NG' },
  { name: 'PTTEP', type: 'NOC', website: 'https://www.pttep.com', hq: 'TH' },
  { name: 'PetroVietnam (PVN)', type: 'NOC', website: 'https://www.pvn.vn', hq: 'VN' },
  { name: 'KazMunayGas', type: 'NOC', website: 'https://www.kmg.kz', hq: 'KZ' },
  { name: 'Tullow Oil', type: 'IOC', website: 'https://www.tullowoil.com', hq: 'GB' },
  { name: 'Harbour Energy', type: 'IOC', website: 'https://www.harbourenergy.com', hq: 'GB' },
  { name: 'Wood', type: 'EPC', website: 'https://www.woodplc.com', hq: 'GB' },
  { name: 'Petrofac', type: 'EPC', website: 'https://www.petrofac.com', hq: 'GB' },
  { name: 'TechnipFMC', type: 'EPC', website: 'https://www.technipfmc.com', hq: 'GB' },
  { name: 'Saipem', type: 'EPC', website: 'https://www.saipem.com', hq: 'IT' },
  { name: 'Subsea7', type: 'EPC', website: 'https://www.subsea7.com', hq: 'GB' },
  { name: 'Worley', type: 'EPC', website: 'https://www.worley.com', hq: 'AU' },
  { name: 'RPS / Gaffney Cline', type: 'CONSULTANCY', website: 'https://www.gaffneycline.com', hq: 'GB' },
  { name: 'DeGolyer and MacNaughton', type: 'CONSULTANCY', website: 'https://www.demac.com', hq: 'US' },
  { name: 'Rigzone (board)', type: 'JOB_BOARD', website: 'https://www.rigzone.com', hq: 'US' },
  { name: 'Oil and Gas Job Search (board)', type: 'JOB_BOARD', website: 'https://www.oilandgasjobsearch.com', hq: 'GB' },
];

async function seedCountries() {
  for (const c of COUNTRIES) {
    await prisma.country.upsert({
      where: { code: c.code },
      update: { name: c.name, iso3: c.iso3, region: c.region, currency: c.currency },
      create: { code: c.code, iso3: c.iso3, name: c.name, region: c.region, currency: c.currency },
    });
  }
  console.log(`✓ countries: ${COUNTRIES.length}`);
}

async function seedCompanies() {
  for (const c of COMPANIES) {
    const hq = c.hq ? await prisma.country.findUnique({ where: { code: c.hq } }) : null;
    await prisma.company.upsert({
      where: { slug: slugify(c.name) },
      update: { name: c.name, type: c.type, website: c.website, careersUrl: c.careersUrl, hqCountryId: hq?.id ?? null },
      create: {
        slug: slugify(c.name),
        name: c.name,
        type: c.type,
        website: c.website,
        careersUrl: c.careersUrl,
        hqCountryId: hq?.id ?? null,
      },
    });
  }
  console.log(`✓ companies: ${COMPANIES.length}`);
}

async function seedSkills() {
  for (const s of SKILL_PATTERNS) {
    await prisma.skill.upsert({
      where: { slug: s.slug },
      update: { name: s.name, category: s.category as SkillCategory },
      create: { slug: s.slug, name: s.name, category: s.category as SkillCategory },
    });
  }
  console.log(`✓ skills: ${SKILL_PATTERNS.length}`);
}

async function seedFx() {
  for (const [code, rate] of Object.entries(FALLBACK_FX_TO_USD)) {
    await prisma.fxRate.upsert({
      where: { code },
      update: { rateToUsd: rate },
      create: { code, rateToUsd: rate },
    });
  }
  console.log(`✓ fx_rates: ${Object.keys(FALLBACK_FX_TO_USD).length}`);
}

async function main() {
  console.log('Seeding…');
  await seedCountries();
  await seedCompanies();
  await seedSkills();
  await seedFx();
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
