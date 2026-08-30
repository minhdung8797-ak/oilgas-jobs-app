# Đưa app lên internet — bản $0/tháng, từng bước

> Kết quả cuối: một đường link **https://…** bạn gửi cho ai cũng mở được, dữ liệu tự
> cập nhật mỗi sáng. Không tốn đồng nào.
>
> **Thời gian: 60–90 phút.** Không cần cài Node hay PostgreSQL trên máy —
> mọi thứ làm qua trình duyệt, trừ bước đẩy code lên GitHub.
>
> Mỗi bước có mục **✅ Kiểm chứng**. Chưa đạt thì dừng lại, xem
> [mục 9 — Xử lý lỗi](#9-xử-lý-lỗi-thường-gặp).

```
GitHub repo (public)
   │
   ├──► GitHub Actions   cron 03:15 UTC ──► scraper ──┐
   │    $0, không giới hạn phút với repo public       │
   │                                                  ▼
   ├──► Render (free)    API NestJS  ───────────►  Neon Postgres (free)
   │    512 MB · ngủ sau 15 phút                   0.5 GB · không hết hạn
   │                            ▲
   └──► Vercel (Hobby)   Next.js┘
        CDN edge · $0
```

| Bạn cần có | Ghi chú |
|---|---|
| Tài khoản **GitHub** | Dùng để đăng nhập cả 3 dịch vụ còn lại |
| **Git** trên máy | Tải tại https://git-scm.com nếu chưa có |
| ~90 phút | Phần lớn là chờ build |

---

## Bước 0 — Đẩy code lên GitHub (15 phút)

### 0.1 Cài Git (bỏ qua nếu đã có)

Kiểm tra trong PowerShell:

```powershell
git --version
```

Chưa có → tải **https://git-scm.com/download/win**, cài với toàn bộ tuỳ chọn mặc định,
rồi mở PowerShell **mới**.

Khai báo danh tính (chỉ làm một lần):

```powershell
git config --global user.name "Tên của bạn"
git config --global user.email "email@cua-ban.com"
```

### 0.2 Tạo repo trên GitHub

1. Vào **https://github.com/new**
2. **Repository name**: `oilgas-jobs`
3. Chọn **Public**

   > Public là **cố ý**: GitHub Actions chạy **miễn phí không giới hạn phút** với repo
   > public, còn repo private chỉ có 2.000 phút/tháng. Code này không chứa bí mật gì —
   > mọi mật khẩu đều nằm trong biến môi trường, không nằm trong code.

4. **Không tick** "Add a README file" (repo đã có sẵn)
5. **Create repository** → GitHub hiện trang hướng dẫn, giữ nguyên tab đó

### 0.3 Đẩy code lên

```powershell
cd "D:\Oil and Gas Job Hunting Web App"
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin https://github.com/<tên-github-của-bạn>/oilgas-jobs.git
git push -u origin main
```

Lần đầu `git push` sẽ mở cửa sổ đăng nhập GitHub — đăng nhập bằng trình duyệt.

### ✅ Kiểm chứng bước 0

```powershell
git ls-files | Measure-Object -Line     # khoảng 99 dòng
git ls-files | Select-String "\.env$"   # PHẢI KHÔNG có kết quả nào
```

> Câu lệnh thứ hai cực kỳ quan trọng: nếu nó in ra `.env` nghĩa là bạn vừa đẩy mật khẩu
> lên internet. `.gitignore` đã chặn sẵn, nhưng vẫn nên kiểm tra.

Mở `https://github.com/<bạn>/oilgas-jobs` — phải thấy đầy đủ thư mục `apps`, `packages`,
`docs`, và file `render.yaml`.

---

## Bước 1 — Chuẩn bị cấu hình cho bản free (10 phút)

Chỉ còn một việc bắt buộc, làm ngay trên máy rồi push lên.

### 1.1 Blueprint bản free — đã sẵn sàng, không phải làm gì

File `render.yaml` trong repo **đã là bản miễn phí**: `plan: free`, đúng 1 web service,
không có khối `databases:` (dùng Neon thay thế) và không có service `type: cron`
(GitHub Actions thay thế). Bản trả phí nằm ở `render.paid.yaml` — không đụng tới.

### 1.2 Scraper cần Chromium — đã tắt sẵn

> Gói free chỉ có 512 MB RAM, không đủ chạy Chromium. Nguồn `slb` đã để `enabled: false`
> sẵn trong code, không cần sửa gì. SLB vẫn được thu thập bình thường — nhưng do
> **GitHub Actions** chạy (máy ảo Actions có 7 GB RAM, thừa sức chạy Chromium),
> không phải do API chạy. Xem bước 6.

### 1.3 Sửa User-Agent

Mở `render.yaml`, tìm `SCRAPER_USER_AGENT`, đổi `example.com` và `contact@example.com`
thành domain + email thật của bạn. Làm tương tự trong `.github\workflows\scrape.yml`.

> Đây là phép lịch sự tối thiểu khi thu thập dữ liệu: chủ trang web nhìn log thấy bot của
> bạn thì biết liên hệ với ai. Bỏ qua bước này dễ bị chặn IP.

### 1.4 Đẩy thay đổi lên

```powershell
git add .
git commit -m "chore: cau hinh ban free"
git push
```

### ✅ Kiểm chứng bước 1

Trên GitHub, mở file `render.yaml` — nội dung phải bắt đầu bằng dòng
`#  Render Blueprint — BẢN MIỄN PHÍ ($0/tháng)`.

---

## Bước 2 — Tạo database trên Neon (10 phút)

Neon là PostgreSQL đám mây, gói free **không hết hạn** (khác Postgres free của Render
chỉ sống 30 ngày rồi xoá sạch dữ liệu).

1. Vào **https://neon.com** → **Sign up** → chọn **Continue with GitHub**
2. Sau khi đăng nhập, Neon tự đề nghị tạo project đầu tiên:
   - **Project name**: `oilgas-jobs`
   - **Postgres version**: `16`
   - **Region**: `Asia Pacific (Singapore)` — chọn gần bạn nhất
3. **Create project**

Neon hiện ngay hộp **Connection string**. Bấm biểu tượng copy. Chuỗi có dạng:

```
postgresql://neondb_owner:npg_xxxxx@ep-cool-name-12345-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

**Lưu lại hai phiên bản của chuỗi này** vào Notepad:

| Tên gọi | Cách lấy | Dùng ở đâu |
|---|---|---|
| **Chuỗi POOLER** | chuỗi vừa copy, có chữ `-pooler` | Render (bước 4) |
| **Chuỗi TRỰC TIẾP** | cũng chuỗi đó nhưng **xoá `-pooler`** đi | GitHub Actions (bước 6) |

Ví dụ: `ep-cool-name-12345-pooler.ap-southeast-1...` → `ep-cool-name-12345.ap-southeast-1...`

> Vì sao cần hai chuỗi: bản pooler gom nhiều kết nối lại làm một, hợp với API chạy trên
> gói 512 MB. Nhưng Prisma khi **tạo bảng** (migrate) cần kết nối trực tiếp, đi qua
> pooler sẽ lỗi.

### ✅ Kiểm chứng bước 2

Trong Neon: **SQL Editor** (menu trái) → gõ `SELECT version();` → **Run**.
Phải in ra `PostgreSQL 16...`

---

## Bước 3 — Tạo bảng + nạp dữ liệu (5 phút, tự động)

Không cần copy-paste SQL. GitHub Actions làm hết: tạo bảng, chạy migration, nạp
49 quốc gia / 38 công ty / 32 kỹ năng / 47 tỉ giá.

### 3.1 Khai báo chuỗi kết nối cho Actions

1. Vào `https://github.com/<bạn>/<repo>/settings/secrets/actions`
2. **New repository secret**
   - **Name**: `DATABASE_URL`
   - **Secret**: **Chuỗi TRỰC TIẾP** của Neon — bản **KHÔNG có** `-pooler`
3. **Add secret**

> Dùng nhầm chuỗi pooler ở đây sẽ làm bước `prisma migrate deploy` lỗi —
> Prisma cần kết nối trực tiếp để tạo bảng.

### 3.2 Chạy lần đầu

1. Repo → tab **Actions** → nếu có banner vàng thì bấm
   **I understand my workflows, go ahead and enable them**
2. Menu trái → **Scrape jobs** → **Run workflow**
   - tick ✅ **setup_only** (chỉ tạo bảng + nạp dữ liệu nền, chưa thu thập job)
3. **Run workflow** → chờ ~3 phút

### ✅ Kiểm chứng bước 3

Trong Neon → **SQL Editor**, chạy:

```sql
SELECT 'countries' AS bang, COUNT(*) AS so_dong FROM countries
UNION ALL SELECT 'companies', COUNT(*) FROM companies
UNION ALL SELECT 'skills',    COUNT(*) FROM skills
UNION ALL SELECT 'fx_rates',  COUNT(*) FROM fx_rates;
```

Kết quả phải là: countries **49**, companies **38**, skills **32**, fx_rates **47**.

> Nếu Actions báo lỗi ở bước *Đồng bộ schema database* → xem [9.6](#96-github-actions-fail).
> Cách thủ công (dán 3 file SQL vào Neon SQL Editor) vẫn dùng được, xem
> `apps/api/prisma/migrations/` và `apps/api/prisma/seed.sql`.

---

## Bước 4 — Dựng API trên Render (20 phút)

1. Vào **https://dashboard.render.com** → **Get Started for Free** → **GitHub**
2. Cho phép Render truy cập repo `oilgas-jobs`
3. Trong Dashboard: **New +** → **Blueprint**
4. Chọn repo `oilgas-jobs` → Render tự tìm thấy `render.yaml`
5. **Blueprint Name**: `oilgas-jobs`
6. Render hiện form hỏi 2 giá trị:

   | Biến | Nhập gì |
   |---|---|
   | `DATABASE_URL` | **Chuỗi POOLER** của Neon (có `-pooler`) |
   | `CORS_ORIGINS` | Tạm nhập `*` — bước 7 sẽ siết lại |

7. **Apply**

Render bắt đầu build. **Lần đầu mất 8–15 phút** vì phải tải image Playwright (~2 GB).
Bấm vào service `og-api` → tab **Logs** để theo dõi.

Khi thành công, cuối log có:

```
Applying migration `20250101000000_init`
Applying migration `20250101000100_search_vector`
[Nest] LOG [Bootstrap] API sẵn sàng tại http://localhost:10000/api/v1
==> Your service is live 🎉
```

(Hai dòng migration sẽ báo "already applied" vì bạn đã chạy tay ở bước 3 — đúng như mong đợi.)

### 4.1 Lấy 2 thứ quan trọng

**URL của API** — ở đầu trang service, dạng `https://og-api-xxxx.onrender.com`. Lưu lại.

**ADMIN_API_KEY** — Dashboard → `og-api` → tab **Environment** → tìm dòng `ADMIN_API_KEY`
→ bấm icon con mắt để hiện → copy. Đây là khoá để gọi các API quản trị, **đừng chia sẻ**.

### ✅ Kiểm chứng bước 4

Mở trình duyệt vào `https://og-api-xxxx.onrender.com/api/v1/health`

Phải thấy:

```json
{"status":"ok","uptimeSec":42,"db":"up","dbLatencyMs":8,"version":"1.0.0","timestamp":"..."}
```

- `"db":"up"` → API nối được Neon ✓
- `"db":"down"` → sai `DATABASE_URL`, xem [9.2](#92-dbdown)
- Không mở được → xem [9.1](#91-deploy-fail)

Thử tiếp: `https://og-api-xxxx.onrender.com/api/v1/countries` → phải ra mảng JSON 49 quốc gia.

Và `https://og-api-xxxx.onrender.com/api/v1/docs` → giao diện **Swagger**, nơi bạn bấm thử
mọi API ngay trên trình duyệt.

---

## Bước 5 — Dựng giao diện web trên Vercel (15 phút)

1. Vào **https://vercel.com/signup** → **Continue with GitHub**
2. **Add New…** → **Project** → chọn repo `oilgas-jobs` → **Import**
3. Cấu hình — **phần này phải đúng từng ô**:

   | Ô | Giá trị |
   |---|---|
   | **Framework Preset** | Next.js (Vercel tự nhận) |
   | **Root Directory** | bấm **Edit** → chọn `apps/web` |
   | **Include files outside the Root Directory** | ✅ **BẬT** |

   > Ô cuối cùng bắt buộc phải bật. Frontend dùng chung package `@og/shared` nằm ngoài
   > `apps/web`; không bật thì build lỗi `Module not found: @og/shared`.

4. **Build and Output Settings**: không cần chỉnh gì — file `apps/web/vercel.json`
   đã khai báo sẵn và **được ưu tiên hơn** cài đặt trên giao diện:

   ```json
   {
     "installCommand": "cd ../.. && pnpm install --no-frozen-lockfile --prod=false",
     "buildCommand":   "cd ../.. && pnpm --filter @og/shared build && pnpm --filter @og/web build",
     "outputDirectory": ".next"
   }
   ```

   > Cờ `--prod=false` là bắt buộc. Vercel đặt `NODE_ENV=production` khi cài, khiến pnpm
   > **bỏ qua toàn bộ devDependencies** → build `@og/shared` chết với
   > `sh: line 1: tsc: command not found`. Vì lý do tương tự, `typescript` và `@types/node`
   > của `@og/shared` đã được chuyển sang `dependencies`.

5. Mở rộng **Environment Variables**, thêm 2 biến:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://og-api-xxxx.onrender.com/api/v1` ← URL Render + `/api/v1` |
   | `NEXT_PUBLIC_SITE_NAME` | `OilGas Jobs Radar` |

   > Nhớ **có** hậu tố `/api/v1`. Thiếu là frontend gọi sai địa chỉ.

6. **Deploy** → chờ 2–4 phút

### ✅ Kiểm chứng bước 5

Vercel hiện màn hình chúc mừng kèm link `https://oilgas-jobs-xxxx.vercel.app`. Mở lên.

**Lần đầu có thể mất tới 1 phút** — API trên Render đang ngủ, phải chờ nó thức dậy.
Đây là hành vi bình thường của gói free, không phải lỗi.

Bạn phải thấy: banner xanh, 4 ô thống kê theo nhóm ngành, ô tìm kiếm, sidebar bộ lọc.
Danh sách job lúc này **đang trống** — đúng, vì chưa chạy scraper. Sang bước 6.

Nếu hiện *"Không kết nối được tới API"* → xem [9.3](#93-web-hiện-không-kết-nối-được-tới-api).

---

## Bước 6 — Bật thu thập tự động bằng GitHub Actions (10 phút)

Đây là thứ thay cho cron trả phí. Repo public → **miễn phí không giới hạn**.

### 6.1 Chạy thu thập job thật

Secret `DATABASE_URL` đã khai báo ở bước 3, giờ chỉ cần chạy:

1. Tab **Actions** → **Scrape jobs** → **Run workflow**
   - **source**: để trống (chạy tất cả nguồn đang bật)
   - **with_playwright**: tick ✅ nếu muốn lấy cả nguồn SLB
   - **setup_only**: **bỏ tick**
2. **Run workflow** → chờ 5–10 phút

Bấm vào lần chạy đang diễn ra để xem log trực tiếp. Bước **Thu thập job** phải in ra bảng:

```
┌─────────┬───────────────┬───────────┬───────┬──────────┬─────────┬─────────┬────────┬─────────┐
│ (index) │ source        │ status    │ found │ inserted │ updated │ skipped │ failed │ seconds │
├─────────┼───────────────┼───────────┼───────┼──────────┼─────────┼─────────┼────────┼─────────┤
│ 0       │ 'bakerhughes' │ 'SUCCESS' │ 84    │ 71       │ 0       │ 13      │ 0      │ 96      │
│ 1       │ 'chevron'     │ 'SUCCESS' │ 52    │ 44       │ 0       │ 8       │ 0      │ 61      │
└─────────┴───────────────┴───────────┴───────┴──────────┴─────────┴─────────┴────────┴─────────┘
```

Cách đọc:

| Cột | Nghĩa |
|---|---|
| `found` | Số job lấy được từ nguồn |
| `inserted` | Job **mới**, đã qua phân loại NLP và lưu vào DB |
| `skipped` | Job cũ không đổi gì → chỉ cập nhật ngày thấy lần cuối |
| `failed` | Lỗi ghi DB |

`found = 0` → nguồn đổi giao diện, xem [9.4](#94-scrape-ra-found--0).
`found > 0` mà `inserted = 0` → xem [9.5](#95-inserted--0).

### 6.3 Lịch tự động

Workflow đã đặt sẵn `cron: '15 3 * * *'` = **03:15 UTC = 10:15 sáng giờ Việt Nam**, mỗi ngày.
Không phải làm gì thêm.

> ⚠️ **Một điều cần nhớ:** với repo public, GitHub **tự tắt lịch cron sau 60 ngày** nếu
> repo không có hoạt động nào. Nếu một ngày thấy dữ liệu ngừng cập nhật, vào tab Actions
> bấm **Enable workflow** là xong.

### ✅ Kiểm chứng bước 6

Tải lại trang web Vercel của bạn → **job đã hiện ra**. Thử:

1. Gõ `reservoir` vào ô tìm kiếm → danh sách lọc lại
2. Bấm một ô trong sidebar → URL đổi thành `?discipline=RESERVOIR`
3. Bấm vào một job → mở trang chi tiết, có nút "Ứng tuyển tại nguồn"

---

## Bước 7 — Khoá bảo mật (5 phút) ⚠️ Bắt buộc

Hiện `CORS_ORIGINS` đang là `*` — nghĩa là **bất kỳ website nào** cũng gọi được API của bạn.
Giờ đã biết domain Vercel thật, siết lại:

1. Render Dashboard → **og-api** → tab **Environment**
2. Sửa `CORS_ORIGINS` thành `https://oilgas-jobs-xxxx.vercel.app` (domain Vercel thật của bạn)
3. **Save, rebuild, and deploy** → chờ ~3 phút

### ✅ Kiểm chứng bước 7

Mở lại web Vercel → vẫn chạy bình thường ✓

Kiểm tra API đã chặn domain lạ (dán vào PowerShell):

```powershell
curl.exe -s -I -H "Origin: https://evil.example.com" "https://og-api-xxxx.onrender.com/api/v1/jobs" | Select-String "access-control-allow-origin"
```

Kỳ vọng: **không in ra gì cả**. Nếu vẫn in ra dòng nào → `CORS_ORIGINS` chưa được lưu.

Kiểm tra endpoint quản trị đã khoá:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" -X POST "https://og-api-xxxx.onrender.com/api/v1/scrape/run" -d "{}"
```

Kỳ vọng: `401`.

---

## Bước 8 — Chia sẻ 🎉

Link để gửi cho bạn bè:

```
https://oilgas-jobs-xxxx.vercel.app
```

Ba điều nên nói trước với họ:

1. **Lần mở đầu tiên trong ngày có thể chờ ~1 phút** — API đang ngủ, đây là đánh đổi của
   gói miễn phí. Mở lần thứ hai là nhanh ngay.
2. **Link có bộ lọc chia sẻ được.** Lọc xong copy URL gửi đi, người nhận mở ra thấy đúng
   bộ lọc đó — ví dụ `?discipline=RESERVOIR&country=AE`.
3. **Luôn ứng tuyển ở trang gốc.** Nút "Ứng tuyển tại nguồn" dẫn thẳng tới trang tuyển
   dụng chính thức của công ty.

### Muốn dùng domain riêng (tuỳ chọn)

- **Vercel**: Project → Settings → Domains → thêm `jobs.tencuaban.com` → khai báo CNAME
  theo hướng dẫn. SSL tự động, miễn phí.
- Sau đó nhớ quay lại Render sửa `CORS_ORIGINS` thành domain mới.

### Khi nào nên bắt đầu trả tiền

| Dấu hiệu | Nâng cấp | Giá |
|---|---|---|
| Bạn bè phàn nàn "mở phải chờ cả phút" | Render `0.5c-512mb` — không bao giờ ngủ | +$7/tháng |
| Muốn bật SLB chạy trực tiếp trên API | Render `1c-2g` — đủ RAM cho Chromium | +$25/tháng |
| DB gần đầy 0.5 GB | Neon Launch | +$5/tháng |
| App có doanh thu/quảng cáo | Vercel Pro (bắt buộc theo ToS) | +$20/tháng |

Khoản đáng chi nhất và rẻ nhất là **$7 cho Render** — xoá bỏ hoàn toàn cảnh chờ 1 phút,
vốn là thứ khiến người ta đóng tab.

---

## 9. Xử lý lỗi thường gặp

### 9.1 Deploy fail

Render → `og-api` → **Logs**, tìm dòng đỏ đầu tiên:

| Trong log | Nguyên nhân | Sửa |
|---|---|---|
| `no open ports detected` | Có ai đó thêm biến `API_PORT` | Xoá biến `API_PORT` trong Environment |
| `COPY packages/shared: not found` | `rootDir` bị đặt sai | `render.yaml` **không được** có dòng `rootDir` |
| `Dockerfile not found` | Sai `dockerfilePath` | Phải là `./apps/api/Dockerfile` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Lockfile lệch | Chạy `pnpm install` ở máy rồi commit `pnpm-lock.yaml` |
| Build treo > 20 phút | Bình thường ở lần đầu | Chờ thêm; lần sau nhanh hơn nhờ cache |

### 9.2 `"db":"down"`

- `DATABASE_URL` trên Render phải là **chuỗi POOLER** của Neon và **có** `?sslmode=require`
- Vào Neon → **SQL Editor** chạy `SELECT 1;` xem database còn sống không
- Neon ngủ sau 5 phút rảnh — lần gọi đầu chậm ~1 giây rồi tự thức, không phải lỗi
- Sửa xong biến phải bấm **Save, rebuild, and deploy**

### 9.3 Web hiện "Không kết nối được tới API"

Theo thứ tự:

1. Mở thẳng `https://og-api-xxxx.onrender.com/api/v1/health` — nếu cũng lỗi thì vấn đề ở
   API, xem 9.1/9.2
2. Vercel → Settings → Environment Variables → `NEXT_PUBLIC_API_URL` phải **có đuôi `/api/v1`**
3. Sửa xong biến trên Vercel phải **Redeploy** (Deployments → dấu `…` → Redeploy).
   Chỉ restart là **không đủ** — biến `NEXT_PUBLIC_*` được nhúng vào lúc build.
4. Render → `CORS_ORIGINS` phải chứa đúng domain Vercel, có `https://`, **không** có dấu `/` ở cuối
5. Chờ 1 phút rồi tải lại — có thể API đang thức dậy

### 9.4 Scrape ra `found = 0`

Scraper chạy được nhưng không lấy được job nào — hầu như luôn do trang tuyển dụng đổi
cấu trúc HTML.

Với nguồn **Workday** (`bakerhughes`, `chevron`, `oxy`, `bp`, `shell`…) thường là sai tenant:

1. Mở trang careers của công ty đó trên trình duyệt
2. Bấm **F12** → tab **Network** → gõ `jobs` vào ô lọc
3. Tìm request tới `/wday/cxs/<tenant>/<site>/jobs`
4. Copy đúng 3 giá trị `host` / `tenant` / `site` vào `WORKDAY_TENANTS` trong
   `apps/api/src/scraper/sources/workday.scraper.ts`
5. Commit → push → chạy lại workflow

Với nguồn HTML/SAP SuccessFactors (`harbourenergy`, `tullow`): F12 → tab **Elements**, tìm selector thật
của thẻ job rồi sửa hằng số `SELECTORS` ở đầu file scraper tương ứng.

### 9.5 `inserted = 0`

Bộ phân loại NLP đã loại hết. Kiểm tra bằng Swagger:
`https://og-api-xxxx.onrender.com/api/v1/docs` → mục `classify` → **POST /classify** →
**Try it out** → dán:

```json
{ "title": "Senior Reservoir Engineer", "description": "history matching eclipse stoiip oil and gas" }
```

Kết quả phải là `"discipline": "RESERVOIR"` với `confidence` ~0.9.

Nếu ra `OTHER`: thiếu từ khoá → bổ sung vào `packages/shared/src/keywords.ts`, hoặc hạ
`CLASSIFIER_MIN_SCORE` trên Render xuống `4`. Chi tiết: [NLP.md](NLP.md).

### 9.6 GitHub Actions fail

Vào lần chạy bị lỗi, đọc bước nào có dấu ❌:

| Bước lỗi | Nguyên nhân | Sửa |
|---|---|---|
| *Kiểm tra đã có DATABASE_URL* | Chưa tạo secret | Bước 6.1 |
| *Đồng bộ schema database* | Dùng nhầm chuỗi pooler | Đổi secret sang chuỗi **không có** `-pooler` |
| *Cài dependencies* | Lockfile lệch | `pnpm install` ở máy rồi commit lockfile |
| *Thu thập job* + `Timeout` | Nguồn phản hồi chậm | Giảm `SCRAPER_MAX_PAGES` trong workflow |

### 9.7 Trang web rất chậm ở lần mở đầu

Đúng như thiết kế của gói free: Render tắt service sau **15 phút** không có traffic, khởi
động lại mất **~1 phút**.

Cách giảm nhẹ (chọn 1):

- **Chấp nhận** — hợp lý nếu chỉ vài người dùng
- **Dựng uptime monitor** (UptimeRobot miễn phí) ping `/api/v1/health` mỗi 10 phút để giữ
  service luôn thức — nhưng sẽ đốt hết 750 giờ free/tháng
- **Trả $7/tháng** cho gói `0.5c-512mb` — hết ngủ hẳn

### 9.8 Muốn làm lại từ đầu

- **Database**: Neon → SQL Editor → `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
  → chạy lại bước 3
- **API**: Render → `og-api` → Settings → **Delete Service** → tạo lại Blueprint
- **Web**: Vercel → Project → Settings → **Delete Project** → import lại

---

## 10. Vận hành sau khi lên sóng

| Việc | Cách làm |
|---|---|
| Xem log API | Render → og-api → **Logs** |
| Xem lần scrape gần nhất | GitHub → tab **Actions** → chọn lần chạy |
| Chạy scrape ngay | Actions → Scrape jobs → **Run workflow** |
| Xem dữ liệu trong DB | Neon → **SQL Editor** hoặc **Tables** |
| Thử API | `https://og-api-xxxx.onrender.com/api/v1/docs` |
| Kiểm tra sức khoẻ | `/api/v1/health` và `/api/v1/scrape/runs?limit=10` |
| Chất lượng phân loại | `/api/v1/classify/stats` — `avgConfidence` nên > 0.6 |

**Sửa code rồi phát hành:**

```powershell
cd "D:\Oil and Gas Job Hunting Web App"
git add .
git commit -m "mo ta thay doi"
git push
```

Render và Vercel **tự động deploy** khi thấy commit mới. Không cần làm gì thêm.

**Nên kiểm tra mỗi tháng một lần:**

```
https://og-api-xxxx.onrender.com/api/v1/scrape/runs?limit=20
```

Nguồn nào có `found = 0` liên tục là đã hỏng, xem [9.4](#94-scrape-ra-found--0).

---

## Nguồn tham khảo

- [Render · Free Instance Types](https://render.com/docs/free) — ngủ sau 15 phút, 750 giờ/tháng
- [Render · Blueprint Spec](https://render.com/docs/blueprint-spec)
- [Neon · Pricing](https://neon.com/pricing) — Free 0.5 GB, không hết hạn
- [GitHub · Billing for Actions](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions) — repo public miễn phí
- [Vercel · Monorepos](https://vercel.com/docs/monorepos)
- [Vercel · Hobby Plan](https://vercel.com/docs/plans/hobby) — cá nhân, phi thương mại
