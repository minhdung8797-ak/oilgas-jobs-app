export interface CountryDef {
  code: string; // ISO 3166-1 alpha-2
  iso3: string;
  name: string;
  region: string;
  currency: string;
  /** alias thường gặp trong chuỗi location của job board */
  aliases: string[];
}

/**
 * Danh sách quốc gia trọng điểm ngành dầu khí + alias dùng cho normalizer.
 * Không cần đủ 249 nước – chỉ cần nơi thực sự có job O&G; phần còn lại rơi về null
 * và được đánh dấu `locationRaw` để review thủ công.
 */
export const COUNTRIES: CountryDef[] = [
  { code: 'US', iso3: 'USA', name: 'United States', region: 'North America', currency: 'USD', aliases: ['usa', 'u.s.', 'u.s.a', 'united states of america', 'texas', 'houston', 'oklahoma', 'louisiana', 'north dakota', 'midland', 'denver', 'alaska', 'new mexico', 'pennsylvania', 'california', 'bel air'] },
  { code: 'CA', iso3: 'CAN', name: 'Canada', region: 'North America', currency: 'CAD', aliases: ['canada', 'alberta', 'calgary', 'saskatchewan', 'newfoundland'] },
  { code: 'MX', iso3: 'MEX', name: 'Mexico', region: 'Latin America', currency: 'MXN', aliases: ['mexico', 'villahermosa', 'ciudad del carmen'] },
  { code: 'BR', iso3: 'BRA', name: 'Brazil', region: 'Latin America', currency: 'BRL', aliases: ['brazil', 'brasil', 'rio de janeiro', 'macae'] },
  { code: 'AR', iso3: 'ARG', name: 'Argentina', region: 'Latin America', currency: 'ARS', aliases: ['argentina', 'neuquen', 'vaca muerta', 'buenos aires'] },
  { code: 'CO', iso3: 'COL', name: 'Colombia', region: 'Latin America', currency: 'COP', aliases: ['colombia', 'bogota'] },
  { code: 'GY', iso3: 'GUY', name: 'Guyana', region: 'Latin America', currency: 'GYD', aliases: ['guyana', 'georgetown'] },
  { code: 'TT', iso3: 'TTO', name: 'Trinidad and Tobago', region: 'Latin America', currency: 'TTD', aliases: ['trinidad', 'tobago', 'port of spain'] },
  { code: 'VE', iso3: 'VEN', name: 'Venezuela', region: 'Latin America', currency: 'VES', aliases: ['venezuela', 'caracas'] },
  { code: 'GB', iso3: 'GBR', name: 'United Kingdom', region: 'Europe', currency: 'GBP', aliases: ['uk', 'u.k.', 'united kingdom', 'england', 'scotland', 'aberdeen', 'london', 'great britain', 'wales'] },
  { code: 'NO', iso3: 'NOR', name: 'Norway', region: 'Europe', currency: 'NOK', aliases: ['norway', 'norge', 'stavanger', 'bergen', 'oslo', 'trondheim', 'harstad'] },
  { code: 'NL', iso3: 'NLD', name: 'Netherlands', region: 'Europe', currency: 'EUR', aliases: ['netherlands', 'holland', 'the hague', 'den haag', 'amsterdam', 'rijswijk', 'assen'] },
  { code: 'DK', iso3: 'DNK', name: 'Denmark', region: 'Europe', currency: 'DKK', aliases: ['denmark', 'copenhagen', 'esbjerg'] },
  // 'hannover'/'lower saxony': Vermilion đặt đội thăm dò ở đó và ô địa điểm chỉ
  // ghi "Hannover, Lower Saxony", không kèm tên nước.
  { code: 'DE', iso3: 'DEU', name: 'Germany', region: 'Europe', currency: 'EUR', aliases: ['germany', 'deutschland', 'celle', 'hamburg', 'munich', 'hannover', 'hanover', 'lower saxony', 'niedersachsen'] },
  { code: 'FR', iso3: 'FRA', name: 'France', region: 'Europe', currency: 'EUR', aliases: ['france', 'paris', 'pau', 'la defense', 'courbevoie'] },
  { code: 'IT', iso3: 'ITA', name: 'Italy', region: 'Europe', currency: 'EUR', aliases: ['italy', 'italia', 'milan', 'ravenna', 'san donato'] },
  { code: 'RO', iso3: 'ROU', name: 'Romania', region: 'Europe', currency: 'RON', aliases: ['romania', 'bucharest', 'ploiesti', 'craiova', 'campina'] },
  // OMV đóng trụ sở ở Áo; phần lớn tin của họ ghi "Schwechat, Lower Austria, AT".
  // Bí danh 'austria' không đụng 'australia' vì khớp theo ranh giới từ, và
  // ALIAS_INDEX ưu tiên bí danh dài hơn.
  { code: 'AT', iso3: 'AUT', name: 'Austria', region: 'Europe', currency: 'EUR', aliases: ['austria', 'vienna', 'wien', 'schwechat', 'gaenserndorf'] },
  { code: 'AZ', iso3: 'AZE', name: 'Azerbaijan', region: 'Caspian', currency: 'AZN', aliases: ['azerbaijan', 'baku'] },
  { code: 'KZ', iso3: 'KAZ', name: 'Kazakhstan', region: 'Caspian', currency: 'KZT', aliases: ['kazakhstan', 'atyrau', 'aktau', 'almaty', 'astana', 'tengiz'] },
  { code: 'RU', iso3: 'RUS', name: 'Russia', region: 'Caspian', currency: 'RUB', aliases: ['russia', 'moscow', 'tyumen', 'sakhalin'] },
  { code: 'AE', iso3: 'ARE', name: 'United Arab Emirates', region: 'Middle East', currency: 'AED', aliases: ['uae', 'u.a.e', 'united arab emirates', 'abu dhabi', 'dubai', 'sharjah', 'ruwais'] },
  { code: 'SA', iso3: 'SAU', name: 'Saudi Arabia', region: 'Middle East', currency: 'SAR', aliases: ['saudi', 'saudi arabia', 'ksa', 'dhahran', 'riyadh', 'al khobar', 'jubail', 'udhailiyah'] },
  { code: 'QA', iso3: 'QAT', name: 'Qatar', region: 'Middle East', currency: 'QAR', aliases: ['qatar', 'doha', 'ras laffan'] },
  { code: 'KW', iso3: 'KWT', name: 'Kuwait', region: 'Middle East', currency: 'KWD', aliases: ['kuwait', 'ahmadi'] },
  { code: 'OM', iso3: 'OMN', name: 'Oman', region: 'Middle East', currency: 'OMR', aliases: ['oman', 'muscat', 'nimr'] },
  { code: 'BH', iso3: 'BHR', name: 'Bahrain', region: 'Middle East', currency: 'BHD', aliases: ['bahrain', 'manama'] },
  { code: 'IQ', iso3: 'IRQ', name: 'Iraq', region: 'Middle East', currency: 'IQD', aliases: ['iraq', 'basra', 'basrah', 'erbil', 'kurdistan', 'kirkuk', 'hamrin', 'salah ad din'] },
  // 'syrian arab republic' là tên chính thức mà nhiều hệ thống tuyển dụng dùng
  // (UKG/UltiPro của HKN Energy trả đúng chuỗi đó). Thiếu bí danh này thì 17 tin
  // ở Rmelan rơi vào country = null và biến mất khỏi bộ lọc quốc gia.
  { code: 'SY', iso3: 'SYR', name: 'Syria', region: 'Middle East', currency: 'SYP', aliases: ['syria', 'syrian arab republic', 'rmelan', 'rmeilan', 'rmilan', 'damascus', 'hasakah'] },
  { code: 'NG', iso3: 'NGA', name: 'Nigeria', region: 'Africa', currency: 'NGN', aliases: ['nigeria', 'lagos', 'port harcourt', 'warri'] },
  { code: 'AO', iso3: 'AGO', name: 'Angola', region: 'Africa', currency: 'AOA', aliases: ['angola', 'luanda', 'soyo'] },
  { code: 'EG', iso3: 'EGY', name: 'Egypt', region: 'Africa', currency: 'EGP', aliases: ['egypt', 'cairo', 'alexandria'] },
  { code: 'DZ', iso3: 'DZA', name: 'Algeria', region: 'Africa', currency: 'DZD', aliases: ['algeria', 'algiers', 'hassi messaoud'] },
  { code: 'LY', iso3: 'LBY', name: 'Libya', region: 'Africa', currency: 'LYD', aliases: ['libya', 'tripoli'] },
  { code: 'GH', iso3: 'GHA', name: 'Ghana', region: 'Africa', currency: 'GHS', aliases: ['ghana', 'accra', 'takoradi'] },
  { code: 'CG', iso3: 'COG', name: 'Congo', region: 'Africa', currency: 'XAF', aliases: ['congo', 'pointe-noire', 'pointe noire', 'brazzaville'] },
  { code: 'GQ', iso3: 'GNQ', name: 'Equatorial Guinea', region: 'Africa', currency: 'XAF', aliases: ['equatorial guinea', 'malabo'] },
  { code: 'MZ', iso3: 'MOZ', name: 'Mozambique', region: 'Africa', currency: 'MZN', aliases: ['mozambique', 'maputo', 'palma', 'afungi'] },
  { code: 'SN', iso3: 'SEN', name: 'Senegal', region: 'Africa', currency: 'XOF', aliases: ['senegal', 'dakar'] },
  { code: 'NA', iso3: 'NAM', name: 'Namibia', region: 'Africa', currency: 'NAD', aliases: ['namibia', 'windhoek', 'walvis bay'] },
  { code: 'MY', iso3: 'MYS', name: 'Malaysia', region: 'Asia Pacific', currency: 'MYR', aliases: ['malaysia', 'kuala lumpur', 'miri', 'kerteh', 'labuan', 'sarawak'] },
  { code: 'ID', iso3: 'IDN', name: 'Indonesia', region: 'Asia Pacific', currency: 'IDR', aliases: ['indonesia', 'jakarta', 'balikpapan', 'duri'] },
  { code: 'SG', iso3: 'SGP', name: 'Singapore', region: 'Asia Pacific', currency: 'SGD', aliases: ['singapore'] },
  { code: 'VN', iso3: 'VNM', name: 'Vietnam', region: 'Asia Pacific', currency: 'VND', aliases: ['vietnam', 'viet nam', 'ho chi minh', 'hanoi', 'vung tau'] },
  { code: 'TH', iso3: 'THA', name: 'Thailand', region: 'Asia Pacific', currency: 'THB', aliases: ['thailand', 'bangkok', 'songkhla'] },
  { code: 'BN', iso3: 'BRN', name: 'Brunei', region: 'Asia Pacific', currency: 'BND', aliases: ['brunei', 'seria', 'bandar seri begawan'] },
  // ── Bổ sung 2026-09-03 sau khi mở được nguồn SLB ──
  // SLB tuyển ở 80 địa điểm khác nhau; 13 nước dưới đây chưa có trong bảng, nên
  // tin ở đó sẽ rơi vào country = null và biến mất khỏi bộ lọc quốc gia.
  { code: 'JP', iso3: 'JPN', name: 'Japan', region: 'Asia Pacific', currency: 'JPY', aliases: ['japan', 'tokyo', 'yokohama'] },
  { code: 'PH', iso3: 'PHL', name: 'Philippines', region: 'Asia Pacific', currency: 'PHP', aliases: ['philippines', 'manila', 'batangas'] },
  { code: 'MM', iso3: 'MMR', name: 'Myanmar', region: 'Asia Pacific', currency: 'MMK', aliases: ['myanmar', 'burma', 'yangon'] },
  { code: 'PK', iso3: 'PAK', name: 'Pakistan', region: 'Asia Pacific', currency: 'PKR', aliases: ['pakistan', 'karachi', 'islamabad', 'lahore'] },
  { code: 'TM', iso3: 'TKM', name: 'Turkmenistan', region: 'Caspian', currency: 'TMT', aliases: ['turkmenistan', 'balkanabat', 'ashgabat'] },
  // 'turkiye' là cách viết chính thức từ 2022 và là chuỗi SLB đang dùng.
  { code: 'TR', iso3: 'TUR', name: 'Turkey', region: 'Europe', currency: 'TRY', aliases: ['turkey', 'turkiye', 'türkiye', 'istanbul', 'ankara'] },
  { code: 'HU', iso3: 'HUN', name: 'Hungary', region: 'Europe', currency: 'HUF', aliases: ['hungary', 'budapest'] },
  { code: 'GA', iso3: 'GAB', name: 'Gabon', region: 'Africa', currency: 'XAF', aliases: ['gabon', 'port-gentil', 'port gentil', 'libreville'] },
  { code: 'UG', iso3: 'UGA', name: 'Uganda', region: 'Africa', currency: 'UGX', aliases: ['uganda', 'kampala', 'hoima'] },
  // 'south sudan' dài hơn 'sudan' nên ALIAS_INDEX (sắp theo độ dài giảm dần) sẽ
  // khớp nó trước — không lo tin Nam Sudan bị gán nhầm sang Sudan.
  { code: 'SS', iso3: 'SSD', name: 'South Sudan', region: 'Africa', currency: 'SSP', aliases: ['south sudan', 'juba'] },
  { code: 'EC', iso3: 'ECU', name: 'Ecuador', region: 'Latin America', currency: 'USD', aliases: ['ecuador', 'quito', 'guayaquil'] },
  { code: 'SR', iso3: 'SUR', name: 'Suriname', region: 'Latin America', currency: 'SRD', aliases: ['suriname', 'paramaribo'] },
  { code: 'AU', iso3: 'AUS', name: 'Australia', region: 'Asia Pacific', currency: 'AUD', aliases: ['australia', 'perth', 'brisbane', 'melbourne', 'karratha', 'darwin'] },
  { code: 'IN', iso3: 'IND', name: 'India', region: 'Asia Pacific', currency: 'INR', aliases: ['india', 'mumbai', 'chennai', 'pune', 'ahmedabad', 'bengaluru', 'bangalore'] },
  { code: 'CN', iso3: 'CHN', name: 'China', region: 'Asia Pacific', currency: 'CNY', aliases: ['china', 'beijing', 'shanghai', 'shenzhen'] },
  { code: 'PG', iso3: 'PNG', name: 'Papua New Guinea', region: 'Asia Pacific', currency: 'PGK', aliases: ['papua new guinea', 'port moresby'] },
  { code: 'TL', iso3: 'TLS', name: 'Timor-Leste', region: 'Asia Pacific', currency: 'USD', aliases: ['timor-leste', 'east timor', 'dili'] },
];

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Ký hiệu tiền tệ -> mã ISO 4217, dùng khi parse chuỗi lương. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  'us$': 'USD',
  usd: 'USD',
  '£': 'GBP',
  gbp: 'GBP',
  '€': 'EUR',
  eur: 'EUR',
  'kr': 'NOK',
  nok: 'NOK',
  dkk: 'DKK',
  sek: 'SEK',
  'c$': 'CAD',
  cad: 'CAD',
  'a$': 'AUD',
  aud: 'AUD',
  aed: 'AED',
  'د.إ': 'AED',
  sar: 'SAR',
  qar: 'QAR',
  kwd: 'KWD',
  omr: 'OMR',
  bhd: 'BHD',
  myr: 'MYR',
  rm: 'MYR',
  sgd: 'SGD',
  's$': 'SGD',
  inr: 'INR',
  '₹': 'INR',
  idr: 'IDR',
  brl: 'BRL',
  'r$': 'BRL',
  ngn: 'NGN',
  '₦': 'NGN',
  egp: 'EGP',
  kzt: 'KZT',
  rub: 'RUB',
  cny: 'CNY',
  '¥': 'CNY',
  thb: 'THB',
  vnd: 'VND',
};

/**
 * Tỉ giá dự phòng (fallback) khi bảng fx_rates rỗng hoặc API lỗi.
 * Đơn vị: 1 USD = X đơn vị tiền tệ. Cron sẽ ghi đè bằng giá trị thật.
 */
export const FALLBACK_FX_TO_USD: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, NOK: 10.6, DKK: 6.9, SEK: 10.5, CAD: 1.36,
  AUD: 1.52, AED: 3.67, SAR: 3.75, QAR: 3.64, KWD: 0.31, OMR: 0.385,
  BHD: 0.376, MYR: 4.7, SGD: 1.35, INR: 83.2, IDR: 15800, BRL: 5.1,
  NGN: 1450, EGP: 47, KZT: 450, RUB: 92, CNY: 7.2, THB: 36, VND: 25000,
  MXN: 17.1, ARS: 900, COP: 3950, GYD: 209, TTD: 6.8, DZD: 134, LYD: 4.85,
  GHS: 14.5, XAF: 604, XOF: 604, NAD: 18.6, MZN: 63.8, AOA: 850, IQD: 1310,
  RON: 4.58, PGK: 3.8, AZN: 1.7, VES: 36, ZAR: 18.5, BND: 1.35, TWD: 32,
  SYP: 13000,
  JPY: 157, PHP: 58, MMK: 2100, PKR: 278, TMT: 3.5, TRY: 34,
  HUF: 360, UGX: 3700, SSP: 4500, SRD: 35,
};
