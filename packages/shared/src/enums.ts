/**
 * 4 nhóm ngành mục tiêu + OTHER (dùng để loại bỏ khỏi kết quả public).
 * Giá trị phải trùng khớp với enum "Discipline" trong Prisma / PostgreSQL.
 */
export enum Discipline {
  RESERVOIR = 'RESERVOIR',
  PETROLEUM = 'PETROLEUM',
  PRODUCTION = 'PRODUCTION',
  GEOSCIENCE = 'GEOSCIENCE',
  OTHER = 'OTHER',
}

export const TARGET_DISCIPLINES: Discipline[] = [
  Discipline.RESERVOIR,
  Discipline.PETROLEUM,
  Discipline.PRODUCTION,
  Discipline.GEOSCIENCE,
];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  [Discipline.RESERVOIR]: 'Reservoir Engineering',
  [Discipline.PETROLEUM]: 'Petroleum Engineering',
  [Discipline.PRODUCTION]: 'Production Engineering',
  [Discipline.GEOSCIENCE]: 'Geoscience & Formation (G&F)',
  [Discipline.OTHER]: 'Other',
};

export enum Seniority {
  INTERN = 'INTERN',
  ENTRY = 'ENTRY',
  MID = 'MID',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  MANAGER = 'MANAGER',
  DIRECTOR = 'DIRECTOR',
  UNKNOWN = 'UNKNOWN',
}

export enum EmploymentType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  TEMPORARY = 'TEMPORARY',
  INTERNSHIP = 'INTERNSHIP',
  GRADUATE = 'GRADUATE',
  UNKNOWN = 'UNKNOWN',
}

export enum WorkMode {
  ONSITE = 'ONSITE',
  OFFSHORE = 'OFFSHORE',
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID',
  ROTATIONAL = 'ROTATIONAL',
  UNKNOWN = 'UNKNOWN',
}

export enum CompanyType {
  IOC = 'IOC',
  NOC = 'NOC',
  SERVICE = 'SERVICE',
  EPC = 'EPC',
  CONSULTANCY = 'CONSULTANCY',
  JOB_BOARD = 'JOB_BOARD',
  OTHER = 'OTHER',
}

/**
 * Hai nhóm nhà tuyển dụng mà người trong ngành luôn phân biệt khi chọn việc.
 *
 * Đây là tầng GỘP trên `CompanyType`, không thay thế nó: `CompanyType` trả lời
 * "công ty này là loại gì" (IOC, NOC, EPC…), còn `CompanyCategory` trả lời câu
 * hỏi thực tế hơn khi tìm việc — "mình sẽ làm cho bên sở hữu mỏ hay bên đi làm
 * dịch vụ cho mỏ?". Hai con đường sự nghiệp khác hẳn nhau về công việc hàng
 * ngày, mức lương và lịch đi hiện trường, nên đáng có bộ lọc riêng.
 *
 * Cố ý KHÔNG lưu thành cột trong database: nó suy ra được hoàn toàn từ
 * `CompanyType`. Thêm cột nghĩa là có hai nguồn sự thật và sẽ lệch nhau.
 */
export enum CompanyCategory {
  /** Sở hữu và vận hành mỏ: công ty dầu khí quốc tế và quốc gia. */
  OPERATOR = 'OPERATOR',
  /** Cung cấp dịch vụ, thiết bị, thi công, tư vấn cho nhà điều hành. */
  SERVICE_PROVIDER = 'SERVICE_PROVIDER',
  /** Chưa xếp được vào đâu — job board, hoặc công ty chưa gắn loại. */
  OTHER = 'OTHER',
}

/** Loại công ty thuộc về nhóm nào. Nguồn sự thật duy nhất cho phép gộp này. */
export const COMPANY_CATEGORY_TYPES: Record<CompanyCategory, CompanyType[]> = {
  [CompanyCategory.OPERATOR]: [CompanyType.IOC, CompanyType.NOC],
  [CompanyCategory.SERVICE_PROVIDER]: [
    CompanyType.SERVICE,
    CompanyType.EPC,
    CompanyType.CONSULTANCY,
  ],
  [CompanyCategory.OTHER]: [CompanyType.JOB_BOARD, CompanyType.OTHER],
};

/**
 * Ngoại lệ: công ty mà loại hình KHÔNG quyết định đúng nhóm, tra theo slug.
 *
 * Vì sao cần: vài tập đoàn vừa thi công vừa sở hữu và vận hành tài sản năng
 * lượng, nên `type` đúng mà nhóm lại sai. UCC Holding là ca đầu tiên — họ là
 * nhà thầu EPC (nên `type: EPC` là chính xác, và trang Công ty xếp họ vào mục
 * "EPC / Xây lắp" cũng đúng), nhưng mảng nhượng quyền thì tự sở hữu và vận hành
 * nhà máy, tức đứng ở phía Operator khi người tìm việc chọn hướng đi.
 *
 * Ghi đè ở đây thay vì sửa `type` thành IOC/NOC: `type` là dữ liệu dùng chung
 * cho cả trang Công ty, đổi nó sẽ khiến UCC hiện dưới tiêu đề "Công ty dầu khí
 * quốc tế" — sai hiển nhiên ngay trên giao diện.
 *
 * Cũng không thêm cột vào database: đây là phán đoán biên tập về vài công ty cụ
 * thể, sửa trong code thì thấy được qua lịch sử git và không cần migration.
 */
export const COMPANY_CATEGORY_OVERRIDES: Record<string, CompanyCategory> = {
  'ucc-holding': CompanyCategory.OPERATOR,
};

/**
 * Nhóm của một công ty. Ưu tiên ngoại lệ theo slug, không có thì suy từ loại.
 *
 * `slug` là tuỳ chọn để chỗ nào chỉ có `type` vẫn gọi được, nhưng truyền vào
 * bất cứ khi nào có — thiếu nó thì ngoại lệ bị bỏ qua lặng lẽ.
 */
export function companyCategoryOf(
  type: CompanyType | string | null | undefined,
  slug?: string | null,
): CompanyCategory {
  if (slug && COMPANY_CATEGORY_OVERRIDES[slug]) return COMPANY_CATEGORY_OVERRIDES[slug];
  if (!type) return CompanyCategory.OTHER;
  for (const [category, types] of Object.entries(COMPANY_CATEGORY_TYPES)) {
    if ((types as string[]).includes(type)) return category as CompanyCategory;
  }
  return CompanyCategory.OTHER;
}

/**
 * Dịch danh sách nhóm được chọn thành điều kiện lọc trên bảng Company.
 *
 * Trả về ba mảnh thay vì một câu truy vấn, để phía API tự ghép theo cú pháp
 * Prisma mà vẫn giữ toàn bộ phần suy luận ở đây — nơi duy nhất biết về ngoại lệ.
 *
 *   types        : các `company.type` thuộc nhóm đã chọn
 *   excludeSlugs : MỌI công ty có ngoại lệ — loại khỏi nhánh lọc theo type, vì
 *                  với chúng thì type không còn quyết định nhóm nữa
 *   includeSlugs : công ty có ngoại lệ trỏ ĐÚNG vào nhóm đang chọn
 */
export function companyCategoryFilter(categories: CompanyCategory[]): {
  types: CompanyType[];
  includeSlugs: string[];
  excludeSlugs: string[];
} {
  const selected = new Set(categories);
  return {
    types: categories.flatMap((c) => COMPANY_CATEGORY_TYPES[c] ?? []),
    excludeSlugs: Object.keys(COMPANY_CATEGORY_OVERRIDES),
    includeSlugs: Object.entries(COMPANY_CATEGORY_OVERRIDES)
      .filter(([, category]) => selected.has(category))
      .map(([slug]) => slug),
  };
}

export enum SalaryPeriod {
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

export enum ScrapeStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

export enum SourceStrategy {
  HTTP_CHEERIO = 'HTTP_CHEERIO',
  PLAYWRIGHT = 'PLAYWRIGHT',
  JSON_API = 'JSON_API',
}
