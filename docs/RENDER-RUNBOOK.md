# Runbook lên Production — Git → Render → Vercel

> Luồng quen thuộc: push code lên GitHub → Render tự dựng backend + database từ `render.yaml`
> → Vercel dựng frontend. Mỗi bước có mục **✅ Kiểm chứng**; không đạt thì dừng lại, xem
> [mục 11 — Xử lý lỗi](#11-xử-lý-lỗi-thường-gặp).
>
> Thời gian: **45–70 phút** cho lần đầu (Render Blueprint làm thay phần lớn việc thủ công).
>
> ```
> GitHub repo
>    │
>    ├──► Render Blueprint (render.yaml)  ──►  og-postgres    PostgreSQL 16
>    │                                    ──►  og-api         Web Service (Docker)
>    │                                    ──►  og-scrape      Cron 03:15 UTC
>    │                                    ──►  og-maintenance Cron 04:30 UTC
>    │
>    └──► Vercel  ──►  apps/web  (Next.js, CDN edge)
> ```

> 💸 **Muốn $0/tháng?** Xem [FREE-HOSTING.md](FREE-HOSTING.md) — ghép Render free + Neon +
> GitHub Actions (thay cron trả phí). Đánh đổi chính: API ngủ sau 15 phút, lần mở đầu chờ ~1 phút.

**Vì sao frontend không đặt luôn trên Render:** được, nhưng Vercel cho ISR + CDN edge miễn phí
và build Next.js nhanh hơn. Nếu muốn gom hết về Render, xem [mục 12](#12-tuỳ-chọn-đặt-luôn-frontend-trên-render).

---

## Bước 0 — Chuẩn bị (10 phút)

```bash
# CLI (tuỳ chọn nhưng nên có, dùng để validate blueprint và xem log)
npm i -g render-cli      # hoặc: brew install render
npm i -g vercel

node -v                  # cần >= 20.11
```

Đẩy code lên GitHub:

```bash
cd "D:\Oil and Gas Job Hunting Web App"
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

**✅ Kiểm chứng:**

```bash
git ls-files | grep -c .          # ~97 file
git ls-files | grep "\.env$"      # PHẢI rỗng — chỉ được có .env.example
git ls-files | grep render.yaml   # phải thấy render.yaml ở gốc repo
```

---

## Bước 1 — Rà soát trước khi deploy (10 phút)

### 1.1 Sửa 3 giá trị bắt buộc trong `render.yaml`

| Dòng | Sửa thành |
|---|---|
| `region: singapore` (4 chỗ) | `singapore` / `oregon` / `frankfurt` — chọn gần người dùng. **Không đổi được sau khi tạo.** |
| `SCRAPER_USER_AGENT` (2 chỗ) | Domain + email liên hệ thật của bạn |
| `plan: basic-256mb` (database) | Giữ nguyên ($6/tháng) hoặc `free` nếu chỉ thử nghiệm |

> ⚠️ **Về `plan: free` cho database:** Render nói rõ *"Free Postgres hết hạn sau **30 ngày**"*,
> sau đó có **14 ngày ân hạn** rồi **xoá sạch dữ liệu**, và **không hỗ trợ backup**.
> Dùng để thử thì được, chạy thật thì đừng.

### 1.2 Trạng thái các nguồn scraper

> Gói `0.5c-512mb` ($7, 512 MB RAM) **không đủ RAM chạy Chromium**. Nguồn `slb` (nguồn duy
> nhất dùng Playwright) đã để `enabled: false` sẵn trong code — không cần sửa gì; bật lại
> sau khi nâng `og-api` lên `1c-2g`.

Trạng thái thực tế trong repo — **14 nguồn đang bật, đều là career site chính thức của công ty**:

| Nguồn | Nền tảng | File | `enabled` |
|---|---|---|---|
| `bakerhughes`, `chevron`, `oxy`, `continental`, `diamondback`, `permianresources`, `bp`, `shell` | Workday JSON API | `sources/workday.scraper.ts` | ✅ |
| `adnoc` | Phenom People | `sources/phenom.scraper.ts` | ✅ |
| `eni`, `petronas` | Oracle Recruiting Cloud | `sources/oracle-orc.scraper.ts` | ✅ |
| `qatarenergy` | Jibe | `sources/jibe.scraper.ts` | ✅ |
| `harbourenergy`, `tullow` | SAP SuccessFactors | `sources/generic-html.scraper.ts` | ✅ |
| `rigzone`, `oilandgasjobsearch` | job board bên thứ ba | — | ❌ Terms of Use cấm scraping |
| `slb` | **Playwright** | — | ❌ cần ≥ 1c-2g |
| `halliburton`, `equinor` | — | — | ❌ địa chỉ Workday không tồn tại |
| `weatherford`, `totalenergies` | — | — | ❌ chưa xác minh selector |
| `aramco` | — | — | ❌ site chặn truy cập tự động |

> `halliburton` thực tế dùng SAP SuccessFactors, `equinor` dùng cổng riêng dạng SPA —
> địa chỉ Workday cũ redirect về `community.workday.com/invalid-url`. Muốn bật lại thì
> phải viết scraper mới, không phải sửa tenant.

### 1.3 Test local lần cuối

```bash
pnpm install
pnpm --filter @og/api eval          # classifier phải 13/13
pnpm --filter @og/web build         # frontend build sạch
```

**✅ Kiểm chứng:** cả hai lệnh xanh. Commit thay đổi ở 1.1/1.2 rồi push.

---

## Bước 2 — Dựng backend bằng Render Blueprint (15 phút)

Đây là điểm sướng nhất của Render: **một lần bấm dựng cả 4 thành phần**.

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**
2. Connect GitHub repo → Render tự tìm `render.yaml` ở gốc
3. Đặt **Blueprint Name**: `oilgas-jobs`
4. Render hiển thị 4 resource sẽ tạo và **hỏi giá trị cho biến `CORS_ORIGINS`**
   → tạm nhập `*` (bước 7 sẽ siết lại — chưa biết domain Vercel thật)
5. **Apply**

Render lần lượt: tạo database → build image từ `apps/api/Dockerfile` → chạy migration → khởi động API.
Lần build đầu **8–15 phút** (image Playwright ~2 GB).

> **Đang xảy ra chuyện gì:** `render.yaml` đặt `dockerContext: .` và **cố ý không đặt `rootDir`**.
> Render giới hạn *"file nằm ngoài root directory của service không có mặt lúc build"*, mà
> Dockerfile của ta `COPY packages/shared`, `pnpm-workspace.yaml` từ gốc repo — nên build
> context bắt buộc là gốc repo. Phạm vi auto-deploy được kiểm soát bằng `buildFilter` (đường
> dẫn luôn tính từ gốc repo, kể cả khi có `rootDir`).

Lấy `ADMIN_API_KEY` mà Render sinh tự động:

**Dashboard → og-api → Environment → `ADMIN_API_KEY`** → bấm hiện giá trị → lưu lại, dùng ở bước 4, 5, 7.

**✅ Kiểm chứng:**

```bash
export API=https://og-api-xxxx.onrender.com     # URL thật ở đầu trang service
curl -s $API/api/v1/health | jq
```

Kỳ vọng:

```json
{ "status": "ok", "db": "up", "dbLatencyMs": 4, "uptimeSec": 25, "version": "1.0.0" }
```

Trong **Logs** của `og-api` phải thấy:

```
Applying migration `20250101000000_init`
Applying migration `20250101000100_search_vector`
[Nest] LOG [Bootstrap] API sẵn sàng tại http://localhost:10000/api/v1
```

Không lên được → [11.1](#111-deploy-fail--no-open-ports-detected) hoặc [11.2](#112-build-fail).

---

## Bước 3 — Nạp dữ liệu nền (5 phút)

Seed nạp 49 quốc gia, 38 công ty, 32 kỹ năng, bảng tỉ giá dự phòng. Script dùng `upsert`
nên chạy lại nhiều lần vẫn an toàn.

**Cách A — Shell (gói trả phí, nhanh nhất):**

Dashboard → **og-api** → tab **Shell**:

```bash
node dist/scripts/seed.js
```

**Cách B — Nếu đang dùng gói free** (Render không cho shell trên gói free):

Vào **og-postgres** → **Connect** → copy **External Database URL**, rồi chạy từ máy bạn:

```bash
export DATABASE_URL="postgresql://...@...singapore-postgres.render.com/ogjobs"
pnpm --filter @og/api exec prisma migrate deploy   # nếu chưa chạy
pnpm db:seed
```

> Kết nối external phải dùng **hostname**, không dùng IP (Render cần SNI), và bắt buộc TLS.

**✅ Kiểm chứng:**

```bash
curl -s $API/api/v1/countries | jq 'length'    # 49
curl -s $API/api/v1/skills    | jq 'length'    # 32
curl -s $API/api/v1/companies | jq 'length'    # 38
```

---

## Bước 4 — Scrape thử một nguồn (10 phút)

Đừng chạy tất cả nguồn ngay. Bắt đầu bằng nguồn ổn định nhất (Workday JSON API):

```bash
export KEY=<ADMIN_API_KEY lấy ở bước 2>

curl -s -X POST $API/api/v1/scrape/run \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"source":"bakerhughes"}' | jq
```

Kết quả mong đợi (1–3 phút):

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
| `found = 0` | Site đổi cấu trúc / sai tenant Workday | [11.4](#114-scrape-found--0) |
| `found > 0`, `inserted = 0` | Classifier loại hết | [11.5](#115-inserted--0) |
| `status: FAILED` | Nguồn chết hoàn toàn | Xem Logs của og-api |
| Request treo > 60s rồi timeout | Gói free đã spin-down | Gọi lại lần nữa, hoặc dùng `"async": true` |

Kiểm tra chất lượng phân loại:

```bash
curl -s $API/api/v1/classify/stats | jq
```

`avgConfidence` nên > 0.6. Nếu `lowConfidenceCount` > 30% tổng số → tinh chỉnh từ điển theo [NLP.md](NLP.md).

**✅ Kiểm chứng:**

```bash
curl -s "$API/api/v1/jobs?pageSize=3" | jq '.meta.total, .data[0].title, .data[0].discipline'
curl -s "$API/api/v1/jobs/facets" | jq '.disciplines'
```

Thông rồi thì bật dần từng nguồn còn lại, **mỗi lần một nguồn**, chạy thử rồi mới sang nguồn kế.

---

## Bước 5 — Kiểm tra 2 cron job (5 phút)

Blueprint đã tạo sẵn `og-scrape` (03:15 UTC) và `og-maintenance` (04:30 UTC). Chạy thử tay:

Dashboard → **og-scrape** → **Trigger Run** → theo dõi tab **Logs**.

Điều **bắt buộc** phải thấy: run kết thúc ở trạng thái **Succeeded**, không treo ở *Running*.

> Render nói rõ: *"Nhớ dùng lệnh tự thoát khi xong! Cron job được tính tiền theo thời gian chạy."*
> và *"Render đảm bảo tối đa một lần chạy đang hoạt động tại một thời điểm"* — nếu run cũ chưa
> thoát, run theo lịch kế tiếp sẽ bị **hoãn**. `scrape-cli.ts` và `maintenance-cli.ts` đều đã
> ép `process.exit()` sau 5 giây ân hạn để tránh treo do Chromium/Prisma còn giữ handle.
> Render cũng tự **dừng run quá 12 tiếng**.

**✅ Kiểm chứng:**

```bash
curl -s "$API/api/v1/scrape/runs?limit=5" \
  | jq '.[] | {source, status, found, inserted, triggeredBy, durationMs}'
```

Phải thấy bản ghi với `triggeredBy: "cli"`.

Lưu ý về lịch: **Render luôn dùng UTC**, không có ô chọn múi giờ. `15 3 * * *` = 10:15 sáng giờ VN.

---

## Bước 6 — Frontend trên Vercel (15 phút)

### 6.1 Import

1. [vercel.com/new](https://vercel.com/new) → import repo GitHub
2. **Framework Preset**: Next.js
3. **Root Directory**: `apps/web`
4. ⚠️ Bật **"Include files outside the Root Directory in the Build Step"**
   — không bật thì build lỗi `Module not found: @og/shared`
5. **Build & Output Settings** → bấm **Override**:
   - Install Command: `cd ../.. && pnpm install --no-frozen-lockfile --prod=false`
   - Build Command: `cd ../.. && pnpm --filter @og/shared build && pnpm --filter @og/web build`
   - Output Directory: `.next`

### 6.2 Biến môi trường

```
NEXT_PUBLIC_API_URL   = https://og-api-xxxx.onrender.com/api/v1
NEXT_PUBLIC_SITE_NAME = OilGas Jobs Radar
```

> `NEXT_PUBLIC_*` được nhúng vào bundle **lúc build**. Đổi giá trị phải **Redeploy**,
> restart không có tác dụng.

### 6.3 Deploy

```bash
cd apps/web
vercel --prod
```

**✅ Kiểm chứng:** mở `https://<app>.vercel.app`

- Hero hiển thị đúng tổng số job (không phải 0)
- Sidebar bộ lọc có số đếm bên phải mỗi dòng
- Bấm 1 filter → URL đổi thành `?discipline=RESERVOIR`, danh sách lọc lại
- Bấm 1 job → trang chi tiết mở, nút "Ứng tuyển tại nguồn" trỏ đúng URL gốc
- Copy URL đã lọc → mở tab ẩn danh → vẫn giữ nguyên bộ lọc (state nằm trong URL)

Hiện *"Không kết nối được tới API"* → [11.3](#113-frontend-không-gọi-được-api).

---

## Bước 7 — Siết bảo mật (5 phút) ⚠️ Bắt buộc

Giờ mới biết domain Vercel thật:

Dashboard → **og-api** → **Environment** → sửa `CORS_ORIGINS`:

```
https://<app>.vercel.app,https://<domain-rieng>.com
```

→ **Save, rebuild, and deploy**

> `CORS_ORIGINS` khai báo `sync: false` trong `render.yaml`, nghĩa là Render **chỉ hỏi giá trị
> lúc tạo Blueprint lần đầu** và **bỏ qua** ở các lần cập nhật blueprint sau. Sửa trực tiếp
> trong Dashboard là đúng cách, giá trị đó sẽ không bị blueprint ghi đè.

**✅ Kiểm chứng — CORS chặn domain lạ:**

```bash
curl -s -I -H "Origin: https://evil.example.com" "$API/api/v1/jobs" | grep -i access-control-allow-origin
# Kỳ vọng: KHÔNG in ra dòng nào
```

**✅ Endpoint admin chặn khi thiếu key:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/v1/scrape/run -d '{}'
# Kỳ vọng: 401
```

**✅ Rate limit hoạt động:**

```bash
for i in $(seq 1 130); do curl -s -o /dev/null -w "%{http_code} " "$API/api/v1/jobs?pageSize=1"; done; echo
# Kỳ vọng: xuất hiện 429 ở cuối
```

---

## Bước 8 — Domain riêng (tuỳ chọn, 10 phút)

**Frontend (Vercel):** Project → Settings → Domains → thêm `jobs.example.com` → khai báo CNAME
theo hướng dẫn.

**API (Render):** og-api → Settings → **Custom Domains** → thêm `api.example.com` → thêm CNAME
trỏ về `og-api-xxxx.onrender.com`. Render cấp SSL tự động.

Sau khi DNS xong, cập nhật **cả hai đầu**:

- Render: `CORS_ORIGINS = https://jobs.example.com` → Save & deploy
- Vercel: `NEXT_PUBLIC_API_URL = https://api.example.com/api/v1` → **Redeploy**

---

## Bước 9 — Giám sát (10 phút)

### 9.1 Uptime + chống spin-down

Nếu `og-api` dùng gói **free**: Render nói rõ *"Render tắt Free web service sau **15 phút**
không có traffic"* và *"khởi động lại mất **khoảng một phút**"*. Một monitor ping mỗi 10 phút
sẽ giữ service luôn ấm — nhưng cũng đốt hết **750 giờ free/tháng**, nên gói free chỉ hợp để
demo. Gói `0.5c-512mb` ($7) không bao giờ spin-down.

Dựng monitor (UptimeRobot / BetterStack), chu kỳ 5 phút:

- `https://api.example.com/api/v1/health` — cảnh báo khi khác 200
- `https://jobs.example.com`

### 9.2 Cảnh báo scraper hỏng

Dấu hiệu sớm nhất khi job board đổi giao diện là `found` tụt về 0 mà **không** báo lỗi:

```bash
curl -s "$API/api/v1/scrape/runs?limit=20" \
  | jq '[.[] | select(.found == 0 and .status != "RUNNING")] | .[] | {source, startedAt, status}'
```

Rỗng = mọi nguồn còn sống.

### 9.3 Thông báo deploy fail

og-api → Settings → **Notifications** → thêm webhook Slack/Discord hoặc email.

---

## Bước 10 — Checklist nghiệm thu

```bash
export API=https://api.example.com
export WEB=https://jobs.example.com
export KEY=<ADMIN_API_KEY>

echo "1. Health:";        curl -s $API/api/v1/health | jq -r '.status + " / db=" + .db'
echo "2. Jobs:";          curl -s "$API/api/v1/jobs?pageSize=1" | jq '.meta.total'
echo "3. Facets:";        curl -s "$API/api/v1/jobs/facets" | jq '.disciplines | length'
echo "4. Chi tiết:";      curl -s "$API/api/v1/jobs/$(curl -s "$API/api/v1/jobs?pageSize=1" | jq -r '.data[0].slug')" | jq -r '.title'
echo "5. Full-text:";     curl -s "$API/api/v1/jobs?q=reservoir&sort=relevance" | jq '.meta.total'
echo "6. Classify:";      curl -s -X POST $API/api/v1/classify -H 'Content-Type: application/json' -d '{"title":"Senior Reservoir Engineer","description":"history matching eclipse stoiip oil and gas"}' | jq -r '.discipline + " " + (.confidence|tostring)'
echo "7. Admin chặn:";    curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/v1/scrape/run -d '{}'
echo "8. Admin qua:";     curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/v1/scrape/run -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"source":"bakerhughes","async":true}'
echo "9. Swagger:";       curl -s -o /dev/null -w "%{http_code}\n" $API/api/v1/docs
echo "10. Web:";          curl -s -o /dev/null -w "%{http_code}\n" $WEB
```

Kỳ vọng: `ok / db=up` · số > 0 · `4` · tiêu đề job · số > 0 · `RESERVOIR 0.9x` · `401` · `202` · `200` · `200`

Checklist thủ công:

- [ ] `CORS_ORIGINS` không còn `*`
- [ ] Database **không** dùng gói `free` (nếu chạy thật) — free hết hạn sau 30 ngày, không backup
- [ ] `og-api` có `CRON_ENABLED=false`; lịch chạy ở 2 cron service riêng
- [ ] Cả 2 cron đã Trigger Run thử và kết thúc **Succeeded** (không treo Running)
- [ ] `SCRAPER_USER_AGENT` có domain + email liên hệ thật
- [ ] Mỗi nguồn đang bật đều đã kiểm tra `robots.txt`
- [ ] Uptime monitor đã dựng
- [ ] `ADMIN_API_KEY` đã lưu vào nơi an toàn (Render sinh tự động, không có trong Git)

---

## 11. Xử lý lỗi thường gặp

### 11.1 Deploy fail — "no open ports detected"

Render dò cổng qua biến **`PORT`** (mặc định `10000`) và yêu cầu app bind vào `0.0.0.0`.

- Code đã đúng: `app.listen(port, '0.0.0.0')` và ưu tiên `process.env.PORT`.
- **Đừng đặt biến `API_PORT` trên Render.** Nếu có, xoá đi — nó chỉ dành cho local/docker-compose.
- Kiểm tra Logs: dòng cuối phải là `API sẵn sàng tại http://localhost:10000/api/v1`.

### 11.2 Build fail

| Thông báo | Nguyên nhân | Sửa |
|---|---|---|
| `COPY packages/shared: not found` | Ai đó thêm `rootDir: apps/api` vào render.yaml | Xoá `rootDir`, giữ `dockerContext: .` |
| `Dockerfile not found` | Sai `dockerfilePath` | Phải là `./apps/api/Dockerfile` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Lockfile lệch với package.json | `pnpm install` ở local rồi commit `pnpm-lock.yaml` |
| `Disk space usage exceeds 16 GB` | Build ngốn quá dung lượng | Dọn Dockerfile, hoặc "Clear build cache & deploy" |
| Build treo > 120 phút | Vượt giới hạn build command | Kiểm tra bước `pnpm install` có bị treo mạng không |

Build lần đầu 8–15 phút là bình thường (image Playwright ~2 GB). Các lần sau nhanh hơn nhiều
nhờ cache layer Docker.

### 11.3 Frontend không gọi được API

Mở DevTools → Console trên trang Vercel:

| Thông báo | Nguyên nhân | Sửa |
|---|---|---|
| `blocked by CORS policy` | `CORS_ORIGINS` chưa có domain Vercel | Sửa biến trên Render → Save & deploy |
| `Failed to fetch` | Sai `NEXT_PUBLIC_API_URL` | Sửa trên Vercel rồi **Redeploy** (không phải restart) |
| Hiện "Không kết nối được tới API" nhưng curl API vẫn OK | Thiếu hậu tố `/api/v1` trong `NEXT_PUBLIC_API_URL` | Thêm vào, redeploy |
| Trang load rất chậm lần đầu rồi sau đó nhanh | Gói free spin-down sau 15 phút, khởi động lại ~1 phút | Nâng lên `0.5c-512mb`, hoặc dựng uptime monitor |
| 429 | Rate limit chặn IP của Vercel | Tăng `THROTTLE_LIMIT`, hoặc tăng `revalidate` trong `apps/web/src/lib/api.ts` |

### 11.4 Scrape `found = 0`

Scraper chạy được nhưng không lấy được dòng nào — gần như luôn do site đổi giao diện.

```bash
curl -s "$API/api/v1/scrape/runs?source=rigzone&limit=3" | jq '.[0].errors'
```

Cách sửa:

1. Mở URL tìm kiếm của nguồn trên trình duyệt (xem `searchUrlTemplate` trong code)
2. DevTools → Elements, tìm selector thật của thẻ job
3. Sửa hằng số `SELECTORS` trong file scraper tương ứng — mọi selector đã gom về một chỗ
4. Test local: `pnpm scrape <tên-nguồn>` (ví dụ `pnpm scrape harbourenergy`)
5. Commit → Render tự deploy (nếu đường dẫn khớp `buildFilter`)

Riêng nguồn **Workday**: `found = 0` thường do sai `host`/`tenant`/`site`. Mở trang careers của
công ty → DevTools → Network → tìm request tới `/wday/cxs/<tenant>/<site>/jobs` → copy đúng 3
giá trị vào `WORKDAY_TENANTS`.

### 11.5 `inserted = 0` dù `found > 0`

Classifier loại hết. Lấy một tiêu đề thật rồi soi điểm:

```bash
curl -s -X POST $API/api/v1/classify \
  -H 'Content-Type: application/json' \
  -d '{"title":"<tiêu đề thật>","description":"<mô tả>"}' | jq
```

- `scores` toàn 0 → thiếu keyword, bổ sung vào `packages/shared/src/keywords.ts`
- `discipline: OTHER` mà `scores` khá cao → hạ `CLASSIFIER_MIN_SCORE` xuống 4–5
- Bị `INDUSTRY_SIGNALS` chặn → mô tả quá ngắn, kiểm tra `enrich()` có lấy được `description` không

Sau khi sửa từ điển, phân loại lại toàn bộ DB:

```bash
curl -s -X POST $API/api/v1/classify/rebuild \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"limit":10000}' | jq '{processed, changed}'
```

### 11.6 Chromium crash / `Target closed` / service bị OOM

Render **không công bố và không cho chỉnh kích thước `/dev/shm`** (mặc định Docker là 64 MB).
Vì vậy cờ `--disable-dev-shm-usage` là **bắt buộc** — đã có sẵn trong `browser-pool.ts`.

Còn crash thì:

- Nâng `og-api` lên `1c-2g` (2 GB RAM) — 512 MB **không đủ** cho Chromium
- Giảm `SCRAPER_CONCURRENCY` xuống `1`
- Hoặc tắt hẳn nguồn Playwright (`slb`), chỉ dùng Workday/Cheerio → giữ được gói $7

### 11.7 Cron chạy lần đầu OK, lần sau không chạy

Run trước chưa thoát → Render hoãn run kế tiếp (nó đảm bảo tối đa 1 run hoạt động).
Mở Logs của cron: nếu deployment vẫn ở trạng thái *Running* sau khi log đã in xong kết quả,
tức là có handle bị treo. Cả hai script đã có cơ chế ép thoát sau 5 giây; nếu vẫn treo, kiểm
tra `app.close()` có bị kẹt ở `BrowserPool.onModuleDestroy` không.

### 11.8 Health check fail nhưng app vẫn chạy

Render coi là khoẻ khi nhận `2xx`/`3xx` **trong vòng 5 giây**. Endpoint `/api/v1/health` của ta
chạy một câu `SELECT 1` — nếu connection pool đang lạnh có thể vượt 5 giây.

- Deploy bị huỷ sau 15 phút không pass → xem Logs xem DB có kết nối được không
- Instance đang chạy fail liên tục 60 giây → Render **tự restart**
- Nếu DB hay chậm, có thể đổi `/health` thành chỉ trả `ok` không truy vấn DB
  (`apps/api/src/health/health.controller.ts`), nhưng khi đó mất khả năng phát hiện mất kết nối DB

### 11.9 Database free đã hết hạn

Render cảnh báo qua email trước khi hết 30 ngày và trước khi hết 14 ngày ân hạn. Sau ân hạn,
**dữ liệu bị xoá vĩnh viễn và không có backup**. Cách xử lý duy nhất: vào database → **Upgrade**
sang gói trả phí **trước khi** hết ân hạn.

---

## 12. Tuỳ chọn: đặt luôn frontend trên Render

Nếu muốn gom hết về một nơi, thêm service này vào `render.yaml`:

```yaml
  - type: web
    name: og-web
    runtime: docker
    region: singapore
    plan: 0.5c-512mb
    dockerfilePath: ./apps/web/Dockerfile
    dockerContext: .
    healthCheckPath: /
    autoDeployTrigger: commit
    buildFilter:
      paths: [apps/web/**, packages/shared/**, pnpm-lock.yaml]
    envVars:
      - key: NODE_ENV
        value: production
      - key: NEXT_PUBLIC_API_URL
        sync: false      # nhập URL của og-api khi tạo blueprint
```

Đánh đổi:

| | Vercel | Render |
|---|---|---|
| Chi phí | $0 (Hobby) | +$7/tháng |
| CDN edge toàn cầu | ✅ | ❌ (1 region) |
| ISR / cache tối ưu Next.js | ✅ | Hoạt động nhưng không có edge |
| Quản lý | 2 nền tảng | 1 nền tảng |
| Preview deployment mỗi PR | ✅ | Cần gói Pro |

Lưu ý: `NEXT_PUBLIC_*` nhúng lúc build, nên phải truyền qua `--build-arg` trong
`apps/web/Dockerfile` (file đã hỗ trợ sẵn `ARG NEXT_PUBLIC_API_URL`).

---

## 13. Chi phí ước tính

| Hạng mục | Cấu hình | $/tháng |
|---|---|---|
| `og-api` Web Service | `0.5c-512mb` (không Playwright) | 7 |
| `og-postgres` | `basic-256mb` compute | 6 |
| Dung lượng DB | 5 GB × $0.30/GB | 1.5 |
| `og-scrape` cron | ~10 phút/ngày, tính theo giây | ~1 (mức tối thiểu) |
| `og-maintenance` cron | ~10 giây/ngày | ~1 (mức tối thiểu) |
| Render workspace | Hobby | 0 |
| Vercel | Hobby | 0 |
| **Tổng** | | **~$16.5** |

Bật scraper Playwright (SLB) → `og-api` phải lên `1c-2g` = **$25**, tổng **~$34.5**.

Cách tiết kiệm:

- Chỉ dùng nguồn Workday JSON API + Cheerio → giữ gói $7, không cần Chromium
- Gộp 2 cron thành 1 (`node dist/scripts/scrape-cli.js && node dist/scripts/maintenance-cli.js`)
  → tiết kiệm $1 phí tối thiểu
- Giảm `SCRAPER_MAX_PAGES` để rút ngắn thời gian chạy cron (tính tiền theo giây)

---

## 14. Vận hành thường ngày

| Việc | Cách làm |
|---|---|
| Xem log API | Dashboard → og-api → Logs, hoặc `render logs -r og-api` |
| Xem log cron gần nhất | Dashboard → og-scrape → chọn run → Logs |
| Chạy cron ngay | og-scrape → **Trigger Run** |
| Trạng thái mọi nguồn | `curl -s $API/api/v1/scrape/sources \| jq '.[] \| {key, enabled, isRunning, lastRun}'` |
| Chạy lại 1 nguồn | `curl -X POST $API/api/v1/scrape/run -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"source":"slb","async":true}'` |
| Phân loại lại | `POST /api/v1/classify/rebuild {"limit":10000}` |
| Kết nối psql | og-postgres → **Connect** → copy **PSQL Command** |
| Rollback | og-api → Deploys → deploy cũ → **Rollback to this deploy** |
| Chạy lệnh một lần | og-api → **Shell** (gói trả phí) |

### Quy trình phát hành thay đổi

```bash
# 1. Test local
pnpm --filter @og/api eval        # classifier không được tụt
pnpm --filter @og/web build       # frontend build sạch

# 2. Commit → Render và Vercel tự deploy
git add . && git commit -m "fix(scraper): cập nhật selector rigzone" && git push

# 3. Theo dõi
curl -s $API/api/v1/health | jq -r .status
```

Đổi schema Prisma thì tạo migration trước khi push:

```bash
pnpm --filter @og/api exec prisma migrate dev --name <ten_thay_doi>
git add apps/api/prisma/migrations && git commit -m "db: <mo ta>"
```

Dockerfile KHÔNG chạy `prisma migrate deploy` lúc khởi động (chuỗi pooler + database ngủ = `P1002`, container chết trước khi API kịp chạy). Migration chạy qua GitHub Actions, nơi dùng chuỗi kết nối trực tiếp.
**Không bao giờ** dùng `prisma db push` hay `migrate reset` trên production.

> Nếu sau này nâng lên gói trả phí và muốn tách migration khỏi lúc khởi động, thêm
> `preDeployCommand` vào `og-api` trong `render.yaml` — Render chạy nó trên instance riêng
> sau build, trước khi start, và **huỷ deploy nếu thất bại** (service cũ vẫn phục vụ,
> không downtime). Tính năng này chỉ có trên gói trả phí và không áp dụng cho cron job.

### Sửa `render.yaml` sau này

Render tự đồng bộ khi bạn push. Hai lưu ý:

- Biến khai báo `sync: false` (`CORS_ORIGINS`) **bị bỏ qua** ở các lần cập nhật — sửa trong Dashboard.
- Bỏ `buildFilter` khỏi một service đang tồn tại sẽ **xoá** bộ lọc hiện có của nó.

---

## Nguồn tham khảo

- [Render · Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Render · Monorepo Support](https://render.com/docs/monorepo-support)
- [Render · Docker on Render](https://render.com/docs/docker)
- [Render · Cron Jobs](https://render.com/docs/cronjobs)
- [Render · Free Instance Types](https://render.com/docs/free)
- [Render · Health Checks](https://render.com/docs/health-checks)
- [Render · Pre-Deploy Command](https://render.com/docs/deploys)
- [Render · Connecting to Postgres](https://render.com/docs/postgresql-creating-connecting)
- [Render · Pricing](https://render.com/pricing)
- [Vercel · Using Monorepos](https://vercel.com/docs/monorepos)
