/**
 * ══════════════════════════════════════════════════════════════
 *  Phần của @og/shared CHỈ chạy được trên Node.js
 * ══════════════════════════════════════════════════════════════
 *  Tệp này CỐ Ý không được `index.ts` export lại, và phải giữ nguyên như vậy.
 *
 *  Lý do: frontend chạy toàn bộ trên Edge runtime của Vercel (xem
 *  `export const runtime = 'edge'` trong apps/web/src/app/layout.tsx). Edge
 *  không có các module lõi của Node, nên chỉ cần barrel của shared chạm tới
 *  `crypto` là `next build` gãy với "Module not found: Can't resolve 'crypto'".
 *
 *  Cái bẫy nằm ở chỗ nó IM LẶNG cho tới lúc build: web vẫn import từ
 *  '@og/shared' được bình thường miễn là mọi import đều là `import type` —
 *  kiểu bị xoá lúc biên dịch nên không kéo theo code thật. Ngày nào đó có người
 *  import một GIÁ TRỊ (hằng số, hàm, enum) thì cả cây module mới bị kéo vào và
 *  build đỏ. Đã xảy ra thật khi thêm bộ lọc Operator/Service Provider: `tsc`
 *  không hề báo gì, chỉ `next build` mới phát hiện.
 *
 *  Nên: thứ gì cần API lõi của Node thì để ở đây, và apps/api import trực tiếp
 *  qua '@og/shared/node'.
 */
import { createHash } from 'crypto';

/** Hash nội dung để phát hiện job đã thay đổi -> upsert thông minh, tránh ghi thừa. */
export function contentHash(parts: (string | null | undefined)[]): string {
  return createHash('sha256')
    .update(parts.map((p) => (p ?? '').trim()).join('|'))
    .digest('hex');
}
