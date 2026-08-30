import type { JobDto, JobFacets, PaginatedResult } from '@og/shared';

/**
 * Mọi lời gọi API ở đây đều chạy phía SERVER (React Server Component), nên URL
 * phải là địa chỉ mà *server* nhìn thấy — không phải địa chỉ trình duyệt thấy.
 *
 *  • docker-compose: server nằm trong container `web`, phải gọi `http://api:4000`
 *    (gọi `localhost` sẽ trỏ ngược vào chính container web → connection refused).
 *  • Vercel/Render: hai bên khác host, dùng luôn URL public.
 *
 * `API_INTERNAL_URL` là biến chỉ-đọc-phía-server (không có tiền tố NEXT_PUBLIC_
 * nên Next đọc lúc chạy, không nhúng vào bundle). Không đặt thì rơi về URL public.
 */
const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000/api/v1';

export interface JobFilters {
  q?: string;
  discipline?: string[];
  country?: string[];
  region?: string[];
  company?: string[];
  source?: string[];
  employmentType?: string[];
  workMode?: string[];
  seniority?: string[];
  skill?: string[];
  salaryMinUsd?: number;
  hasSalary?: boolean;
  postedWithinDays?: number;
  maxExperienceYears?: number;
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** Chuyển object filter -> query string (mảng nối bằng dấu phẩy). */
export function toSearchParams(filters: JobFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}

export function parseFilters(searchParams: Record<string, string | string[] | undefined>): JobFilters {
  const arr = (v: string | string[] | undefined): string[] | undefined => {
    if (!v) return undefined;
    const s = Array.isArray(v) ? v.join(',') : v;
    const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  };
  const str = (v: string | string[] | undefined): string | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v[0] : v;
  const num = (v: string | string[] | undefined): number | undefined => {
    const s = str(v);
    const n = s ? Number(s) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    q: str(searchParams.q),
    discipline: arr(searchParams.discipline),
    country: arr(searchParams.country),
    region: arr(searchParams.region),
    company: arr(searchParams.company),
    source: arr(searchParams.source),
    employmentType: arr(searchParams.employmentType),
    workMode: arr(searchParams.workMode),
    seniority: arr(searchParams.seniority),
    skill: arr(searchParams.skill),
    salaryMinUsd: num(searchParams.salaryMinUsd),
    hasSalary: str(searchParams.hasSalary) === 'true' || undefined,
    postedWithinDays: num(searchParams.postedWithinDays),
    maxExperienceYears: num(searchParams.maxExperienceYears),
    sort: str(searchParams.sort) ?? 'recent',
    page: num(searchParams.page) ?? 1,
    pageSize: num(searchParams.pageSize) ?? 20,
  };
}

/**
 * Lúc `next build`, Next dựng sẵn HTML cho các trang có `revalidate`. Nếu API
 * đang ngủ (gói Render free ngủ sau 15 phút, đánh thức mất ~1 phút) thì bước
 * dựng này treo và Next giết worker sau 60 giây -> build đỏ.
 *
 * Cách xử lý: khi đang build, đặt hạn chờ ngắn và trả về giá trị rỗng nếu API
 * chưa kịp trả lời. Trang deploy ra vẫn đúng — ISR sẽ tự lấy dữ liệu thật ở lần
 * truy cập đầu tiên rồi cache lại. Đổi lại là build không bao giờ phụ thuộc vào
 * việc API có đang thức hay không.
 */
/**
 * Lỗi có kèm mã HTTP, để nơi gọi phân biệt được "job này không tồn tại" (404 thật)
 * với "API đang ngủ / quá hạn chờ" (lỗi mạng). Gộp hai thứ này lại là sai lầm
 * tốn kém: trang chi tiết từng trả 404 thật cho Google chỉ vì API Render đang ngủ,
 * rồi cache cái 404 đó suốt 5 phút.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** true nếu job thực sự không tồn tại; false nếu chỉ là sự cố tạm thời. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';
const TIMEOUT_MS = IS_BUILD ? 8_000 : 25_000;

/**
 * KHÔNG dùng Data Cache của Vercel cho bất kỳ lời gọi nào. Tham số `revalidate`
 * được giữ lại chỉ để không phải sửa mọi nơi gọi, nhưng nó không còn tác dụng.
 *
 * Lý do, đã đo bằng chứng cứ hai lần:
 *
 * Data Cache khoá theo URL. Mỗi tổ hợp bộ lọc (`?company=eni&pageSize=20`) là
 * một khoá riêng. Khoá nào được ghi vào lúc API chưa có dữ liệu — ví dụ trước
 * khi scrape công ty đó — sẽ giữ nguyên bản trả lời RỖNG và **không bao giờ tự
 * làm mới**, kể cả khi đã quá TTL, kể cả sau khi deploy lại.
 *
 * Hậu quả thực tế 2026-08-30: `/?company=eni` hiện "không tìm thấy việc làm"
 * trong khi API trả về đúng 1 job; đổi `pageSize=20` thành `19` (khoá cache mới)
 * là ra ngay kết quả đúng. Trước đó trang Công ty cũng đóng băng ở trạng thái
 * "38 công ty · 0 vị trí" suốt nhiều giờ vì cùng nguyên nhân.
 *
 * Đánh đổi: mỗi lần render gọi thẳng API. Chấp nhận được vì chính API đã đặt
 * `Cache-Control: s-maxage` (xem http-cache.interceptor.ts) nên tầng CDN trước
 * Render vẫn đỡ tải — và đó là lớp cache DUY NHẤT còn lại, dễ suy luận hơn hẳn.
 */
async function request<T>(path: string, _revalidate = 60, fallback?: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new ApiError(res.status, `API ${res.status} ${res.statusText} · ${path}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    // Không có phương án dự phòng (ví dụ trang chi tiết job) -> để lỗi nổi lên,
    // Next sẽ hiện error.tsx / not-found.tsx.
    if (fallback === undefined) throw err;
    console.warn(`[api] ${path} thất bại, dùng dữ liệu rỗng:`, (err as Error).message);
    return fallback;
  }
}

function emptyPage<T>(pageSize: number): PaginatedResult<T> {
  return {
    data: [],
    meta: { page: 1, pageSize, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  };
}

const EMPTY_FACETS: JobFacets = {
  disciplines: [],
  countries: [],
  companies: [],
  employmentTypes: [],
  workModes: [],
  seniorities: [],
  sources: [],
  total: 0,
};

export const api = {
  jobs: (filters: JobFilters) =>
    request<PaginatedResult<JobDto>>(
      `/jobs?${toSearchParams(filters).toString()}`,
      60,
      emptyPage<JobDto>(filters.pageSize ?? 20),
    ),

  facets: (filters: JobFilters) => {
    // Facets không phụ thuộc phân trang
    const { page, pageSize, ...rest } = filters;
    return request<JobFacets>(`/jobs/facets?${toSearchParams(rest).toString()}`, 120, EMPTY_FACETS);
  },

  job: (idOrSlug: string) =>
    request<JobDto & { related: JobDto[]; description: string | null; descriptionHtml: string | null }>(
      `/jobs/${encodeURIComponent(idOrSlug)}`,
      300,
    ),

  // revalidate = 0 (no-store) — KHÔNG phải lựa chọn tuỳ tiện.
  // Đã đo thực tế 2026-08-30: bản ghi Data Cache của ba endpoint này đóng băng
  // ở trạng thái "38 công ty · 0 job" (chụp trước lần scrape đầu tiên) và không
  // tự làm mới, kể cả khi API đang thức và trang được gọi liên tục quá TTL.
  // Trong khi đó `/jobs` với revalidate 60 vẫn cập nhật bình thường.
  // Ba endpoint này nhẹ, ít được gọi, và trả về `jobCount` đổi sau mỗi lần
  // scrape -> bỏ cache là đánh đổi đúng.
  countries: () =>
    request<{ code: string; name: string; region: string | null; jobCount: number }[]>(
      '/countries',
      0,
      [],
    ),

  companies: () =>
    request<{ slug: string; name: string; type: string; logoUrl: string | null; jobCount: number }[]>(
      '/companies',
      0,
      [],
    ),

  skills: () =>
    request<{ slug: string; name: string; category: string; jobCount: number }[]>('/skills', 0, []),

  /**
   * Chỉ dùng để PHÂN BIỆT "không có job" với "API không trả lời".
   *
   * Các hàm ở trên đều có giá trị rỗng dự phòng nên không bao giờ throw — nghĩa
   * là danh sách rỗng có thể do API đang ngủ, mà giao diện lại báo "không tìm
   * thấy việc làm phù hợp". Hai tình huống đó khác hẳn nhau với người dùng.
   *
   * Chỉ gọi khi kết quả rỗng nên không thêm tải cho đường đi thông thường.
   * Hạn chờ ngắn: chỉ cần biết API có sống hay không, không cần dữ liệu.
   */
  isAlive: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(6_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};

export { API_URL };
