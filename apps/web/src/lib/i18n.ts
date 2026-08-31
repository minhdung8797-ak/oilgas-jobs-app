/**
 * ══════════════════════════════════════════════════════════════
 *  Song ngữ Việt – Anh
 * ══════════════════════════════════════════════════════════════
 *  Ngôn ngữ nằm trong URL (`?lang=en`) chứ không trong cookie hay localStorage.
 *  Ba lý do:
 *   1. Server Component đọc thẳng searchParams -> render sẵn đúng ngôn ngữ,
 *      không có cảnh chớp tiếng Việt rồi mới đổi sang tiếng Anh.
 *   2. Chia sẻ link giữ nguyên ngôn ngữ — gửi cho đồng nghiệp nước ngoài là họ
 *      thấy bản tiếng Anh.
 *   3. Toàn bộ trạng thái của app đã nằm trong URL (bộ lọc, phân trang, sắp xếp).
 *      Thêm cookie sẽ tạo ra nguồn sự thật thứ hai, dễ lệch nhau.
 *
 *  KHÔNG dịch nội dung job: tiêu đề, mô tả, tên công ty giữ nguyên như nguồn
 *  đăng. Dịch máy tin tuyển dụng sẽ làm sai nghĩa thuật ngữ kỹ thuật, và người
 *  ứng tuyển cần đọc đúng bản gốc mà nhà tuyển dụng viết.
 */

export type Lang = 'vi' | 'en';

export function parseLang(value: string | string[] | undefined): Lang {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'en' ? 'en' : 'vi';
}

/** Giữ nguyên mọi tham số hiện có, chỉ đổi `lang`. */
export function langHref(
  searchParams: Record<string, string | string[] | undefined>,
  lang: Lang,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === 'lang' || v === undefined) continue;
    params.set(k, Array.isArray(v) ? v.join(',') : v);
  }
  // 'vi' là mặc định nên không cần ghi vào URL
  if (lang === 'en') params.set('lang', 'en');
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

type Dict = Record<string, { vi: string; en: string }>;

const DICT: Dict = {
  // ── Điều hướng & khung ──
  navJobs: { vi: 'Việc làm', en: 'Jobs' },
  navCompanies: { vi: 'Công ty', en: 'Companies' },
  siteTagline: {
    vi: 'Dữ liệu được thu thập tự động từ các trang tuyển dụng công khai và phân loại bằng NLP. Luôn kiểm tra lại tại nguồn gốc trước khi ứng tuyển.',
    en: 'Data is collected automatically from public career sites and classified with NLP. Always verify at the original source before applying.',
  },

  // ── Trang chủ ──
  heroTitle: {
    vi: 'Việc làm dầu khí quốc tế, đã lọc sẵn cho bạn',
    en: 'International oil & gas jobs, pre-filtered for you',
  },
  heroBody: {
    vi: 'Thu thập tự động từ trang tuyển dụng chính thức của Baker Hughes, Chevron, bp, Shell, Eni, ADNOC, QatarEnergy, Halliburton và nhiều công ty khác, rồi phân loại bằng NLP vào 4 nhóm.',
    en: 'Collected automatically from the official career sites of Baker Hughes, Chevron, bp, Shell, Eni, ADNOC, QatarEnergy, Halliburton and others, then classified with NLP into 4 groups.',
  },
  heroCount: { vi: 'Hiện có', en: 'Currently' },
  heroCountSuffix: { vi: 'vị trí đang mở.', en: 'open positions.' },

  // ── Bộ lọc ──
  filters: { vi: 'Bộ lọc', en: 'Filters' },
  clearAll: { vi: 'Xóa tất cả', en: 'Clear all' },
  discipline: { vi: 'Nhóm ngành', en: 'Discipline' },
  postedWithin: { vi: 'Thời gian đăng', en: 'Posted within' },
  country: { vi: 'Quốc gia', en: 'Country' },
  allCountries: { vi: 'Tất cả quốc gia', en: 'All countries' },
  company: { vi: 'Công ty', en: 'Company' },
  workMode: { vi: 'Hình thức làm việc', en: 'Work mode' },
  employmentType: { vi: 'Loại hợp đồng', en: 'Employment type' },
  seniority: { vi: 'Cấp bậc', en: 'Seniority' },
  salary: { vi: 'Lương (USD/năm quy đổi)', en: 'Salary (USD/year converted)' },
  salaryAny: { vi: 'Bất kỳ', en: 'Any' },
  hasSalaryOnly: { vi: 'Chỉ job công bố lương', en: 'Only jobs with salary' },
  source: { vi: 'Nguồn dữ liệu', en: 'Source' },
  showMore: { vi: 'Xem thêm', en: 'Show' },
  showMoreSuffix: { vi: 'quốc gia', en: 'more countries' },
  // Nhóm "Công ty" cũng có nút xem thêm; dùng chung `showMoreSuffix` sẽ ra
  // "Show 5 more countries" nên cần hậu tố riêng.
  showMoreSuffixCompanies: { vi: 'công ty', en: 'more companies' },
  collapse: { vi: 'Thu gọn', en: 'Collapse' },
  h24: { vi: '24 giờ', en: '24 hours' },
  d7: { vi: '7 ngày', en: '7 days' },
  d30: { vi: '30 ngày', en: '30 days' },
  d90: { vi: '90 ngày', en: '90 days' },

  // ── Sắp xếp ──
  sortRecent: { vi: 'Mới nhất', en: 'Most recent' },
  sortRelevance: { vi: 'Liên quan nhất', en: 'Most relevant' },
  sortSalaryDesc: { vi: 'Lương cao → thấp', en: 'Salary: high → low' },
  sortSalaryAsc: { vi: 'Lương thấp → cao', en: 'Salary: low → high' },
  sortCompany: { vi: 'Theo công ty', en: 'By company' },
  // Nhãn cho trình đọc màn hình: placeholder quá dài nên không dùng làm aria-label.
  searchAria: { vi: 'Tìm kiếm việc làm', en: 'Search jobs' },
  sortAria: { vi: 'Sắp xếp', en: 'Sort' },
  searchPlaceholder: {
    vi: 'Tìm: "reservoir simulation", "gas lift", "petrophysicist Abu Dhabi"…',
    en: 'Search: "reservoir simulation", "gas lift", "petrophysicist Abu Dhabi"…',
  },

  // ── Thẻ job ──
  apply: { vi: 'Ứng tuyển', en: 'Apply' },
  details: { vi: 'Chi tiết', en: 'Details' },
  applyAtSource: { vi: 'Ứng tuyển tại nguồn', en: 'Apply at source' },
  noApplyLink: { vi: 'Nguồn không cung cấp link hợp lệ', en: 'Source provides no valid link' },
  mayBeClosed: {
    vi: 'Tin có thể đã đóng nếu nhà tuyển dụng gỡ sau lần cập nhật gần nhất',
    en: 'This posting may have closed if the employer removed it after our last update',
  },
  negotiable: { vi: 'Lương thỏa thuận', en: 'Salary negotiable' },
  needsReview: { vi: 'Cần xem lại', en: 'Needs review' },
  needsReviewHint: {
    vi: 'Độ tin cậy phân loại thấp – nên kiểm tra lại',
    en: 'Low classification confidence – worth double-checking',
  },
  yearsExp: { vi: 'năm KN', en: 'yrs exp' },
  unknownCompany: { vi: 'Không rõ công ty', en: 'Unknown company' },
  unknownLocation: { vi: 'Chưa rõ địa điểm', en: 'Location not specified' },

  // ── Trạng thái rỗng ──
  emptyTitle: { vi: 'Không tìm thấy việc làm phù hợp', en: 'No matching jobs found' },
  emptyHint: {
    vi: 'Thử bỏ bớt bộ lọc, mở rộng khoảng thời gian đăng, hoặc dùng từ khóa tổng quát hơn.',
    en: 'Try removing some filters, widening the date range, or using broader keywords.',
  },
  wakingTitle: { vi: 'Máy chủ đang khởi động', en: 'Server is waking up' },
  wakingHint: {
    vi: 'Máy chủ chạy trên gói miễn phí nên tự ngủ khi không có ai truy cập, và cần khoảng 60 giây để thức dậy. Chờ một lát rồi tải lại trang.',
    en: 'The server runs on a free plan, so it sleeps when idle and needs about 60 seconds to wake up. Wait a moment, then reload.',
  },

  // ── Trang công ty ──
  employers: { vi: 'Nhà tuyển dụng', en: 'Employers' },
  companiesCount: { vi: 'công ty', en: 'companies' },
  openPositions: { vi: 'vị trí đang mở', en: 'open positions' },

  // ── Phân trang ──
  page: { vi: 'Trang', en: 'Page' },
  jobsWord: { vi: 'việc làm', en: 'jobs' },
  paginationAria: { vi: 'Phân trang', en: 'Pagination' },
  prevPage: { vi: 'Trang trước', en: 'Previous page' },
  nextPage: { vi: 'Trang sau', en: 'Next page' },
};

/** Trả về hàm dịch cho một ngôn ngữ. Khoá thiếu thì trả về chính khoá đó. */
export function t(lang: Lang) {
  return (key: keyof typeof DICT): string => DICT[key]?.[lang] ?? String(key);
}

/** Nhãn 4 nhóm ngành — nằm riêng vì dùng ở cả StatsBar lẫn thẻ job. */
export const DISCIPLINE_LABEL_I18N: Record<string, { vi: string; en: string }> = {
  RESERVOIR: { vi: 'Reservoir Engineering', en: 'Reservoir Engineering' },
  PETROLEUM: { vi: 'Petroleum Engineering', en: 'Petroleum Engineering' },
  PRODUCTION: { vi: 'Production Engineering', en: 'Production Engineering' },
  GEOSCIENCE: { vi: 'Geoscience & Formation (G&F)', en: 'Geoscience & Formation (G&F)' },
  OTHER: { vi: 'Khác', en: 'Other' },
};

/**
 * Nhãn enum hiển thị trên MỌI thẻ job. Để trong i18n chứ không trong utils.ts vì
 * chúng phụ thuộc ngôn ngữ; `utils.ts` giữ các bảng cũ để không phá code hiện có,
 * nhưng mọi chỗ hiển thị nên dùng bảng dưới đây.
 */
export const WORK_MODE_I18N: Record<string, { vi: string; en: string }> = {
  ONSITE: { vi: 'Tại chỗ', en: 'Onsite' },
  OFFSHORE: { vi: 'Ngoài khơi', en: 'Offshore' },
  REMOTE: { vi: 'Từ xa', en: 'Remote' },
  HYBRID: { vi: 'Hybrid', en: 'Hybrid' },
  ROTATIONAL: { vi: 'Luân ca', en: 'Rotational' },
  UNKNOWN: { vi: '—', en: '—' },
};

export const EMPLOYMENT_I18N: Record<string, { vi: string; en: string }> = {
  FULL_TIME: { vi: 'Toàn thời gian', en: 'Full-time' },
  PART_TIME: { vi: 'Bán thời gian', en: 'Part-time' },
  CONTRACT: { vi: 'Hợp đồng', en: 'Contract' },
  TEMPORARY: { vi: 'Tạm thời', en: 'Temporary' },
  INTERNSHIP: { vi: 'Thực tập', en: 'Internship' },
  GRADUATE: { vi: 'Graduate', en: 'Graduate' },
  UNKNOWN: { vi: '—', en: '—' },
};

export const SENIORITY_I18N: Record<string, { vi: string; en: string }> = {
  INTERN: { vi: 'Thực tập sinh', en: 'Intern' },
  ENTRY: { vi: 'Mới vào nghề', en: 'Entry level' },
  MID: { vi: 'Trung cấp', en: 'Mid level' },
  SENIOR: { vi: 'Senior', en: 'Senior' },
  LEAD: { vi: 'Lead / Principal', en: 'Lead / Principal' },
  MANAGER: { vi: 'Quản lý', en: 'Manager' },
  DIRECTOR: { vi: 'Giám đốc', en: 'Director' },
  UNKNOWN: { vi: '—', en: '—' },
};

/** Nhóm công ty ở trang Nhà tuyển dụng. */
export const COMPANY_TYPE_I18N: Record<string, { vi: string; en: string }> = {
  IOC: { vi: 'Công ty dầu khí quốc tế', en: 'International oil companies' },
  NOC: { vi: 'Công ty dầu khí quốc gia', en: 'National oil companies' },
  SERVICE: { vi: 'Nhà thầu dịch vụ', en: 'Oilfield services' },
  EPC: { vi: 'EPC / Xây lắp', en: 'EPC / Construction' },
  CONSULTANCY: { vi: 'Tư vấn', en: 'Consultancies' },
  JOB_BOARD: { vi: 'Job board', en: 'Job boards' },
  OTHER: { vi: 'Khác', en: 'Other' },
};

/**
 * "3 ngày trước" / "3 days ago". Bản tiếng Việt trước đây nằm trong utils.ts và
 * hiện trên mọi thẻ job, nên bản EN mà thiếu là lộ ngay.
 */
export function timeAgoI18n(iso: string | null, lang: Lang): string {
  if (!iso) return lang === 'en' ? 'Date unknown' : 'Không rõ ngày';
  const day = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const en = lang === 'en';
  if (day < 0) return en ? 'New' : 'Mới';
  if (day === 0) return en ? 'Today' : 'Hôm nay';
  if (day === 1) return en ? 'Yesterday' : 'Hôm qua';
  if (day < 7) return en ? `${day} days ago` : `${day} ngày trước`;
  if (day < 30) {
    const w = Math.floor(day / 7);
    return en ? `${w} week${w > 1 ? 's' : ''} ago` : `${w} tuần trước`;
  }
  if (day < 365) {
    const m = Math.floor(day / 30);
    return en ? `${m} month${m > 1 ? 's' : ''} ago` : `${m} tháng trước`;
  }
  const y = Math.floor(day / 365);
  return en ? `${y} year${y > 1 ? 's' : ''} ago` : `${y} năm trước`;
}
