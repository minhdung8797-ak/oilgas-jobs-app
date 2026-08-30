/**
 * ══════════════════════════════════════════════════════════════
 *  Làm sạch HTML mô tả job trước khi trả ra API
 * ══════════════════════════════════════════════════════════════
 *  Vì sao cần: `descriptionHtml` được lưu NGUYÊN XI từ trang tuyển dụng của bên
 *  thứ ba (xem workday.scraper.ts, jibe.scraper.ts, generic-html.scraper.ts —
 *  không nơi nào lọc), rồi frontend đưa thẳng vào `dangerouslySetInnerHTML`.
 *  React chặn được thẻ `<script>` nhưng KHÔNG chặn `<img onerror=...>`,
 *  `<svg onload=...>` hay `<a href="javascript:...">`. Chỉ cần một trang nguồn
 *  bị chèn payload là script chạy trên domain của app.
 *
 *  Lọc ở tầng API (không phải frontend) vì hai lý do:
 *   1. Dữ liệu đã lưu trong DB từ trước cũng được làm sạch, không phải scrape lại.
 *   2. Frontend chạy Edge runtime, không dùng được thư viện sanitize của Node.
 *
 *  Cách tiếp cận: DANH SÁCH CHO PHÉP (allowlist). Mọi thẻ và thuộc tính không
 *  nằm trong danh sách đều bị loại. An toàn hơn danh sách cấm rất nhiều — danh
 *  sách cấm luôn thiếu một biến thể nào đó.
 */

/** Chỉ các thẻ định dạng văn bản. Không có form, media, script, style, iframe. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'mark', 'small',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'span', 'div', 'a',
]);

/** Thẻ bị xoá CẢ NỘI DUNG bên trong, không chỉ xoá cặp thẻ. */
const STRIP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi;

/** Chỉ giữ href trên thẻ <a>. Mọi thuộc tính khác (on*, style, srcset...) bị loại. */
const HREF_RE = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;

/**
 * Chỉ chấp nhận link http/https/mailto. Chặn `javascript:`, `data:`, `vbscript:`
 * và các biến thể lách bộ lọc (`java\tscript:`, `JaVaScRiPt:`, ký tự vô hình).
 */
export function isSafeUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  // Bỏ mọi ký tự điều khiển và khoảng trắng trước khi xét scheme — đây chính là
  // mẹo lách phổ biến nhất: "java\tscript:alert(1)".
  const cleaned = raw
    .replace(/[\u0000-\u0020\u007f-\u00a0\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .toLowerCase();
  if (cleaned.startsWith('//')) return true; // protocol-relative, kế thừa https
  if (/^(https?:|mailto:)/.test(cleaned)) return true;
  // Link tương đối (không có dấu hai chấm trước dấu / đầu tiên) cũng an toàn
  return !/^[a-z0-9+.-]*:/.test(cleaned);
}

/**
 * Trả về HTML chỉ còn thẻ định dạng an toàn.
 * Không cố sửa HTML hỏng — thẻ nào không nhận ra thì bỏ thẻ, giữ lại chữ.
 */
export function sanitizeHtml(input: string | null | undefined): string | null {
  if (!input) return null;

  let html = input;

  // 1. Xoá hẳn khối nguy hiểm kèm nội dung
  html = html.replace(STRIP_WITH_CONTENT, ' ');
  // Thẻ mở không có thẻ đóng tương ứng (HTML hỏng) cũng phải xử lý
  html = html.replace(/<(script|style|iframe|object|embed|noscript|svg)\b[^>]*>/gi, ' ');
  // 2. Xoá comment — có thể chứa conditional comment của IE
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Duyệt từng thẻ, giữ lại thẻ hợp lệ và LOẠI SẠCH thuộc tính
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return ' ';

    const isClosing = _m.startsWith('</');
    if (isClosing) return `</${name}>`;

    // Chỉ <a> được giữ đúng một thuộc tính: href, và phải qua kiểm tra scheme.
    if (name === 'a') {
      const m = HREF_RE.exec(attrs);
      const href = m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
      if (!isSafeUrl(href)) return '<a>';
      // rel/target đặt cứng: link trong mô tả job là nội dung bên ngoài,
      // luôn mở tab mới và không truyền referrer.
      const safe = href.replace(/"/g, '&quot;');
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">`;
    }

    // Thẻ tự đóng giữ nguyên dạng
    if (name === 'br' || name === 'hr') return `<${name} />`;
    return `<${name}>`;
  });

  return html.replace(/\s{3,}/g, '  ').trim() || null;
}
