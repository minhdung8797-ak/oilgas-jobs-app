import { CompanyType, RawJob, SourceStrategy, SourceConfig } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  WORDPRESS + JETENGINE  ·  REST API chuẩn của WordPress
 * ══════════════════════════════════════════════════════════════
 *  Nhiều đơn vị vừa và nhỏ dựng trang tuyển dụng bằng WordPress với một
 *  "custom post type" cho tin việc làm. WordPress mở sẵn REST API cho mọi post
 *  type, nên không cần bóc HTML:
 *
 *      GET /wp-json/wp/v2/<postType>?per_page=100&page=N
 *      GET /wp-json/wp/v2/<areaTaxonomy>?per_page=100     (slug -> tên khu vực)
 *
 *  Dùng API thay vì selector CSS có hai cái lợi rõ rệt: giao diện đổi bao nhiêu
 *  lần cũng không ảnh hưởng, và mỗi tin có sẵn `link` riêng nên link ứng tuyển
 *  luôn đúng.
 *
 *  MỘT ĐIỂM PHẢI BIẾT VỀ MÔ TẢ
 *  ---------------------------
 *  Trang dựng bằng Elementor thì `content.rendered` trả về RỖNG — nội dung nằm
 *  trong dữ liệu riêng của Elementor, không nằm ở trường content. Đã đo với PVD
 *  Training: cả 196 tin đều có mô tả dài 0 ký tự. Nên phân loại ở nguồn này chỉ
 *  dựa vào CHỨC DANH. Điều đó chấp nhận được vì chức danh ngành này đủ đặc thù
 *  (đã kiểm: "Wellsite Geologist", "Reservoir Engineer" phân loại đúng khi
 *  không có mô tả), nhưng tin đặt tên mơ hồ sẽ bị bỏ sót.
 *
 *  Đã xác minh 2026-09-03 với PVD Training: HTTP 200, 196 tin, 195 còn hạn,
 *  có "Wellsite Geologist" và "Operation Geologist".
 */
export interface WordPressJobsTenant {
  key: string;
  label: string;
  company: string;
  companyType: CompanyType;
  /** Gốc trang, vd 'https://job.pvdtraining.com.vn' */
  host: string;
  /** Tên custom post type, vd 'tin-tuyen-dung' */
  postType: string;
  /** Taxonomy chứa khu vực làm việc, vd 'khu-vuc-lam-viec' */
  areaTaxonomy?: string;
  /**
   * Term đánh dấu tin ĐÃ HẾT HẠN (nằm trong `class_list`), vd 'trang-thai-het-han'.
   * Chỉ loại tin nào được đánh dấu rõ; KHÔNG yêu cầu phải có dấu "còn hạn" —
   * ở PVD Training chỉ 10/196 tin có gắn trạng thái, đòi hỏi ngược lại sẽ vứt
   * mất 186 tin hợp lệ.
   */
  expiredClass?: string;
  /** Tên nước ghép vào khu vực khi khu vực chỉ ghi tỉnh/thành. */
  country: string;
  /**
   * Khu vực nằm NGOÀI `country`. Tên khớp mẫu này sẽ được giữ nguyên thay vì
   * bị ghép thêm tên nước — nếu không thì "Offshore Malaysia" sẽ thành
   * "Offshore Malaysia, Vietnam" và bị gán sai nước.
   */
  foreignAreaPattern?: RegExp;
  enabled?: boolean;
}

const PER_PAGE = 100;
/** Chặn vòng lặp vô hạn nếu API trả sai. 10 trang × 100 = 1000 tin. */
const MAX_PAGES = 10;

interface WpTerm {
  slug?: string;
  name?: string;
}

interface WpPost {
  id?: number;
  link?: string;
  date?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  class_list?: string[];
}

export class WordPressJobsScraper extends BaseScraper {
  readonly config: SourceConfig;

  constructor(private readonly t: WordPressJobsTenant) {
    super();
    this.config = {
      key: t.key,
      label: t.label,
      strategy: SourceStrategy.JSON_API,
      baseUrl: t.host,
      defaultCompany: t.company,
      companyType: t.companyType,
      enabled: t.enabled ?? true,
      maxPages: MAX_PAGES,
      notes: 'WordPress REST API · mô tả có thể rỗng nếu trang dựng bằng Elementor',
    };
  }

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    const api = `${this.t.host}/wp-json/wp/v2`;
    const areas = await this.loadAreaNames(ctx, api);

    const jobs: RawJob[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      let posts: WpPost[];
      try {
        posts = await ctx.http.get<WpPost[]>(
          `${api}/${this.t.postType}?per_page=${PER_PAGE}&page=${page}` +
            '&_fields=id,link,date,title,content,class_list',
          { headers: { Accept: 'application/json' } },
        );
      } catch (e) {
        // WordPress trả 400 khi xin trang vượt quá số trang có thật — đó là
        // điểm dừng bình thường, không phải sự cố.
        if (page > 1) break;
        ctx.logger.warn(`[${this.config.key}] không gọi được API: ${(e as Error).message}`);
        return [];
      }
      if (!Array.isArray(posts) || posts.length === 0) break;

      for (const p of posts) {
        const job = this.toRawJob(p, areas);
        if (job) jobs.push(job);
      }
      if (posts.length < PER_PAGE) break;
    }

    ctx.logger.log(`[${this.config.key}] ${jobs.length} tin còn hạn`);
    return jobs;
  }

  /** slug khu vực -> tên hiển thị. Lỗi thì trả map rỗng, địa điểm sẽ để trống. */
  private async loadAreaNames(ctx: ScrapeContext, api: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!this.t.areaTaxonomy) return map;
    try {
      const terms = await ctx.http.get<WpTerm[]>(
        `${api}/${this.t.areaTaxonomy}?per_page=${PER_PAGE}&_fields=slug,name`,
        { headers: { Accept: 'application/json' } },
      );
      for (const t of terms ?? []) if (t.slug && t.name) map.set(t.slug, t.name);
    } catch (e) {
      ctx.logger.warn(`[${this.config.key}] không đọc được danh mục khu vực: ${(e as Error).message}`);
    }
    return map;
  }

  private toRawJob(p: WpPost, areas: Map<string, string>): RawJob | null {
    const classes = p.class_list ?? [];
    if (this.t.expiredClass && classes.includes(this.t.expiredClass)) return null;

    const title = decodeEntities(p.title?.rendered ?? '').trim();
    if (!title || !p.link) return null;

    return {
      source: this.config.key,
      sourceUrl: p.link,
      externalId: p.id != null ? String(p.id) : null,
      title,
      companyName: this.t.company,
      locationRaw: this.areaToLocation(classes, areas),
      description: stripHtml(p.content?.rendered) ?? null,
      descriptionHtml: p.content?.rendered || null,
      employmentTypeRaw: null,
      postedAtRaw: p.date ?? null,
      raw: p as unknown as Record<string, unknown>,
    };
  }

  private areaToLocation(classes: string[], areas: Map<string, string>): string | null {
    const prefix = this.t.areaTaxonomy ? `${this.t.areaTaxonomy}-` : null;
    const cls = prefix ? classes.find((c) => c.startsWith(prefix)) : undefined;
    const name = cls ? areas.get(cls.slice(prefix!.length)) : undefined;

    if (!name) return this.t.country;
    if (this.t.foreignAreaPattern?.test(name)) return name;
    // Khu vực đã tự ghi tên nước rồi thì đừng ghép thêm lần nữa.
    //
    // So sánh sau khi BỎ DẤU và BỎ KHOẢNG TRẮNG, không so chuỗi thô: khu vực
    // ghi "Offshore Việt Nam" còn cấu hình ghi "Vietnam" — so thô sẽ không khớp
    // và cho ra "Offshore Việt Nam, Vietnam".
    if (fold(name).includes(fold(this.t.country))) return name;
    return `${name}, ${this.t.country}`;
  }
}

/**
 * Bỏ dấu, bỏ khoảng trắng, về chữ thường — để so tên nước viết theo tiếng Việt
 * ("Việt Nam") với tên viết theo tiếng Anh ("Vietnam").
 */
function fold(s: string): string {
  return s
    .normalize('NFD')
    // ̀-ͯ là dải dấu kết hợp mà NFD tách ra. Viết dạng escape chứ
    // không dán ký tự dấu thô: ký tự thô vô hình trong editor và dễ bị mã hoá
    // sai khi qua công cụ khác.
    .replace(/[\u0300-\u036f]/g, '')
    // 'đ' không phải chữ 'd' + dấu nên NFD không tách được, phải thay riêng.
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** WordPress trả tiêu đề đã mã hoá thực thể HTML ("Oil &#038; Gas"). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#0*38;|&amp;/g, '&')
    .replace(/&#0*8211;|&ndash;/g, '-')
    .replace(/&#0*8217;|&rsquo;/g, "'")
    .replace(/&#0*8220;|&#0*8221;|&[lr]dquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(html?: string): string | null {
  if (!html) return null;
  return (
    decodeEntities(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim() || null
  );
}

export const WORDPRESS_JOBS_TENANTS: WordPressJobsTenant[] = [
  {
    key: 'pvdtraining',
    label: 'PVD Training',
    // GHI CHÚ VỀ TÊN NHÀ TUYỂN DỤNG: PVD Training vừa tuyển cho chính mình, vừa
    // làm cung ứng nhân lực cho khách hàng. Với nhóm thứ hai, người sử dụng lao
    // động thật KHÔNG được nêu trên tin, nên ô "công ty" sẽ ghi PVD Training dù
    // nơi làm việc là công ty khác. Người dùng đã biết và chấp nhận đánh đổi này.
    company: 'PVD Training',
    companyType: CompanyType.SERVICE,
    host: 'https://job.pvdtraining.com.vn',
    postType: 'tin-tuyen-dung',
    areaTaxonomy: 'khu-vuc-lam-viec',
    expiredClass: 'trang-thai-het-han',
    country: 'Vietnam',
    // Các khu vực ngoài Việt Nam thấy trong danh mục của họ. Thêm khu vực nước
    // ngoài mới mà quên cập nhật đây thì tin đó sẽ bị gán nhầm là Việt Nam.
    foreignAreaPattern: /malaysia|singapore|indonesia|thailand|brunei|myanmar|india|qatar/i,
  },
];
