import * as cheerio from 'cheerio';
import { CompanyType, RawJob, SourceStrategy, SourceConfig, slugify } from '@og/shared';
import { BaseScraper, ScrapeContext } from '../lib/base-scraper';

/**
 * ══════════════════════════════════════════════════════════════
 *  KWADER (كوادر)  ·  kwader.mem.gov.om
 *  Cổng tuyển dụng ngành dầu khí của Bộ Năng lượng và Khoáng sản Oman
 * ══════════════════════════════════════════════════════════════
 *  Đây là nguồn DUY NHẤT trong app không phải trang tuyển dụng của một công ty.
 *  Nó vẫn được nhận, vì lý do khiến ta loại các job board khác KHÔNG áp dụng ở
 *  đây: mỗi tin ghi rõ nhà tuyển dụng thật, ngay trên thẻ tin, kèm logo. Cái ta
 *  cấm là trung gian giấu tên nhà tuyển dụng, không phải cổng gom tin minh bạch.
 *
 *  Đổi lại ta vào được 10 nhà điều hành ở Oman mà không cách nào khác chạm tới:
 *  PDO, OQ, ARA Petroleum, Daleel, Oxy Oman, Oman LNG, bp Oman, CC Energy,
 *  Masar Petroleum, Tethys Oil. Riêng PDO là công ty đã thử vào thẳng và thất
 *  bại — trang kockw/pdo không có cổng công khai nào đọc được.
 *
 *  ĐIỂM YẾU PHẢI BIẾT: KHÔNG CÓ URL RIÊNG CHO TỪNG TIN
 *  ----------------------------------------------------
 *  Nút "تفاصيل الوظيفة" (chi tiết) là `javascript:void(0)`; nội dung mở bằng
 *  JavaScript trong hộp thoại, không đổi địa chỉ. Nên không có link sâu tới
 *  từng tin, và cũng không có mã định danh nào đọc được từ HTML tĩnh.
 *
 *  Cách xử lý: tạo mã định danh riêng từ (công ty + chức danh + hạn nộp) và
 *  gắn nó làm neo `#...` sau địa chỉ trang danh sách. Hệ quả thực tế:
 *    • Mỗi tin là một bản ghi riêng, không bị khử trùng lặp nhầm.
 *    • Người dùng bấm "Ứng tuyển" sẽ tới ĐÚNG TRANG danh sách của Kwader chứ
 *      không tới đúng thẻ tin. Đây là hạn chế thật, không phải lỗi — không có
 *      cách nào tốt hơn nếu không dựng trình duyệt thật.
 *
 *  Bản thân Kwader cũng chỉ là bước trung chuyển: bấm ứng tuyển ở đó sẽ chuyển
 *  tiếp sang cổng riêng của nhà điều hành ("سيتم تحويلك إلى موقع المشغل").
 *
 *  Đã xác minh 2026-09-01: /jobs trả 15 tin, dựng sẵn ở máy chủ, chỉ 1 trang
 *  ("1/1"). Có "Senior Studies Petrophysicist" (ARA Petroleum) và "Senior
 *  Production Geologist" (PDO). Chức danh viết bằng tiếng Anh; nhãn trường bằng
 *  tiếng Ả Rập; tên công ty tiếng Anh nằm ở thuộc tính alt của logo.
 */

const HOST = 'https://kwader.mem.gov.om';
const LIST_URL = `${HOST}/jobs`;

/** Nhãn tiếng Ả Rập trên thẻ tin — dùng để bóc từng trường. */
const LABEL = {
  company: 'اسم الشركة',
  deadline: 'الموعد النهائي لتقديم الطلبات',
  minQualification: 'الحد الأدنى من المؤهلات',
  minYears: 'الحد الأدنى لسنوات الخبرة',
  opportunityType: 'نوع الفرصة',
} as const;

/** 'فرصة تدريب' = cơ hội thực tập; 'فرصة عمل' = vị trí việc làm. */
const INTERNSHIP_AR = 'فرصة تدريب';

/**
 * Tên công ty ở thuộc tính `alt` của logo đã là tiếng Anh, nên KHÔNG cần bảng
 * dịch từ tiếng Ả Rập. Bảng này chỉ để khớp với tên đã có sẵn trong app, tránh
 * sinh ra thẻ công ty trùng lặp ("Petroleum Development Oman" nằm cạnh
 * "PDO (Petroleum Development Oman)" thì người dùng thấy hai công ty khác nhau).
 */
const COMPANY_ALIASES: Record<string, string> = {
  'petroleum development oman': 'PDO (Petroleum Development Oman)',
};

/** Tên tiếng Ả Rập -> tiếng Anh, chỉ dùng khi logo thiếu thuộc tính alt. */
const ARABIC_COMPANY: Record<string, string> = {
  'شركة تنمية نفط عمان': 'PDO (Petroleum Development Oman)',
  'أوكيو': 'OQ',
  'آرا للبترول': 'ARA Petroleum',
  'شركة دليل للنفط': 'Daleel Petroleum',
  'أوكسي عُمان': 'Oxy Oman',
  'الشركة العمانية للغاز الطبيعي المسال': 'Oman LNG',
  'بي. بي. عُمان': 'bp Oman',
  'شركة سي سي اينرجي ديفالوبمنت': 'CC Energy Development',
  'مسار بتروليوم ش م ع م': 'Masar Petroleum',
  'تيثيس أويل': 'Tethys Oil',
};

export class KwaderScraper extends BaseScraper {
  readonly config: SourceConfig = {
    key: 'kwader',
    label: 'Kwader — Bộ Năng lượng & Khoáng sản Oman',
    strategy: SourceStrategy.HTTP_CHEERIO,
    baseUrl: HOST,
    companyType: CompanyType.NOC,
    enabled: true,
    maxPages: 1,
    notes: 'Cổng ngành của Oman · 10 nhà điều hành · không có URL riêng cho từng tin',
  };

  protected async listJobs(ctx: ScrapeContext): Promise<RawJob[]> {
    let html: string;
    try {
      html = await ctx.http.get<string>(LIST_URL);
    } catch (e) {
      ctx.logger.warn(`[kwader] không tải được trang danh sách: ${(e as Error).message}`);
      return [];
    }

    const $ = cheerio.load(html);

    // Neo vào LOGO nhà điều hành thay vì vào một class CSS.
    // Lý do: đường dẫn '/uploads/operatorsLogos/' là dữ liệu, không phải cách
    // trình bày — nó không đổi khi họ chỉnh giao diện, còn tên class thì đổi.
    const logos = $('img[src*="operatorsLogos"]');
    if (logos.length === 0) {
      ctx.logger.warn('[kwader] không thấy logo nhà điều hành nào — có thể trang đã đổi cấu trúc');
      return [];
    }

    const jobs: RawJob[] = [];
    const seen = new Set<string>();

    logos.each((_, img) => {
      const $img = $(img);
      const card = findCard($img);
      if (!card) return;

      const text = card.text().replace(/\s+/g, ' ').trim();
      const title = pickTitle(card);
      if (!title) return;

      const companyRaw =
        ($img.attr('alt') ?? '').trim() ||
        ARABIC_COMPANY[readField(text, LABEL.company) ?? ''] ||
        readField(text, LABEL.company) ||
        '';
      if (!companyRaw) return;
      const company = COMPANY_ALIASES[companyRaw.toLowerCase()] ?? companyRaw;

      const deadline = readField(text, LABEL.deadline);
      const oppType = readField(text, LABEL.opportunityType);
      const minQual = readField(text, LABEL.minQualification);
      const minYears = readField(text, LABEL.minYears);

      // Bỏ tin đã quá hạn nộp: Kwader vẫn hiển thị chúng thêm một thời gian.
      if (isExpired(deadline)) return;

      // Mã định danh tự tạo. Gồm cả hạn nộp để một chức danh được đăng lại ở đợt
      // sau được coi là tin MỚI, thay vì âm thầm ghi đè lên tin cũ.
      const externalId = slugify(`${company} ${title} ${deadline ?? ''}`).slice(0, 120);
      if (seen.has(externalId)) return;
      seen.add(externalId);

      const details = [
        minQual ? `Yêu cầu tối thiểu: ${minQual}` : null,
        minYears ? `Số năm kinh nghiệm tối thiểu: ${minYears}` : null,
        deadline ? `Hạn nộp hồ sơ: ${deadline}` : null,
        oppType ? `Loại cơ hội: ${oppType}` : null,
      ].filter(Boolean);

      jobs.push({
        source: this.config.key,
        // Neo '#' làm mỗi tin có địa chỉ riêng để không bị khử trùng lặp nhầm.
        // Bấm vào sẽ tới trang danh sách Kwader — xem ghi chú đầu tệp.
        sourceUrl: `${LIST_URL}#${externalId}`,
        externalId,
        title,
        companyName: company,
        // Kwader là cổng của riêng ngành dầu khí Oman; toàn bộ nhà điều hành và
        // vị trí đều ở Oman. Thẻ tin không ghi thành phố.
        locationRaw: 'Oman',
        description: details.join(' · ') || null,
        descriptionHtml: null,
        employmentTypeRaw: oppType === INTERNSHIP_AR ? 'Internship' : null,
        // Trang chỉ có HẠN NỘP, không có ngày đăng. Để null còn hơn lấy hạn nộp
        // làm ngày đăng — sẽ khiến mọi tin trông như vừa đăng trong tương lai.
        postedAtRaw: null,
        raw: { company, title, deadline, oppType, minQual, minYears },
      });
    });

    ctx.logger.log(`[kwader] ${logos.length} thẻ tin -> ${jobs.length} tin còn hạn`);
    return jobs;
  }
}

/**
 * Kiểu của kết quả `$(...)`.
 *
 * Viết thế này thay vì `cheerio.Cheerio<Element>`: tên kiểu phần tử đổi theo
 * phiên bản cheerio (`Element` chuyển sang gói domhandler ở bản 1.x), còn suy ra
 * từ chính hàm `$` thì luôn đúng với phiên bản đang cài.
 */
type Selection = ReturnType<cheerio.CheerioAPI>;

/**
 * Tìm khối bao quanh một thẻ tin, đi lên từ logo.
 *
 * Không dùng tên class vì chúng do giao diện quy định và sẽ đổi. Thay vào đó đi
 * lên từng cấp cho tới khi khối chứa đủ dấu hiệu của một thẻ tin (có nhãn
 * "اسم الشركة") mà vẫn chỉ chứa ĐÚNG MỘT logo — chạm tới khối chứa hai logo
 * nghĩa là đã trèo quá lên danh sách cha.
 */
function findCard($img: Selection): Selection | null {
  let node = $img.parent();
  for (let depth = 0; depth < 8 && node.length > 0; depth++) {
    if (node.text().includes(LABEL.company)) {
      if (node.find('img[src*="operatorsLogos"]').length > 1) return null;
      return node;
    }
    node = node.parent();
  }
  return null;
}

/** Chức danh là tiêu đề duy nhất bên trong thẻ tin. */
function pickTitle(card: Selection): string | null {
  const t = card.find('h1, h2, h3, h4, h5, h6').first().text().replace(/\s+/g, ' ').trim();
  return t || null;
}

/**
 * Đọc giá trị đứng sau một nhãn tiếng Ả Rập.
 *
 * Dừng ở nhãn kế tiếp thay vì ở dấu xuống dòng: sau khi gộp khoảng trắng thì
 * mọi trường nằm trên cùng một dòng, cắt theo dòng sẽ nuốt luôn trường sau.
 */
function readField(text: string, label: string): string | null {
  const i = text.indexOf(label);
  if (i < 0) return null;
  let rest = text.slice(i + label.length).replace(/^\s*:\s*/, '');
  for (const other of Object.values(LABEL)) {
    if (other === label) continue;
    const j = rest.indexOf(other);
    if (j >= 0) rest = rest.slice(0, j);
  }
  const v = rest.trim();
  return v || null;
}

/** Hạn nộp ghi dạng dd/MM/yyyy. Không đọc được thì COI NHƯ CÒN HẠN, tránh loại oan. */
function isExpired(deadline: string | null): boolean {
  if (!deadline) return false;
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(deadline);
  if (!m) return false;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}
