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
