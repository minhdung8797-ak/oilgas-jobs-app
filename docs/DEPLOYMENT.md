# Hướng dẫn triển khai

> 📘 **Cần làm từng bước có kiểm chứng?** Chọn runbook theo nền tảng:
> - [RENDER-RUNBOOK.md](RENDER-RUNBOOK.md) — **Git → Render → Vercel** (khuyến nghị: 1 file
>   `render.yaml` dựng cả database + API + 2 cron job)
> - [PRODUCTION-RUNBOOK.md](PRODUCTION-RUNBOOK.md) — **Railway + Vercel**
>
> File này là bản tham chiếu ngắn gọn cho nhiều phương án triển khai.

Kiến trúc khuyến nghị:

```
Vercel (Next.js)  ──HTTPS──►  Railway: API (NestJS + Playwright)
                                  │
                                  ├──► Railway: PostgreSQL 16
                                  └──► Railway: Cron worker (tùy chọn, tách riêng)
```

Lý do tách: Vercel tối ưu cho Next.js (edge CDN, ISR) nhưng **không chạy được Playwright** trong serverless function một cách ổn định. Scraper phải nằm trên container luôn chạy → Railway (hoặc Render/Fly.io/VPS).

---

## 1. PostgreSQL trên Railway

1. Railway → **New Project** → **Provision PostgreSQL**.
2. Vào tab *Variables*, copy `DATABASE_URL`.
3. Bật extension (Railway cho phép, migration đã tự `CREATE EXTENSION IF NOT EXISTS`).
4. Khuyến nghị bật **Backups** hằng ngày trong Settings.

> Nếu dùng Supabase/Neon: thêm `?sslmode=require&pgbouncer=true&connection_limit=1` vào `DATABASE_URL` khi qua connection pooler, và dùng `DIRECT_URL` riêng cho `prisma migrate`.

---

## 2. API trên Railway

1. **New Service → Deploy from GitHub repo**, chọn repo này.
2. Settings:
   - **Root Directory**: giữ `/` — Dockerfile `COPY packages/shared`, build context phải là gốc repo
   - **Watch Paths**: `apps/api/**`, `packages/shared/**`, `pnpm-lock.yaml`
   - **Healthcheck Path**: `/api/v1/health`, timeout `300`
   - Đường dẫn Dockerfile khai báo bằng **biến** `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`
     (không phải ô Settings; Railway build từ gốc repo nên mọi `COPY` dùng đường dẫn tuyệt đối từ gốc)
3. Variables:

```env
NODE_ENV=production
API_PORT=4000
API_PREFIX=api/v1
DATABASE_URL=${{Postgres.DATABASE_URL}}
CORS_ORIGINS=https://your-app.vercel.app
ADMIN_API_KEY=<chuỗi ngẫu nhiên 32+ ký tự>

SCRAPER_ENABLED=true
SCRAPER_CONCURRENCY=2
SCRAPER_MAX_PAGES=5
SCRAPER_REQUEST_DELAY_MS=2000
SCRAPER_USER_AGENT=OGJobsBot/1.0 (+https://your-app.vercel.app/bot; you@example.com)
PLAYWRIGHT_HEADLESS=true

CRON_ENABLED=true
CRON_SCRAPE_ALL=15 3 * * *
CRON_EXPIRE=30 4 * * *
CRON_FX=0 5 * * *
JOB_TTL_DAYS=60

CLASSIFIER_MIN_SCORE=6
CLASSIFIER_MIN_MARGIN=2
HF_ENABLED=false
```

4. **Generate Domain** → nhận URL dạng `https://og-api-production.up.railway.app`.
5. Kiểm tra: `curl https://<domain>/api/v1/health`

### Tài nguyên tối thiểu
Playwright cần RAM: đặt ít nhất **1GB RAM / 1 vCPU**. Nếu chỉ dùng nguồn Workday + Cheerio (không Playwright), 512MB là đủ — khi đó tắt SLB scraper để tiết kiệm.

### Migration
`CMD` trong Dockerfile đã chạy `prisma migrate deploy` trước khi start, nên mỗi lần deploy schema tự đồng bộ. Seed chạy 1 lần thủ công:

```bash
railway run --service og-api node dist/scripts/seed.js
```

---

## 3. Tách cron worker (khuyến nghị khi scale API > 1 replica)

Nếu API chạy nhiều replica, mọi replica đều sẽ bật cron → scrape trùng lặp. Cách xử lý:

1. Service **og-api**: `CRON_ENABLED=false`, `SCRAPER_ENABLED=true` (vẫn nhận lệnh scrape thủ công qua API).
2. Service **og-worker**: cùng image, `CRON_ENABLED=true`, replicas = 1, không expose domain.

Hoặc dùng **Railway Cron Jobs** (không cần process thường trú):

- Service riêng, Start Command: `node dist/scripts/scrape-cli.js`
- Schedule: `15 3 * * *` (UTC), khoảng cách tối thiểu giữa 2 lần chạy là 5 phút
- `CRON_ENABLED=false` ở mọi service khác
- ⚠️ Tiến trình **bắt buộc phải thoát** khi xong, nếu không lần chạy kế tiếp bị bỏ qua.
  `scrape-cli.ts` đã ép `process.exit()` sau 5 giây ân hạn để đảm bảo điều này.

---

## 4. Frontend trên Vercel

1. **Import Git Repository**.
2. Cấu hình:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Include files outside root directory**: ✅ bật (cần `packages/shared`)
   - **Install Command**: `pnpm install --frozen-lockfile=false`
   - **Build Command**: `cd ../.. && pnpm --filter @og/shared build && pnpm --filter @og/web build`
   - **Output Directory**: `.next`
3. Environment Variables:

```env
NEXT_PUBLIC_API_URL=https://og-api-production.up.railway.app/api/v1
NEXT_PUBLIC_SITE_NAME=OilGas Jobs Radar
```

4. Deploy, rồi quay lại Railway cập nhật `CORS_ORIGINS` = domain Vercel thật.

> `NEXT_PUBLIC_*` được nhúng lúc build → đổi giá trị phải **redeploy**, không chỉ restart.

---

## 5. Triển khai bằng Docker Compose (VPS)

```bash
git clone <repo> && cd og-jobs
cp .env.example .env      # sửa ADMIN_API_KEY, POSTGRES_PASSWORD, CORS_ORIGINS
docker compose up -d --build
docker compose exec api node dist/scripts/seed.js
docker compose logs -f api
```

Đặt Nginx/Caddy phía trước để có HTTPS:

```nginx
server {
  server_name jobs.example.com;
  location /api/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; }
  location /     { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
}
```

---

## 6. Checklist trước khi lên production

- [ ] `ADMIN_API_KEY` là chuỗi ngẫu nhiên mạnh, không phải giá trị mặc định.
- [ ] `CORS_ORIGINS` chỉ chứa domain thật, không để `*`.
- [ ] Rate limit (`THROTTLE_LIMIT`) phù hợp lưu lượng dự kiến.
- [ ] Đã kiểm tra `robots.txt`/ToU của từng nguồn; nguồn chưa xác minh để `enabled: false`.
- [ ] `SCRAPER_REQUEST_DELAY_MS >= 1500`, User-Agent có email liên hệ.
- [ ] Bật backup PostgreSQL hằng ngày.
- [ ] Giám sát bảng `scrape_runs` (alert khi `found = 0` hai lần liên tiếp).
- [ ] `shm_size >= 1gb` cho container chạy Playwright.
- [ ] Sanitize HTML mô tả trước khi `dangerouslySetInnerHTML` (thêm `isomorphic-dompurify` ở tầng API).
- [ ] Chỉ một service duy nhất đặt `CRON_ENABLED=true` (tránh scrape trùng khi scale nhiều replica).

> Lưu ý: Railway đã ngừng phát triển **Config as Code** (`railway.json`/`railway.toml`, hỗ trợ tới
> 2026-12-01). Nếu muốn quản lý hạ tầng bằng code, dùng
> [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) (`.railway/railway.ts`).

---

## 7. Vận hành

| Việc | Lệnh |
|---|---|
| Xem trạng thái nguồn | `GET /api/v1/scrape/sources` |
| Lịch sử scrape | `GET /api/v1/scrape/runs?limit=50` |
| Chạy lại 1 nguồn | `POST /api/v1/scrape/run {"source":"slb"}` |
| Phân loại lại sau khi sửa từ điển | `POST /api/v1/classify/rebuild {"limit":10000}` |
| Kiểm tra chất lượng phân loại | `GET /api/v1/classify/stats` |
| Kiểm tra DB | `pnpm db:studio` |

### Khi một nguồn hỏng (site đổi DOM)

1. `GET /api/v1/scrape/runs?source=<key>` → xem `errors` và `found`.
2. Mở URL tìm kiếm của nguồn trên trình duyệt, kiểm tra selector trong DevTools.
3. Sửa hằng số `SELECTORS` trong file scraper tương ứng (mọi selector gom 1 chỗ).
4. Chạy lại: `pnpm scrape <key>`.
