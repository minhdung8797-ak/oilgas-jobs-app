# Runbook lên Production — Railway + Vercel

> 💡 Dùng **Render** thay Railway? Xem [RENDER-RUNBOOK.md](RENDER-RUNBOOK.md) —
> toàn bộ backend dựng bằng một file `render.yaml`, ít thao tác thủ công hơn.

> Làm tuần tự từ bước 0. Mỗi bước có phần **✅ Kiểm chứng** — không đạt thì đừng đi tiếp,
> xem mục [Xử lý lỗi thường gặp](#12-xử-lý-lỗi-thường-gặp) ở cuối.
>
> Thời gian dự kiến: **60–90 phút** cho lần đầu.
> Kiến trúc đích:
>
> ```
> Vercel (Next.js, CDN edge)  ──HTTPS──►  Railway "og-api"     (NestJS + Playwright, luôn chạy)
>                                              │
>                                              ├──►  Railway "Postgres"   (PostgreSQL 16)
>                                              └──►  Railway "og-cron"    (chạy scraper theo lịch rồi thoát)
> ```
>
> **Vì sao không để tất cả trên Vercel:** Playwright cần Chromium + tiến trình sống lâu,
> serverless function của Vercel không chạy ổn định. Scraper bắt buộc nằm trên container.

---

## Bước 0 — Chuẩn bị (10 phút)

```bash
# Cài công cụ
npm i -g @railway/cli
npm i -g vercel

# Kiểm tra
railway --version
vercel --version
node -v          # cần >= 20.11
```

Sinh khóa admin — **lưu lại ngay, dùng ở bước 3 và 8**:

```bash
# macOS / Linux
openssl rand -hex 32

# Windows PowerShell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Đẩy code lên GitHub (nếu chưa):

```bash
cd "D:\Oil and Gas Job Hunting Web App"
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

**✅ Kiểm chứng:** `git ls-files | wc -l` ra khoảng 95 file, và **không** có file `.env` nào
(`git ls-files | grep "\.env$"` phải rỗng — chỉ được có `.env.example`).

---

## Bước 1 — Rà soát cấu hình trước khi deploy (10 phút)

Đây là bước hay bị bỏ qua nhất và cũng là nguyên nhân số 1 gây lỗi sau khi lên production.

### 1.1 Tắt các nguồn chưa xác minh

Mở `apps/api/src/scraper/sources/generic-html.scraper.ts` và `workday.scraper.ts`,
kiểm tra cờ `enabled`. Chỉ bật nguồn bạn đã tự mở trình duyệt kiểm tra selector.

Mặc định trong repo:

| Nguồn | `enabled` | Ghi chú |
|---|---|---|
| `rigzone` | ✅ | Kiểm tra ToU trước khi bật thật |
| `slb` | ✅ | Playwright, tốn RAM nhất |
| `bakerhughes` | ✅ | Workday JSON API |
| `halliburton`, `equinor` | ✅ | Workday — xác minh tenant |
| `oilandgasjobsearch` | ✅ | Selector cần xác minh |
| `weatherford`, `totalenergies`, `adnoc` | ❌ | Cố ý tắt |

> **Khuyến nghị cho lần deploy đầu:** chỉ để `bakerhughes` bật (Workday JSON API,
> ổn định nhất, không cần Chromium). Chạy thông rồi mới bật thêm từng nguồn.

### 1.2 Kiểm tra robots.txt của từng nguồn

```bash
curl -s https://www.rigzone.com/robots.txt | head -40
curl -s https://www.oilandgasjobsearch.com/robots.txt | head -40
```

Nguồn nào `Disallow` đường dẫn tìm kiếm → để `enabled: false`, tìm API/RSS chính thức thay thế.

**✅ Kiểm chứng:** chạy local một lần trước khi lên production:

```bash
pnpm install
pnpm --filter @og/api eval        # classifier phải đạt 13/13
```

---

## Bước 2 — Tạo PostgreSQL trên Railway (5 phút)

1. Vào [railway.com/new](https://railway.com/new) → **Empty Project** → đặt tên `oilgas-jobs`.
2. Trong canvas: **+ Create** → **Database** → **Add PostgreSQL**.
3. Đổi tên service thành `Postgres` (nếu chưa đúng).
4. Vào service **Postgres** → tab **Settings** → bật **Backups** (Daily).

Link CLI vào project:

```bash
railway login
cd "D:\Oil and Gas Job Hunting Web App"
railway link          # chọn workspace → project oilgas-jobs → environment production
railway status
```

**✅ Kiểm chứng:**

```bash
railway variables --service Postgres | grep DATABASE_URL
```

Phải in ra chuỗi `postgresql://postgres:...@...railway.internal:5432/railway`.

> **Lưu ý:** dùng biến tham chiếu `${{Postgres.DATABASE_URL}}` ở bước sau, **đừng copy-paste
> chuỗi cứng** — Railway sẽ tự cập nhật nếu mật khẩu DB thay đổi.

---

## Bước 3 — Tạo service API (15 phút)

### 3.1 Tạo service

Canvas → **+ Create** → **GitHub Repo** → chọn repo của bạn → đặt tên service là **`og-api`**.

### 3.2 Cấu hình build

Vào **og-api** → **Settings**:

| Mục | Giá trị | Vì sao |
|---|---|---|
| **Root Directory** | `/` (để nguyên) | Dockerfile `COPY packages/shared` cần context là gốc repo |
| **Watch Paths** | `apps/api/**`<br>`packages/shared/**`<br>`pnpm-lock.yaml` | Sửa frontend không kích hoạt rebuild backend |
| **Healthcheck Path** | `/api/v1/health` | |
| **Healthcheck Timeout** | `300` | Image Playwright khởi động chậm |
| **Restart Policy** | `ON_FAILURE`, max retries `10` | |

Chỉ đường dẫn Dockerfile bằng **biến môi trường** (không phải Settings):

```bash
railway variables --service og-api --set "RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile"
```

> Railway build từ **gốc repo** chứ không phải thư mục chứa Dockerfile — đúng với cách
> `apps/api/Dockerfile` được viết (mọi `COPY` đều dùng đường dẫn từ gốc). Đó là lý do
> Root Directory phải giữ `/`.

### 3.3 Đặt biến môi trường

Thay `<ADMIN_KEY>` bằng khóa sinh ở bước 0. Tạm để `CORS_ORIGINS` là `*`, bước 8 sẽ siết lại.

```bash
railway variables --service og-api \
  --set "NODE_ENV=production" \
  --set "API_PREFIX=api/v1" \
  --set "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  --set "ADMIN_API_KEY=<ADMIN_KEY>" \
  --set "CORS_ORIGINS=*" \
  --set "THROTTLE_TTL=60" \
  --set "THROTTLE_LIMIT=120" \
  --set "SCRAPER_ENABLED=true" \
  --set "SCRAPER_CONCURRENCY=2" \
  --set "SCRAPER_MAX_PAGES=3" \
  --set "SCRAPER_REQUEST_DELAY_MS=2500" \
  --set "SCRAPER_TIMEOUT_MS=45000" \
  --set "SCRAPER_USER_AGENT=OGJobsBot/1.0 (+https://<domain-cua-ban>/bot; <email-cua-ban>)" \
  --set "PLAYWRIGHT_HEADLESS=true" \
  --set "CRON_ENABLED=false" \
  --set "JOB_TTL_DAYS=60" \
  --set "CLASSIFIER_MIN_SCORE=6" \
  --set "CLASSIFIER_MIN_MARGIN=2" \
  --set "HF_ENABLED=false"
```

> ⚠️ **Đừng đặt biến `API_PORT`.** Railway/Render cấp cổng qua biến `PORT`; app ưu tiên `PORT`,
> đặt thêm `API_PORT` chỉ gây nhầm lẫn. `API_PORT` chỉ dùng cho local/docker-compose.

> **`CRON_ENABLED=false` là cố ý.** Cron sẽ chạy ở service riêng (bước 6). Nếu bật ở đây và
> sau này scale API lên 2 replica, cả hai replica cùng scrape → dữ liệu trùng, bị nguồn chặn IP.

### 3.4 Cấp tài nguyên

**Settings → Resources**: tối thiểu **1 GB RAM / 1 vCPU**.
Chromium cần ~400 MB mỗi context. Nếu chỉ dùng nguồn Workday (không Playwright) thì 512 MB là đủ.

### 3.5 Deploy và mở domain

```bash
railway up --service og-api --detach      # hoặc chờ auto-deploy từ GitHub
railway domain --service og-api           # sinh domain *.up.railway.app
railway logs --service og-api
```

Trong log phải thấy:

```
Prisma schema loaded from prisma/schema.prisma
X migrations found in prisma/migrations
Applying migration `20250101000000_init`
Applying migration `20250101000100_search_vector`
[Nest] LOG [Bootstrap] API sẵn sàng tại http://localhost:4000/api/v1
```

**✅ Kiểm chứng:**

```bash
export API=https://og-api-production-xxxx.up.railway.app     # domain thật của bạn
curl -s $API/api/v1/health | jq
```

Kỳ vọng:

```json
{ "status": "ok", "db": "up", "dbLatencyMs": 3, "uptimeSec": 12, "version": "1.0.0" }
```

`"db": "down"` → xem [12.2](#122-db-down). Không phản hồi → xem [12.1](#121-application-failed-to-respond).

---

## Bước 4 — Nạp dữ liệu nền (5 phút)

Seed nạp 49 quốc gia, 38 công ty, 32 kỹ năng và bảng tỉ giá dự phòng. **Chạy một lần duy nhất**
(script dùng `upsert` nên chạy lại cũng an toàn).

```bash
railway ssh --service og-api "node dist/scripts/seed.js"
```

Nếu `railway ssh` không khả dụng trên gói của bạn, dùng cách chạy từ máy local trỏ vào DB production:

```bash
railway run --service og-api -- node apps/api/dist/scripts/seed.js
# hoặc: lấy DATABASE_URL public rồi chạy pnpm db:seed từ máy
```

**✅ Kiểm chứng:**

```bash
curl -s $API/api/v1/countries | jq 'length'    # 49
curl -s $API/api/v1/skills    | jq 'length'    # 32
curl -s "$API/api/v1/companies" | jq 'length'  # 38
```

---

## Bước 5 — Chạy scrape thử một nguồn (10 phút)

Đừng chạy tất cả nguồn ngay lần đầu. Bắt đầu bằng nguồn ổn định nhất:

```bash
curl -s -X POST $API/api/v1/scrape/run \
  -H "Authorization: Bearer <ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"source":"bakerhughes"}' | jq
```

Kết quả mong đợi (chạy đồng bộ, mất 1–3 phút):

```json
[{
  "source": "bakerhughes", "status": "SUCCESS",
  "found": 84, "inserted": 71, "updated": 0, "skipped": 13, "failed": 0,
  "durationMs": 96412, "errors": []
}]
```

Đọc kết quả:

| Dấu hiệu | Nghĩa là | Xử lý |
|---|---|---|
| `found > 0`, `inserted > 0` | Ngon | Đi tiếp |
| `found = 0` | Site đổi cấu trúc / sai tenant | [12.4](#124-scrape-found--0) |
| `found > 0` nhưng `inserted = 0` | Classifier loại hết | [12.5](#125-inserted--0) |
| `failed > 0` | Lỗi ghi DB | Xem `errors` trong response |
| `status: FAILED` | Nguồn chết hoàn toàn | Xem `railway logs` |

Kiểm tra chất lượng phân loại:

```bash
curl -s $API/api/v1/classify/stats | jq
```

Nếu `lowConfidenceCount` chiếm > 30% tổng số → tinh chỉnh từ điển theo [docs/NLP.md](NLP.md).

**✅ Kiểm chứng:**

```bash
curl -s "$API/api/v1/jobs?pageSize=3" | jq '.meta.total, .data[0].title, .data[0].discipline'
curl -s "$API/api/v1/jobs/facets" | jq '.disciplines'
```

Sau khi thông, bật dần từng nguồn còn lại, mỗi lần một nguồn.

---

## Bước 6 — Service cron riêng (10 phút)

Railway Cron chạy container theo lịch rồi **bắt buộc tiến trình phải thoát** — nếu không,
các lần chạy sau sẽ bị bỏ qua. `scrape-cli.ts` đã xử lý việc này (ép `process.exit()` sau 5s ân hạn).

### 6.1 Tạo service

Canvas → **+ Create** → **GitHub Repo** → cùng repo → đặt tên **`og-cron`**.

Settings giống `og-api`, **trừ**:

- **KHÔNG** generate domain (cron không cần cổng public)
- **Healthcheck Path**: để trống
- **Restart Policy**: `NEVER`
- **Cron Schedule**: `15 3 * * *` (03:15 UTC = 10:15 giờ VN)
- **Custom Start Command**: `node dist/scripts/scrape-cli.js`

```bash
railway variables --service og-cron \
  --set "RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile" \
  --set "NODE_ENV=production" \
  --set "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  --set "SCRAPER_ENABLED=true" \
  --set "SCRAPER_CONCURRENCY=2" \
  --set "SCRAPER_MAX_PAGES=5" \
  --set "SCRAPER_REQUEST_DELAY_MS=2500" \
  --set "SCRAPER_USER_AGENT=OGJobsBot/1.0 (+https://<domain-cua-ban>/bot; <email-cua-ban>)" \
  --set "PLAYWRIGHT_HEADLESS=true" \
  --set "CRON_ENABLED=false" \
  --set "CLASSIFIER_MIN_SCORE=6" \
  --set "CLASSIFIER_MIN_MARGIN=2"
```

Lưu ý về cron của Railway:

- Lịch tính theo **UTC**
- Khoảng cách tối thiểu giữa 2 lần chạy là **5 phút**
- Nếu lần chạy trước chưa thoát, lần sau bị **bỏ qua**

### 6.2 Ẩn job hết hạn + cập nhật tỉ giá

Hai việc này nhẹ, không cần service riêng. Thêm cron thứ hai (`og-cron-maintenance`) với
Start Command và schedule tương ứng, hoặc đơn giản hơn: bật `CRON_ENABLED=true` **chỉ trên
`og-cron`** và đổi Start Command thành `node dist/main.js` — khi đó service này chạy thường trú
và tự quản 3 lịch trong `scheduler.service.ts`. Cách này tốn tiền hơn (container luôn chạy)
nhưng đơn giản và dễ debug hơn.

**✅ Kiểm chứng:** bấm **Deploy** thủ công một lần trên `og-cron`, rồi:

```bash
railway logs --service og-cron
curl -s "$API/api/v1/scrape/runs?limit=5" | jq '.[] | {source, status, found, inserted, triggeredBy}'
```

Deployment của `og-cron` phải chuyển sang trạng thái **hoàn tất/exited**, không treo ở "Active".

---

## Bước 7 — Frontend trên Vercel (15 phút)

### 7.1 Import project

1. [vercel.com/new](https://vercel.com/new) → import repo GitHub.
2. **Framework Preset**: Next.js
3. **Root Directory**: `apps/web`
4. ⚠️ Bật **"Include files outside the Root Directory in the Build Step"** —
   không bật thì build lỗi `Module not found: @og/shared`.
5. **Build & Output Settings** (bấm Override):
   - Install Command: `cd ../.. && pnpm install --no-frozen-lockfile --prod=false`
   - Build Command: `cd ../.. && pnpm --filter @og/shared build && pnpm --filter @og/web build`
   - Output Directory: `.next`

### 7.2 Biến môi trường

```
NEXT_PUBLIC_API_URL   = https://og-api-production-xxxx.up.railway.app/api/v1
NEXT_PUBLIC_SITE_NAME = OilGas Jobs Radar
```

> `NEXT_PUBLIC_*` được **nhúng vào bundle lúc build**. Đổi giá trị phải **Redeploy**,
> restart không có tác dụng.

### 7.3 Deploy

```bash
cd apps/web
vercel --prod
```

**✅ Kiểm chứng:** mở `https://<app>.vercel.app`

- Hero hiển thị đúng tổng số job (không phải 0)
- Sidebar bộ lọc có số đếm bên phải mỗi dòng
- Bấm 1 filter → URL đổi thành `?discipline=RESERVOIR`, danh sách lọc lại
- Bấm vào 1 job → trang chi tiết mở, nút "Ứng tuyển tại nguồn" trỏ đúng URL gốc
- Copy URL đã lọc, mở ở tab ẩn danh → vẫn giữ nguyên bộ lọc (state nằm trong URL)

Nếu trang hiện *"Không kết nối được tới API"* → xem [12.3](#123-frontend-không-gọi-được-api).

---

## Bước 8 — Siết bảo mật (5 phút) ⚠️ Bắt buộc

Bây giờ mới biết domain Vercel thật, quay lại khóa CORS:

```bash
railway variables --service og-api \
  --set "CORS_ORIGINS=https://<app>.vercel.app,https://<domain-that>.com"
railway redeploy --service og-api
```

**✅ Kiểm chứng — CORS phải chặn domain lạ:**

```bash
curl -s -I -H "Origin: https://evil.example.com" "$API/api/v1/jobs" | grep -i access-control-allow-origin
# Kỳ vọng: KHÔNG có dòng nào trả về
```

**✅ Kiểm chứng — endpoint admin phải chặn khi không có key:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/v1/scrape/run -d '{}'
# Kỳ vọng: 401
```

**✅ Kiểm chứng — rate limit hoạt động:**

```bash
for i in $(seq 1 130); do curl -s -o /dev/null -w "%{http_code} " "$API/api/v1/jobs?pageSize=1"; done; echo
# Kỳ vọng: xuất hiện 429 ở cuối dãy
```

---

## Bước 9 — Domain riêng (tùy chọn, 10 phút)

**Frontend (Vercel):** Project → Settings → Domains → thêm `jobs.example.com` → khai báo DNS
theo hướng dẫn (thường là CNAME trỏ về `cname.vercel-dns.com`).

**API (Railway):** Service `og-api` → Settings → Networking → Custom Domain → `api.example.com`
→ thêm bản ghi CNAME theo hướng dẫn.

Sau khi DNS xong, cập nhật lại **cả hai** đầu:

```bash
railway variables --service og-api --set "CORS_ORIGINS=https://jobs.example.com"
railway redeploy --service og-api
# Vercel: sửa NEXT_PUBLIC_API_URL = https://api.example.com/api/v1 rồi REDEPLOY
```

---

## Bước 10 — Giám sát (10 phút)

### 10.1 Uptime

Tạo monitor miễn phí (UptimeRobot / BetterStack) trỏ vào:

- `https://api.example.com/api/v1/health` — mỗi 5 phút, cảnh báo khi khác 200
- `https://jobs.example.com` — mỗi 5 phút

### 10.2 Cảnh báo scraper hỏng

Dấu hiệu sớm nhất khi một job board đổi giao diện là `found` tụt về 0 mà không có lỗi.

```bash
# Chạy tay hằng tuần, hoặc đưa vào monitor
curl -s "$API/api/v1/scrape/runs?limit=20" \
  | jq '[.[] | select(.found == 0 and .status != "RUNNING")] | .[] | {source, started_at: .startedAt, status}'
```

Rỗng = mọi nguồn còn sống.

### 10.3 Sức khỏe phân loại

```bash
curl -s $API/api/v1/classify/stats | jq
```

Theo dõi `avgConfidence` (nên > 0.6) và `lowConfidenceCount`.

### 10.4 Webhook Railway

Service → Settings → Webhooks → thêm URL Slack/Discord để nhận thông báo deploy fail.

---

## Bước 11 — Checklist nghiệm thu cuối

Chạy hết, tất cả phải xanh:

```bash
export API=https://api.example.com
export WEB=https://jobs.example.com
export KEY=<ADMIN_KEY>

echo "1. Health:";        curl -s $API/api/v1/health | jq -r '.status + " / db=" + .db'
echo "2. Jobs:";          curl -s "$API/api/v1/jobs?pageSize=1" | jq '.meta.total'
echo "3. Facets:";        curl -s "$API/api/v1/jobs/facets" | jq '.disciplines | length'
echo "4. Chi tiết:";      curl -s "$API/api/v1/jobs/$(curl -s "$API/api/v1/jobs?pageSize=1" | jq -r '.data[0].slug')" | jq -r '.title'
echo "5. Full-text:";     curl -s "$API/api/v1/jobs?q=reservoir&sort=relevance" | jq '.meta.total'
echo "6. Classify:";      curl -s -X POST $API/api/v1/classify -H 'Content-Type: application/json' -d '{"title":"Senior Reservoir Engineer","description":"history matching eclipse stoiip oil and gas"}' | jq -r '.discipline + " " + (.confidence|tostring)'
echo "7. Admin chặn:";    curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/v1/scrape/run -d '{}'
echo "8. Admin cho qua:"; curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/v1/scrape/run -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"source":"bakerhughes","async":true}'
echo "9. Swagger:";       curl -s -o /dev/null -w "%{http_code}\n" $API/api/v1/docs
echo "10. Web:";          curl -s -o /dev/null -w "%{http_code}\n" $WEB
```

Kỳ vọng: `ok / db=up` · số > 0 · `4` · tiêu đề job · số > 0 · `RESERVOIR 0.9x` · `401` · `202` · `200` · `200`

Kèm checklist thủ công:

- [ ] `ADMIN_API_KEY` là chuỗi ngẫu nhiên, chưa từng commit vào Git
- [ ] `CORS_ORIGINS` không còn `*`
- [ ] Backup PostgreSQL đã bật (Daily)
- [ ] `og-api` có `CRON_ENABLED=false`, chỉ `og-cron` chạy lịch
- [ ] Mỗi nguồn đang bật đều đã kiểm tra `robots.txt`
- [ ] `SCRAPER_USER_AGENT` có email liên hệ thật
- [ ] Uptime monitor đã dựng
- [ ] Đã chạy `pnpm --filter @og/api eval` sau lần sửa từ điển gần nhất

---

## 12. Xử lý lỗi thường gặp

### 12.1 "Application failed to respond"

Railway không tìm thấy cổng đang lắng nghe.

```bash
railway logs --service og-api | tail -50
```

Kiểm tra theo thứ tự:

1. App phải bind `0.0.0.0`, không phải `127.0.0.1` — code đã đúng (`app.listen(port, '0.0.0.0')`).
2. Biến `API_PORT` phải khớp cổng Railway dò được. Nếu vẫn lỗi, bỏ `API_PORT` để app dùng `PORT` do Railway cấp.
3. Healthcheck timeout quá ngắn — image Playwright khởi động chậm, đặt `300`.

### 12.2 `"db": "down"`

```bash
railway variables --service og-api | grep DATABASE_URL
```

- Phải là `${{Postgres.DATABASE_URL}}`, không phải chuỗi cứng đã hết hạn.
- Dùng host `*.railway.internal` (private network) — nhanh và không tốn băng thông egress.
- Migration chưa chạy: `railway ssh --service og-api "npx prisma migrate deploy"`.

### 12.3 Frontend không gọi được API

Mở DevTools → Console trên trang Vercel:

| Thông báo | Nguyên nhân | Sửa |
|---|---|---|
| `blocked by CORS policy` | `CORS_ORIGINS` chưa có domain Vercel | Cập nhật biến rồi `railway redeploy` |
| `Failed to fetch` / `ERR_NAME_NOT_RESOLVED` | Sai `NEXT_PUBLIC_API_URL` | Sửa biến rồi **redeploy** (không phải restart) |
| Trang hiện "Không kết nối được tới API" nhưng curl API vẫn OK | `NEXT_PUBLIC_API_URL` thiếu hậu tố `/api/v1` | Thêm vào, redeploy |
| 429 | Rate limit chặn IP của Vercel | Tăng `THROTTLE_LIMIT`, hoặc tăng `revalidate` trong `lib/api.ts` |

### 12.4 Scrape `found = 0`

Nghĩa là scraper chạy được nhưng không lấy được dòng nào — gần như luôn do site đổi giao diện.

```bash
curl -s "$API/api/v1/scrape/runs?source=rigzone&limit=3" | jq '.[0].errors'
```

Cách sửa:

1. Mở URL tìm kiếm của nguồn trên trình duyệt (xem `searchUrlTemplate` trong code).
2. DevTools → Elements, tìm selector thật của thẻ job.
3. Sửa hằng số `SELECTORS` trong file scraper tương ứng — mọi selector đã gom về một chỗ.
4. Test local: `pnpm scrape rigzone`
5. Commit → Railway tự deploy.

Riêng nguồn Workday: `found = 0` thường do sai `host`/`tenant`/`site`. Mở trang careers của công ty,
DevTools → Network, tìm request tới `/wday/cxs/<tenant>/<site>/jobs` và copy đúng 3 giá trị đó vào
`WORKDAY_TENANTS`.

### 12.5 `inserted = 0` dù `found > 0`

Classifier loại hết. Lấy một tiêu đề thật rồi soi điểm:

```bash
curl -s -X POST $API/api/v1/classify \
  -H 'Content-Type: application/json' \
  -d '{"title":"<tiêu đề thật lấy từ nguồn>","description":"<mô tả>"}' | jq
```

- `scores` toàn 0 → thiếu keyword, bổ sung vào `packages/shared/src/keywords.ts`
- `discipline: OTHER` mà `scores` có điểm khá → hạ `CLASSIFIER_MIN_SCORE` xuống 4–5
- Bị `INDUSTRY_SIGNALS` chặn → mô tả quá ngắn, kiểm tra `enrich()` có lấy được `description` không

Sau khi sửa từ điển, phân loại lại toàn bộ DB:

```bash
curl -s -X POST $API/api/v1/classify/rebuild \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"limit":10000}' | jq '{processed, changed}'
```

### 12.6 Build Docker fail

| Lỗi | Sửa |
|---|---|
| `Dockerfile does not exist` | Đặt `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`, Root Directory giữ `/` |
| `COPY packages/shared: not found` | Root Directory bị đổi thành `apps/api` — trả về `/` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `pnpm install` ở local rồi commit `pnpm-lock.yaml` |
| Hết RAM khi build | Nâng gói Railway, hoặc build image ở CI rồi deploy bằng image |

### 12.7 Chromium crash / `Target closed`

Thiếu shared memory. Trên Docker Compose đã có `shm_size: 1gb`; trên Railway thì:

- Nâng RAM service lên ≥ 1 GB
- Đảm bảo `--disable-dev-shm-usage` có trong args (đã có sẵn trong `browser-pool.ts`)
- Giảm `SCRAPER_CONCURRENCY` xuống `1`

### 12.8 Cron không chạy lần thứ hai

Lần chạy trước chưa thoát. Kiểm tra deployment của `og-cron` — nếu vẫn "Active" sau khi
scrape xong thì có handle bị treo. `scrape-cli.ts` đã có cơ chế ép thoát sau 5 giây;
nếu vẫn treo, xem log xem `app.close()` có bị kẹt ở BrowserPool không.

---

## 13. Vận hành thường ngày

| Việc | Lệnh |
|---|---|
| Xem log API | `railway logs --service og-api` |
| Xem log cron gần nhất | `railway logs --service og-cron` |
| Trạng thái mọi nguồn | `curl -s $API/api/v1/scrape/sources \| jq '.[] \| {key, enabled, isRunning, lastRun}'` |
| Chạy lại 1 nguồn | `curl -X POST $API/api/v1/scrape/run -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"source":"slb","async":true}'` |
| Phân loại lại sau khi sửa từ điển | `POST /api/v1/classify/rebuild {"limit":10000}` |
| Ẩn job quá hạn thủ công | Chạy `og-cron` với `CRON_ENABLED=true` hoặc gọi trực tiếp trong DB |
| Kết nối psql | `railway connect Postgres` |
| Rollback | Railway → Deployments → deployment cũ → **Redeploy** |

### Quy trình phát hành thay đổi

```bash
# 1. Sửa code, test local
pnpm --filter @og/api eval        # classifier không được tụt
pnpm --filter @og/web build       # frontend build sạch

# 2. Commit -> Railway & Vercel tự deploy
git add . && git commit -m "fix(scraper): cập nhật selector rigzone" && git push

# 3. Theo dõi
railway logs --service og-api
curl -s $API/api/v1/health | jq -r .status
```

Có thay đổi schema Prisma thì thêm migration trước khi push:

```bash
pnpm --filter @og/api exec prisma migrate dev --name <ten_thay_doi>
git add apps/api/prisma/migrations && git commit -m "db: <mo ta>"
```

Dockerfile chạy `prisma migrate deploy` trước khi start nên schema tự đồng bộ mỗi lần deploy.
**Không bao giờ** dùng `prisma db push` hay `migrate reset` trên production.

---

## 14. Chi phí ước tính

| Hạng mục | Cấu hình | Ước tính/tháng |
|---|---|---|
| Railway `og-api` | 1 GB RAM, chạy 24/7 | ~$8–12 |
| Railway `og-cron` | 1 GB RAM, ~10 phút/ngày | ~$0.5–1 |
| Railway PostgreSQL | 1 GB RAM + 5 GB đĩa | ~$5–8 |
| Vercel | Hobby (dự án cá nhân) | $0 |
| **Tổng** | | **~$15–20** |

Cách tiết kiệm:

- Tắt các scraper dùng Playwright (SLB), chỉ giữ Workday JSON API → hạ RAM `og-api` xuống 512 MB
- Gộp `og-cron` vào `og-api` (bật `CRON_ENABLED=true`) nếu chỉ chạy 1 replica → tiết kiệm ~$1
- Giảm `SCRAPER_MAX_PAGES` để rút ngắn thời gian chạy

---

## Nguồn tham khảo

- [Railway · Deploying a Monorepo](https://docs.railway.com/deployments/monorepo)
- [Railway · Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway · Cron Jobs](https://docs.railway.com/cron-jobs)
- [Railway · Pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway · Healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Railway · Production readiness checklist](https://docs.railway.com/overview/production-readiness-checklist)
- [Railway · Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) — thay thế cho `railway.json` (Config as Code ngừng hỗ trợ từ 2026-12-01)
- [Vercel · Using Monorepos](https://vercel.com/docs/monorepos)
