import { Discipline } from './enums';

export const CLASSIFIER_VERSION = 'rule-v1.3.0';

/**
 * Trọng số keyword.
 * - Weight 10: "smoking gun" – gần như chắc chắn thuộc nhóm đó.
 * - Weight 5-7: thuật ngữ chuyên ngành mạnh.
 * - Weight 2-3: thuật ngữ hỗ trợ, chỉ đủ sức khi cộng dồn.
 *
 * `pattern` là chuỗi regex (đã escape), matching case-insensitive trên
 * text đã normalize (lowercase, bỏ ký tự lạ). Dùng \b để tránh khớp một phần.
 */
export interface KeywordRule {
  pattern: string;
  weight: number;
  /** Chỉ áp dụng khi khớp trong tiêu đề (title) – tránh nhiễu từ mô tả dài. */
  titleOnly?: boolean;
}

export interface DisciplineDictionary {
  discipline: Discipline;
  /** Bonus khi cụm từ xuất hiện ở title */
  titleBoost: number;
  keywords: KeywordRule[];
}

export const DISCIPLINE_KEYWORDS: DisciplineDictionary[] = [
  {
    discipline: Discipline.RESERVOIR,
    titleBoost: 2.0,
    keywords: [
      { pattern: '\\breservoir\\s+engineer(ing|s)?\\b', weight: 10 },
      // Tiếng Pháp đảo trật tự danh từ: "Ingénieur Réservoir" chứ không phải
      // "Reservoir Engineer". Thêm sau khi bổ sung TotalEnergies (2026-08-31) —
      // phần lớn tin của họ bằng tiếng Pháp. normalizeText đã bỏ dấu nên chỉ cần
      // viết dạng không dấu.
      { pattern: '\\bingenieur\\s+reservoir\\b', weight: 10 },
      { pattern: '\\bsenior\\s+reservoir\\b', weight: 10 },
      { pattern: '\\breservoir\\s+(simulation|modell?ing|management|characteri[sz]ation)\\b', weight: 9 },
      { pattern: '\\bdynamic\\s+(reservoir\\s+)?modell?ing\\b', weight: 7 },
      { pattern: '\\bmaterial\\s+balance\\b', weight: 7 },
      { pattern: '\\bhistory\\s+match(ing)?\\b', weight: 8 },
      { pattern: '\\b(eclipse|petrel\\s*rc|tnavigator|cmg\\s*(gem|imex|stars)|intersect|ix\\b)', weight: 8 },
      { pattern: '\\bmbal\\b', weight: 7 },
      { pattern: '\\b(pvt|fluid)\\s+(analysis|characteri[sz]ation|modell?ing)\\b', weight: 6 },
      { pattern: '\\bwell\\s*test(ing)?\\s+(analysis|interpretation)\\b', weight: 6 },
      { pattern: '\\b(saphir|topaze|ecrin|kappa)\\b', weight: 6 },
      { pattern: '\\bpressure\\s+transient\\s+analysis\\b', weight: 7 },
      { pattern: '\\brate\\s+transient\\s+analysis\\b', weight: 7 },
      { pattern: '\\b(eor|ior)\\b', weight: 6 },
      { pattern: '\\benhanced\\s+oil\\s+recovery\\b', weight: 7 },
      { pattern: '\\b(stoiip|ooip|giip|oiip)\\b', weight: 7 },
      { pattern: '\\breserves?\\s+(estimation|evaluation|booking|certification|audit)\\b', weight: 8 },
      { pattern: '\\b(spe|prms)\\s+reserves?\\b', weight: 6 },
      { pattern: '\\bdecline\\s+curve\\s+analysis\\b', weight: 7 },
      { pattern: '\\brecovery\\s+factor\\b', weight: 5 },
      { pattern: '\\bfield\\s+development\\s+plan\\b', weight: 4 },
      { pattern: '\\bwater(\\s|-)?flood(ing)?\\b', weight: 5 },
      { pattern: '\\bgas\\s+injection\\b', weight: 3 },
      { pattern: '\\baquifer\\b', weight: 4 },
      { pattern: '\\bupscaling\\b', weight: 4 },
      { pattern: '\\bstreamline\\s+simulation\\b', weight: 6 },
      { pattern: '\\bccus?\\s+storage\\b', weight: 3 },
      { pattern: '\\bsubsurface\\s+engineer\\b', weight: 5 },
    ],
  },
  {
    discipline: Discipline.PETROLEUM,
    titleBoost: 2.0,
    keywords: [
      { pattern: '\\bpetroleum\\s+engineer(ing|s)?\\b', weight: 10 },
      { pattern: '\\bdrilling\\s+engineer(ing|s)?\\b', weight: 9 },
      { pattern: '\\bcompletion(s)?\\s+engineer(ing|s)?\\b', weight: 9 },
      // `wells?` chứ không phải `well`: "Drilling & Wells Engineer" của
      // TotalEnergies từng ra 0 điểm chỉ vì thiếu chữ "s". Đây là lỗ hổng với
      // TIẾNG ANH, không riêng gì tiếng Pháp.
      { pattern: '\\bwells?\\s+engineer(ing|s)?\\b', weight: 9 },
      { pattern: '\\bingenieur\\s+(forage|puits)\\b', weight: 9 },
      { pattern: '\\bwell\\s*bore\\s+(design|stability)\\b', weight: 7 },
      { pattern: '\\b(drilling|well)\\s+(supervisor|superintendent)\\b', weight: 7 },
      { pattern: '\\bdrilling\\s+(fluids?|optimi[sz]ation|programme?|operations)\\b', weight: 6 },
      { pattern: '\\bcasing\\s+(design|running)\\b', weight: 7 },
      { pattern: '\\bcement(ing)?\\s+(design|engineer|job)\\b', weight: 6 },
      { pattern: '\\btorque\\s+(and|&)\\s+drag\\b', weight: 7 },
      { pattern: '\\bwellplan|landmark\\s+compass|edm\\b', weight: 6 },
      { pattern: '\\bdirectional\\s+drilling\\b', weight: 6 },
      { pattern: '\\bmwd\\b|\\blwd\\b', weight: 5 },
      { pattern: '\\bhydraulic\\s+fractur(ing|e)\\b', weight: 6 },
      { pattern: '\\bfrac(k)?\\s+(design|crew|fleet)\\b', weight: 6 },
      { pattern: '\\bstimulation\\s+engineer\\b', weight: 7 },
      { pattern: '\\bwell\\s+(intervention|integrity)\\b', weight: 6 },
      { pattern: '\\bcoiled\\s+tubing\\b', weight: 5 },
      { pattern: '\\bsnubbing\\b', weight: 4 },
      { pattern: '\\bworkover\\b', weight: 5 },
      { pattern: '\\bplug\\s+(and|&)\\s+abandon(ment)?\\b|\\bp&a\\b', weight: 6 },
      { pattern: '\\bblowout\\s+prevent(er|ion)\\b|\\bbop\\b', weight: 4 },
      { pattern: '\\brig\\s+(move|manager|superintendent)\\b', weight: 4 },
      { pattern: '\\bwell\\s+control\\b', weight: 4 },
      { pattern: '\\bdrill\\s*string\\b', weight: 5 },
      { pattern: '\\bmud\\s+(logging|engineer|weight|window)\\b', weight: 5 },
      { pattern: '\\bkick\\s+toleran(ce|t)\\b', weight: 6 },
      { pattern: '\\btubular\\s+design\\b', weight: 5 },
      { pattern: '\\bopenserve|\\bosdu\\b', weight: 2 },
      { pattern: '\\bupstream\\s+engineer\\b', weight: 4 },
    ],
  },
  {
    discipline: Discipline.PRODUCTION,
    titleBoost: 2.0,
    keywords: [
      { pattern: '\\bproduction\\s+engineer(ing|s)?\\b', weight: 10 },
      { pattern: '\\bproduction\\s+(technolog(y|ist)|optimi[sz]ation|surveillance)\\b', weight: 9 },
      { pattern: '\\bartificial\\s+lift\\b', weight: 9 },
      { pattern: '\\b(esp|espcp)\\b', weight: 6 },
      { pattern: '\\belectrical\\s+submersible\\s+pump\\b', weight: 8 },
      { pattern: '\\bgas\\s+lift\\b', weight: 8 },
      { pattern: '\\b(sucker\\s+rod|beam)\\s+pump\\b', weight: 7 },
      { pattern: '\\bprogressive\\s+cavity\\s+pump\\b|\\bpcp\\b', weight: 6 },
      { pattern: '\\bplunger\\s+lift\\b', weight: 6 },
      { pattern: '\\bnodal\\s+analysis\\b', weight: 8 },
      { pattern: '\\b(prosper|gap\\b|petex|ipm\\b|pipesim|olga|ledaflow)\\b', weight: 7 },
      { pattern: '\\bmulti(-|\\s)?phase\\s+flow\\b', weight: 6 },
      { pattern: '\\bflow\\s*assurance\\b', weight: 8 },
      { pattern: '\\b(hydrate|wax|asphaltene|scale)\\s+(management|inhibit|mitigation|prediction)\\w*\\b', weight: 6 },
      { pattern: '\\bwell\\s+performance\\b', weight: 6 },
      { pattern: '\\bproduction\\s+(chemistry|allocation|forecast(ing)?)\\b', weight: 6 },
      { pattern: '\\bfacilit(y|ies)\\s+engineer\\b', weight: 5 },
      { pattern: '\\bsurface\\s+facilit(y|ies)\\b', weight: 5 },
      { pattern: '\\bseparator\\s+(design|sizing)\\b', weight: 5 },
      { pattern: '\\bprocess\\s+engineer\\b.*\\b(oil|gas|upstream|refinery|lng)\\b', weight: 4 },
      { pattern: '\\bsand\\s+(control|management)\\b', weight: 5 },
      { pattern: '\\bwater\\s+(injection|handling|treatment)\\b', weight: 3 },
      { pattern: '\\bchoke\\s+model(l)?ing\\b', weight: 5 },
      { pattern: '\\bdigital\\s+oil\\s*field\\b', weight: 4 },
      { pattern: '\\bwell\\s+surveillance\\b', weight: 6 },
      { pattern: '\\boperations\\s+engineer\\b.*\\b(oil|gas|upstream|offshore)\\b', weight: 4 },
      { pattern: '\\bproduction\\s+(supervisor|superintendent|technician)\\b', weight: 5 },
    ],
  },
  {
    discipline: Discipline.GEOSCIENCE,
    titleBoost: 2.0,
    keywords: [
      { pattern: '\\bgeoscien(ce|tist)\\b', weight: 10 },
      { pattern: '\\bgeologist\\b', weight: 9 },
      { pattern: '\\bgeophysicist\\b', weight: 10 },
      // Đối xứng với cặp petrophysicist/petrophysic(s|al) ngay bên dưới:
      // "Geophysical Analyst", "Geophysics Advisor", "Seismic Geophysics Lead"
      // trước đây không khớp mẫu nào vì chỉ có dạng danh từ chỉ người.
      { pattern: '\\bgeophysic(s|al)\\b', weight: 9 },
      // Dạng tiếng Pháp (đã bỏ dấu): géophysicien, géologue, géoscientifique,
      // sédimentologue, pétrophysicien.
      { pattern: '\\bgeophysicien(ne)?s?\\b', weight: 10 },
      { pattern: '\\bgeologue?s?\\b', weight: 9 },
      { pattern: '\\bgeoscientifiques?\\b', weight: 10 },
      { pattern: '\\bsedimentologues?\\b', weight: 9 },
      { pattern: '\\bpetrophysicien(ne)?s?\\b', weight: 10 },
      { pattern: '\\bpetrophysicist\\b', weight: 10 },
      { pattern: '\\bpetrophysic(s|al)\\b', weight: 9 },
      { pattern: '\\bformation\\s+evaluation\\b', weight: 10 },
      { pattern: '\\bformation\\s+(engineer|specialist|analyst)\\b', weight: 8 },
      { pattern: '\\bwireline\\s+(log|logging)\\b', weight: 7 },
      { pattern: '\\blog\\s+(analysis|analyst|interpretation)\\b', weight: 8 },
      { pattern: '\\bcore\\s+(analysis|analyst|description|scal)\\b', weight: 7 },
      { pattern: '\\bscal\\b', weight: 5 },
      { pattern: '\\b(techlog|interactive\\s+petrophysics|\\bip\\s+software|geolog|geographix|kingdom|petrel|dgb|opendtect)\\b', weight: 6 },
      { pattern: '\\bseismic\\s+(interpretation|processing|inversion|acquisition|imaging|attribute)\\w*\\b', weight: 9 },
      { pattern: '\\bavo\\b|\\bqi\\b|\\bquantitative\\s+interpretation\\b', weight: 6 },
      { pattern: '\\bdepth\\s+conversion\\b', weight: 6 },
      { pattern: '\\bvelocity\\s+model(l)?ing\\b', weight: 6 },
      { pattern: '\\bstatic\\s+model(l)?ing\\b', weight: 6 },
      { pattern: '\\bgeomodel(l)?(er|ing)\\b', weight: 8 },
      { pattern: '\\bstratigraph(y|ic)\\b', weight: 7 },
      { pattern: '\\bsedimentolog(y|ist)\\b', weight: 8 },
      { pattern: '\\bbiostratigraph(y|er)\\b', weight: 8 },
      { pattern: '\\bstructural\\s+geolog(y|ist)\\b', weight: 8 },
      { pattern: '\\bbasin\\s+(model(l)?ing|analysis)\\b', weight: 7 },
      { pattern: '\\bpore\\s+pressure\\s+prediction\\b', weight: 6 },
      { pattern: '\\bgeomechanic(s|al)\\b', weight: 6 },
      { pattern: '\\bfacies\\b', weight: 5 },
      { pattern: '\\bwell\\s*site\\s+geologist\\b', weight: 9 },
      { pattern: '\\boperations\\s+geologist\\b', weight: 9 },
      { pattern: '\\bexploration\\s+(geolog|manager|team)\\w*\\b', weight: 6 },
      { pattern: '\\bnmr\\s+log\\b|\\bsaturation\\s+height\\b', weight: 6 },
      { pattern: '\\bpetrophysical\\s+(evaluation|model)\\b', weight: 8 },
    ],
  },
];

/**
 * Negative keywords: nếu khớp, TRỪ điểm toàn cục.
 * Mục tiêu: loại các job "production" của ngành sản xuất/phim ảnh,
 * "reservoir" của thuỷ lợi, "petroleum" của kế toán/pháp lý, v.v.
 */
export const NEGATIVE_KEYWORDS: KeywordRule[] = [
  { pattern: '\\bfood\\s+production\\b', weight: 12 },
  { pattern: '\\b(video|film|music|media|content|broadcast|game)\\s+produc\\w*\\b', weight: 14 },
  { pattern: '\\bproduction\\s+(assistant|editor|designer|artist|coordinator\\s+for\\s+media)\\b', weight: 12 },
  { pattern: '\\bmanufacturing\\s+production\\s+(line|operator)\\b', weight: 10 },
  { pattern: '\\bwater\\s+reservoir\\s+(dam|irrigation)\\b', weight: 12 },
  { pattern: '\\b(dam|irrigation|hydropower)\\s+reservoir\\b', weight: 10 },
  { pattern: '\\bpetroleum\\s+(accountant|accounting|lawyer|legal|landman|tax)\\b', weight: 12 },
  { pattern: '\\bgas\\s+station\\s+(attendant|manager)\\b', weight: 14 },
  { pattern: '\\btruck\\s+driver\\b', weight: 12 },
  { pattern: '\\b(sales|marketing|recruit\\w*|hr\\b|human\\s+resources)\\s+(manager|executive|specialist)\\b', weight: 8 },
  { pattern: '\\bsoftware\\s+engineer\\b(?!.*\\b(reservoir|petrophysic|seismic|subsurface)\\b)', weight: 6 },
  { pattern: '\\bproduction\\s+support\\s+(engineer|analyst)\\b.*\\b(it|software|application)\\b', weight: 10 },
  { pattern: '\\bagricultur\\w*\\b', weight: 8 },
  { pattern: '\\bmining\\s+(geologist|engineer)\\b', weight: 5 },
];

/** Tín hiệu ngành O&G nói chung – dùng làm "gate" trước khi phân loại. */
export const INDUSTRY_SIGNALS: KeywordRule[] = [
  { pattern: '\\b(oil|gas)\\s*(and|&|/)\\s*(gas|oil)\\b', weight: 6 },
  { pattern: '\\bupstream\\b', weight: 5 },
  { pattern: '\\b(offshore|onshore)\\s+(platform|rig|field|operations)\\b', weight: 4 },
  { pattern: '\\bhydrocarbon\\b', weight: 5 },
  { pattern: '\\bwell(bore|head|s)?\\b', weight: 3 },
  { pattern: '\\breservoir\\b', weight: 3 },
  { pattern: '\\bsubsurface\\b', weight: 4 },
  { pattern: '\\bdrilling\\b', weight: 4 },
  { pattern: '\\bfpso\\b|\\blng\\b|\\bepc\\b', weight: 3 },
  { pattern: '\\bspe\\b|\\bsociety\\s+of\\s+petroleum\\s+engineers\\b', weight: 4 },
  { pattern: '\\bbarrel(s)?\\s+(per\\s+day|of\\s+oil)\\b|\\bbopd\\b|\\bmmscfd\\b', weight: 5 },
];

/** Từ khóa tiền lọc rẻ tiền (chạy trước khi fetch job detail) */
export const PREFILTER_TERMS: string[] = [
  'reservoir', 'petroleum', 'production engineer', 'production technolog',
  'drilling', 'completion', 'well engineer', 'workover', 'intervention',
  'geolog', 'geophys', 'petrophys', 'geoscien', 'formation evaluation',
  'seismic', 'subsurface', 'artificial lift', 'gas lift', 'flow assurance',
  'nodal', 'stimulation', 'frac', 'wireline', 'log analyst', 'field development',
  // Dạng tiếng Pháp (so khớp sau khi normalizeText đã bỏ dấu). Thiếu chúng thì
  // "Sédimentologue" trượt ngay ở cửa prefilter, không bao giờ tới được classifier.
  'sediment', 'ingenieur reservoir', 'geoscientifique',
];

/** Kỹ năng/phần mềm cần trích xuất để lưu vào bảng skills. */
export const SKILL_PATTERNS: { slug: string; name: string; category: string; pattern: string }[] = [
  { slug: 'petrel', name: 'Petrel', category: 'SOFTWARE', pattern: '\\bpetrel\\b' },
  { slug: 'eclipse', name: 'Eclipse', category: 'SOFTWARE', pattern: '\\beclipse\\b' },
  { slug: 'intersect', name: 'INTERSECT', category: 'SOFTWARE', pattern: '\\bintersect\\b' },
  { slug: 'cmg', name: 'CMG (GEM/IMEX/STARS)', category: 'SOFTWARE', pattern: '\\bcmg\\b|\\b(gem|imex|stars)\\b' },
  { slug: 'tnavigator', name: 'tNavigator', category: 'SOFTWARE', pattern: '\\btnavigator\\b' },
  { slug: 'techlog', name: 'Techlog', category: 'SOFTWARE', pattern: '\\btechlog\\b' },
  { slug: 'ip-senergy', name: 'Interactive Petrophysics', category: 'SOFTWARE', pattern: '\\binteractive\\s+petrophysics\\b' },
  { slug: 'geolog', name: 'Geolog', category: 'SOFTWARE', pattern: '\\bgeolog\\b' },
  { slug: 'kingdom', name: 'Kingdom', category: 'SOFTWARE', pattern: '\\bkingdom\\s+(suite|software)\\b' },
  { slug: 'opendtect', name: 'OpendTect', category: 'SOFTWARE', pattern: '\\bopendtect\\b' },
  { slug: 'prosper', name: 'PROSPER', category: 'SOFTWARE', pattern: '\\bprosper\\b' },
  { slug: 'gap', name: 'GAP', category: 'SOFTWARE', pattern: '\\bgap\\b(?=.*petex)' },
  { slug: 'mbal', name: 'MBAL', category: 'SOFTWARE', pattern: '\\bmbal\\b' },
  { slug: 'pipesim', name: 'PIPESIM', category: 'SOFTWARE', pattern: '\\bpipesim\\b' },
  { slug: 'olga', name: 'OLGA', category: 'SOFTWARE', pattern: '\\bolga\\b' },
  { slug: 'saphir', name: 'KAPPA Saphir', category: 'SOFTWARE', pattern: '\\bsaphir\\b|\\bkappa\\b' },
  { slug: 'wellplan', name: 'WELLPLAN', category: 'SOFTWARE', pattern: '\\bwellplan\\b' },
  { slug: 'compass', name: 'Landmark COMPASS', category: 'SOFTWARE', pattern: '\\bcompass\\b(?=.*landmark)' },
  { slug: 'python', name: 'Python', category: 'PROGRAMMING', pattern: '\\bpython\\b' },
  { slug: 'matlab', name: 'MATLAB', category: 'PROGRAMMING', pattern: '\\bmatlab\\b' },
  { slug: 'sql', name: 'SQL', category: 'PROGRAMMING', pattern: '\\bsql\\b' },
  { slug: 'machine-learning', name: 'Machine Learning', category: 'PROGRAMMING', pattern: '\\bmachine\\s+learning\\b|\\bdata\\s+science\\b' },
  { slug: 'history-matching', name: 'History Matching', category: 'DOMAIN', pattern: '\\bhistory\\s+match\\w*\\b' },
  { slug: 'nodal-analysis', name: 'Nodal Analysis', category: 'DOMAIN', pattern: '\\bnodal\\s+analysis\\b' },
  { slug: 'formation-evaluation', name: 'Formation Evaluation', category: 'DOMAIN', pattern: '\\bformation\\s+evaluation\\b' },
  { slug: 'seismic-interpretation', name: 'Seismic Interpretation', category: 'DOMAIN', pattern: '\\bseismic\\s+interpretation\\b' },
  { slug: 'well-testing', name: 'Well Testing', category: 'DOMAIN', pattern: '\\bwell\\s*test\\w*\\b' },
  { slug: 'eor', name: 'EOR / IOR', category: 'DOMAIN', pattern: '\\b(eor|ior)\\b|\\benhanced\\s+oil\\s+recovery\\b' },
  { slug: 'flow-assurance', name: 'Flow Assurance', category: 'DOMAIN', pattern: '\\bflow\\s*assurance\\b' },
  { slug: 'artificial-lift', name: 'Artificial Lift', category: 'DOMAIN', pattern: '\\bartificial\\s+lift\\b' },
  { slug: 'reserves-prms', name: 'Reserves / PRMS', category: 'DOMAIN', pattern: '\\bprms\\b|\\breserves?\\s+(estimation|booking)\\b' },
  { slug: 'hse', name: 'HSE', category: 'DOMAIN', pattern: '\\bhse\\b|\\bhsse\\b' },
];
