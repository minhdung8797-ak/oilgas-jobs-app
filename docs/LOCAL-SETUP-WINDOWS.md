# Chạy app trên máy Windows — từ con số 0

> Dành cho máy **chưa cài gì cả**. Làm tuần tự, mỗi bước có mục **✅ Kiểm chứng** —
> chưa đạt thì dừng lại, xem [Phần 6 — Xử lý lỗi](#6-xử-lý-lỗi-thường-gặp).
>
> Có **2 đường**, chọn 1:
>
> | | **Đường A — Docker** | **Đường B — Node + PostgreSQL** |
> |---|---|---|
> | Số phần mềm phải cài | **1** (Docker Desktop) | 3 (Node, pnpm, PostgreSQL) |
> | Thời gian lần đầu | 30–45 phút (tải ~3 GB) | 25–35 phút |
> | Sửa code thấy ngay | ❌ phải build lại | ✅ hot reload |
> | Dung lượng đĩa | ~8 GB | ~2 GB |
> | Hợp với | Chỉ muốn **xem app chạy** | Muốn **sửa code, phát triển tiếp** |
>
> **Gợi ý:** làm **Đường A** trước để thấy app hoạt động, sau đó nếu muốn code tiếp thì làm Đường B.
> Hai đường không xung đột nhau, cài cả hai cũng được.

---

# ĐƯỜNG A — Chạy bằng Docker (khuyên dùng cho lần đầu)

## A1. Cài Docker Desktop (15–25 phút)

Docker chạy sẵn PostgreSQL + API + Web trong các "hộp" riêng, bạn không phải cài Node,
pnpm hay PostgreSQL lên máy.

### A1.1 Kiểm tra máy có đủ điều kiện

Mở **PowerShell** (bấm phím Windows → gõ `powershell` → Enter) và chạy:

```powershell
# Phiên bản Windows — cần Windows 10 build 19044+ hoặc Windows 11
winver
```

Yêu cầu: Windows 10/11 **64-bit**, RAM **≥ 8 GB**, còn trống **≥ 10 GB** ổ C.

### A1.2 Bật WSL 2

Docker trên Windows cần WSL 2. Mở PowerShell **bằng quyền Administrator**
(chuột phải vào PowerShell → *Run as administrator*):

```powershell
wsl --install
```

Nếu báo *"WSL đã được cài"* thì chỉ cần cập nhật:

```powershell
wsl --update
```

**Khởi động lại máy** sau bước này.

### A1.3 Tải và cài Docker Desktop

1. Tải tại **https://www.docker.com/products/docker-desktop/** → *Download for Windows (AMD64)*
2. Chạy file `Docker Desktop Installer.exe`
3. Trong lúc cài, giữ nguyên tick **"Use WSL 2 instead of Hyper-V"**
4. Cài xong → khởi động lại máy → mở **Docker Desktop** từ Start Menu
5. Chờ biểu tượng con cá voi ở góc dưới phải chuyển sang **xanh / Running**
   (lần đầu mất 1–3 phút)

> Docker Desktop miễn phí cho cá nhân và công ty nhỏ. Nó có thể hỏi đăng nhập —
> bạn **bấm Skip / Continue without signing in** cũng dùng được bình thường.

### ✅ Kiểm chứng A1

Mở PowerShell mới:

```powershell
docker --version
docker compose version
docker run --rm hello-world
```

Kỳ vọng: hai lệnh đầu in ra số phiên bản, lệnh thứ ba in *"Hello from Docker!"*.

Nếu báo `docker: command not found` hoặc *"Cannot connect to the Docker daemon"* →
xem [6.1](#61-docker-command-not-found--cannot-connect-to-the-docker-daemon).

---

## A2. Tạo file cấu hình (2 phút)

Mở PowerShell, vào thư mục dự án:

```powershell
cd "D:\Oil and Gas Job Hunting Web App"
Copy-Item .env.example .env
```

Mở file `.env` bằng Notepad để xem qua (chạy local thì **không cần sửa gì**):

```powershell
notepad .env
```

Các giá trị mặc định đã dùng được ngay cho máy local. Chỉ khi lên production mới phải đổi
`ADMIN_API_KEY` và `CORS_ORIGINS`.

### ✅ Kiểm chứng A2

```powershell
Test-Path .env          # phải in ra True
```

---

## A3. Khởi động toàn bộ hệ thống (10–20 phút lần đầu)

```powershell
cd "D:\Oil and Gas Job Hunting Web App"
docker compose up -d --build
```

**Lần đầu sẽ lâu**: Docker phải tải image Playwright (~2 GB, đã kèm sẵn trình duyệt Chromium),
image Node, image PostgreSQL, rồi build code. Cứ để đó, đừng đóng cửa sổ.

Bạn sẽ thấy log chạy liên tục. Khi xong, dòng cuối in ra:

```
[+] Running 4/4
 ✔ Network oil-and-gas-job-hunting-web-app_default  Created
 ✔ Container og_postgres                            Healthy
 ✔ Container og_api                                 Started
 ✔ Container og_web                                 Started
```

Xem trạng thái:

```powershell
docker compose ps
```

Cả 3 container phải ở trạng thái `running`. Riêng `og_postgres` phải là `running (healthy)`.

### ✅ Kiểm chứng A3

```powershell
# API còn sống chưa? (chờ ~30 giây sau khi các container Started)
curl.exe http://localhost:4000/api/v1/health
```

Kỳ vọng in ra:

```json
{"status":"ok","uptimeSec":25,"db":"up","dbLatencyMs":3,"version":"1.0.0","timestamp":"..."}
```

`"db":"down"` hoặc không có phản hồi → [6.2](#62-api-không-lên--dbdown).

> **Lưu ý dùng `curl.exe` chứ không phải `curl`** trên PowerShell. Trong PowerShell,
> `curl` là bí danh của `Invoke-WebRequest` với cú pháp hoàn toàn khác. Thêm `.exe`
> để gọi đúng curl thật (Windows 10/11 có sẵn).

---

## A4. Nạp dữ liệu nền (1 phút)

Database vừa tạo đang trống rỗng. Nạp 49 quốc gia, 38 công ty, 32 kỹ năng, bảng tỉ giá:

```powershell
docker compose exec api node dist/scripts/seed.js
```

Kỳ vọng:

```
Seeding…
✓ countries: 49
✓ companies: 38
✓ skills: 32
✓ fx_rates: 47
Done.
```

### ✅ Kiểm chứng A4

```powershell
curl.exe http://localhost:4000/api/v1/countries
```

Phải in ra một mảng JSON dài với `{"code":"US","name":"United States",...}`.

---

## A5. Thu thập job thật (3–5 phút)

Bây giờ mới có dữ liệu job. Chạy scraper cho **một nguồn** trước
(Baker Hughes — dùng JSON API, ổn định nhất, không cần trình duyệt):

```powershell
docker compose exec api node dist/scripts/scrape-cli.js bakerhughes
```

Kết quả dạng bảng:

```
┌─────────┬───────────────┬───────────┬───────┬──────────┬─────────┬─────────┬────────┬─────────┐
│ (index) │ source        │ status    │ found │ inserted │ updated │ skipped │ failed │ seconds │
├─────────┼───────────────┼───────────┼───────┼──────────┼─────────┼─────────┼────────┼─────────┤
│ 0       │ 'bakerhughes' │ 'SUCCESS' │ 84    │ 71       │ 0       │ 13      │ 0      │ 96      │
└─────────┴───────────────┴───────────┴───────┴──────────┴─────────┴─────────┴────────┴─────────┘
```

Cách đọc:

| Cột | Ý nghĩa |
|---|---|
| `found` | Số job lấy được từ nguồn |
| `inserted` | Số job **mới** lưu vào DB (đã qua phân loại NLP) |
| `updated` | Job cũ có nội dung thay đổi |
| `skipped` | Job không đổi gì → chỉ cập nhật ngày thấy lần cuối |
| `failed` | Lỗi khi ghi DB |

`found = 0` → nguồn đã đổi giao diện, xem [6.4](#64-scrape-ra-found--0).
`found > 0` nhưng `inserted = 0` → xem [6.5](#65-inserted--0-dù-found--0).

Xem toàn bộ nguồn có sẵn:

```powershell
docker compose exec api node dist/scripts/scrape-cli.js --list
```

### ✅ Kiểm chứng A5

```powershell
curl.exe "http://localhost:4000/api/v1/jobs?pageSize=2"
```

Phải thấy `"total": <số lớn hơn 0>` và mảng `data` có job thật.

---

## A6. Mở app 🎉

Mở trình duyệt vào **http://localhost:3000**

Bạn sẽ thấy:

- Banner xanh với tổng số vị trí đang mở
- 4 ô thống kê theo nhóm ngành: Reservoir / Petroleum / Production / G&F
- Ô tìm kiếm + sắp xếp
- Sidebar bộ lọc bên trái (nhóm ngành, quốc gia, công ty, lương…)
- Danh sách job bên phải

Thử ngay các thao tác này để chắc chắn mọi thứ chạy:

1. Gõ `reservoir` vào ô tìm kiếm → danh sách lọc lại sau ~0.5 giây
2. Bấm 1 ô trong sidebar → URL đổi thành `?discipline=RESERVOIR`, số job giảm
3. Bấm vào tiêu đề 1 job → mở trang chi tiết, có nút "Ứng tuyển tại nguồn"
4. Copy URL đang lọc → dán sang tab mới → **vẫn giữ nguyên bộ lọc**
   (toàn bộ trạng thái lọc nằm trong URL, chia sẻ link được)

**Các địa chỉ khác:**

| Địa chỉ | Là gì |
|---|---|
| http://localhost:3000 | Giao diện web |
| http://localhost:4000/api/v1/docs | **Swagger** — thử mọi API ngay trên trình duyệt |
| http://localhost:4000/api/v1/health | Kiểm tra sức khỏe hệ thống |
| http://localhost:4000/api/v1/classify/stats | Chất lượng phân loại NLP |

> Nếu trang web hiện *"Không kết nối được tới API"* → [6.3](#63-web-hiện-không-kết-nối-được-tới-api).

---

## A7. Các lệnh dùng hằng ngày

```powershell
cd "D:\Oil and Gas Job Hunting Web App"

# Xem log (Ctrl+C để thoát, container vẫn chạy)
docker compose logs -f api
docker compose logs -f web

# Tắt (dữ liệu trong DB vẫn còn)
docker compose stop

# Bật lại (nhanh, không build lại)
docker compose start

# Sau khi sửa code -> build lại
docker compose up -d --build

# Xóa sạch mọi thứ KỂ CẢ DỮ LIỆU (làm lại từ đầu)
docker compose down -v
```

**Thử phân loại NLP mà không cần DB** — rất hữu ích khi tinh chỉnh từ khóa:

```powershell
docker compose exec api node dist/scripts/classifier-eval.js
```

Phải ra `Độ chính xác: 13/13 = 100%`.

---
---

# ĐƯỜNG B — Chạy trực tiếp bằng Node (để phát triển tiếp)

Đường này cho phép sửa code và thấy kết quả ngay (hot reload), phù hợp khi bạn muốn
tùy biến giao diện hoặc thêm nguồn scraper.

## B1. Cài Node.js 20 (5 phút)

1. Vào **https://nodejs.org** → tải bản **LTS** (20.x hoặc 22.x)
2. Chạy file `.msi`, bấm Next hết, **giữ nguyên** tick *"Add to PATH"*
3. Đóng hết cửa sổ PowerShell đang mở, mở lại cái mới

### ✅ Kiểm chứng B1

```powershell
node -v      # v20.x.x trở lên
npm -v
```

## B2. Bật pnpm (1 phút)

Dự án dùng **pnpm** (trình quản lý gói tiết kiệm ổ đĩa, bắt buộc cho monorepo này).
Node 20+ đã kèm sẵn `corepack`, chỉ cần bật:

```powershell
corepack enable
corepack prepare pnpm@9.12.0 --activate
```

Nếu `corepack enable` báo lỗi quyền → mở PowerShell **Administrator** rồi chạy lại.
Không được nữa thì cài trực tiếp:

```powershell
npm install -g pnpm@9.12.0
```

### ✅ Kiểm chứng B2

```powershell
pnpm -v      # 9.12.0
```

## B3. Cài PostgreSQL 16 (10 phút)

1. Vào **https://www.postgresql.org/download/windows/** → *Download the installer*
2. Chọn phiên bản **16.x**, tải về, chạy
3. Trong lúc cài, chú ý 3 màn hình:
   - **Components**: bỏ tick *Stack Builder* (không cần)
   - **Password**: đặt mật khẩu cho user `postgres` — **ghi lại**, ví dụ `postgres`
   - **Port**: giữ nguyên **5432**
4. Cài xong không cần mở Stack Builder

Tạo database cho dự án. Mở **SQL Shell (psql)** từ Start Menu, bấm Enter 4 lần để nhận
giá trị mặc định, nhập mật khẩu vừa đặt, rồi gõ:

```sql
CREATE USER ogjobs WITH PASSWORD 'ogjobs_password';
CREATE DATABASE ogjobs OWNER ogjobs;
\q
```

### ✅ Kiểm chứng B3

```powershell
psql -U ogjobs -d ogjobs -h localhost -c "SELECT version();"
```

Nhập mật khẩu `ogjobs_password` → phải in ra `PostgreSQL 16.x ...`

Nếu `psql` không nhận diện được → PostgreSQL chưa vào PATH, xem [6.6](#66-psql-không-phải-là-lệnh-hợp-lệ).

## B4. Cài thư viện của dự án (5 phút)

```powershell
cd "D:\Oil and Gas Job Hunting Web App"
Copy-Item .env.example .env -Force
Copy-Item apps\web\.env.example apps\web\.env.local -Force
pnpm install
```

> Cần **hai** file `.env`: backend đọc `.env` ở thư mục gốc, còn Next.js chỉ đọc
> file nằm trong `apps/web/`. Đây là quy định của Next.js, không phải lỗi cấu hình.

`pnpm install` tải khoảng 950 gói, lần đầu mất 2–5 phút.

Kiểm tra `.env` có đúng chuỗi kết nối DB không:

```powershell
notepad .env
```

Dòng `DATABASE_URL` phải là:

```
DATABASE_URL="postgresql://ogjobs:ogjobs_password@localhost:5432/ogjobs?schema=public&connection_limit=10&pool_timeout=20"
```

(khớp user/password/database bạn tạo ở B3)

### ✅ Kiểm chứng B4

```powershell
pnpm -v
Test-Path node_modules      # True
```

## B5. Tạo bảng trong database (2 phút)

```powershell
pnpm db:generate      # sinh Prisma Client từ schema
pnpm db:migrate       # tạo toàn bộ bảng, index, trigger
pnpm db:seed          # nạp countries / companies / skills / tỉ giá
```

`pnpm db:migrate` áp dụng sẵn 2 file migration có trong repo. Nó chỉ hỏi tên migration mới
khi bạn tự sửa `schema.prisma` — lúc đó cứ bấm **Enter** để nhận mặc định.

### ✅ Kiểm chứng B5

```powershell
pnpm db:studio
```

Mở **http://localhost:5555** — công cụ xem database trực quan. Phải thấy các bảng
`countries` (48 dòng), `companies` (38), `skills` (32), `jobs` (0 dòng — chưa scrape).
Bấm Ctrl+C ở PowerShell để đóng.

## B6. Cài trình duyệt cho scraper (3 phút)

Chỉ cần nếu bạn muốn bật các nguồn dùng Playwright (như SLB):

```powershell
pnpm --filter @og/api playwright:install
```

Tải Chromium (~150 MB). Bỏ qua bước này cũng được — các nguồn Workday/Cheerio vẫn chạy.

## B7. Chạy app

```powershell
pnpm dev
```

Lệnh này build package dùng chung rồi chạy **song song** cả backend và frontend.
Chờ đến khi thấy đủ 2 dòng:

```
[@og/api]  [Nest] LOG [Bootstrap] API sẵn sàng tại http://localhost:4000/api/v1
[@og/web]  ✓ Ready in 2.1s   ▲ Next.js 14.2.15  - Local: http://localhost:3000
```

Mở **http://localhost:3000**.

> Cửa sổ PowerShell này phải **để nguyên, không đóng**. Muốn dừng thì bấm Ctrl+C.
> Cần chạy lệnh khác thì mở **cửa sổ PowerShell thứ hai**.

## B8. Thu thập job (cửa sổ PowerShell thứ hai)

```powershell
cd "D:\Oil and Gas Job Hunting Web App"

pnpm scrape --list           # xem danh sách nguồn
pnpm scrape bakerhughes      # chạy 1 nguồn
pnpm scrape                  # chạy tất cả nguồn đang bật

pnpm --filter @og/api eval   # kiểm tra classifier: phải 13/13
```

Tải lại http://localhost:3000 → job đã hiện ra.

### ✅ Kiểm chứng B8

Sửa thử một dòng chữ để kiểm tra hot reload: mở
`apps/web/src/app/page.tsx`, tìm dòng `Việc làm dầu khí quốc tế, đã lọc sẵn cho bạn`,
đổi thành chữ khác rồi lưu. Trình duyệt tự cập nhật trong ~1 giây mà không cần bấm F5.

---

# 5. Sau khi chạy được thì làm gì tiếp

| Muốn làm | Đọc |
|---|---|
| Hiểu cách phân loại NLP hoạt động, tinh chỉnh từ khóa | [NLP.md](NLP.md) |
| Thêm nguồn tuyển dụng mới | [../README.md](../README.md) mục 3 + `apps/api/src/scraper/sources/` |
| Đưa lên internet (Render + Vercel) | [RENDER-RUNBOOK.md](RENDER-RUNBOOK.md) |
| Đưa lên internet (Railway + Vercel) | [PRODUCTION-RUNBOOK.md](PRODUCTION-RUNBOOK.md) |
| Xem/gọi thử toàn bộ API | http://localhost:4000/api/v1/docs |

**Việc nên làm sớm:** mở `apps/api/src/scraper/sources/generic-html.scraper.ts` và
`workday.scraper.ts`, kiểm tra selector của từng nguồn có còn đúng không (job board đổi
giao diện vài lần mỗi năm). Nguồn nào `found = 0` là selector đã lỗi thời.

---

# 6. Xử lý lỗi thường gặp

### 6.1 `docker: command not found` / "Cannot connect to the Docker daemon"

- Docker Desktop **chưa chạy** → mở từ Start Menu, chờ con cá voi chuyển xanh
- Vừa cài xong mà chưa khởi động lại máy → khởi động lại
- Đang mở PowerShell cũ từ trước khi cài → đóng, mở cửa sổ mới
- Biểu tượng cá voi màu vàng mãi không xanh → Docker Desktop → Settings → **Reset to factory defaults**

### 6.2 API không lên / `"db":"down"`

```powershell
docker compose ps            # cả 3 container phải running
docker compose logs api      # đọc lỗi thật
```

| Trong log thấy | Nguyên nhân | Sửa |
|---|---|---|
| `Can't reach database server` | Postgres chưa sẵn sàng | Chờ 30 giây rồi thử lại; `docker compose restart api` |
| `port is already allocated` | Cổng 4000/5432 đang bị chiếm | Xem [6.7](#67-port-is-already-allocated) |
| `Migration failed` | Database ở trạng thái dở dang | `docker compose down -v` rồi `docker compose up -d --build` (mất hết dữ liệu) |

Đường B: kiểm tra PostgreSQL có đang chạy không —
Start Menu → *Services* → tìm `postgresql-x64-16` → phải là **Running**.

### 6.3 Web hiện "Không kết nối được tới API"

Nghĩa là frontend gọi API không thành công.

1. Kiểm tra API còn sống: `curl.exe http://localhost:4000/api/v1/health`
2. **Đường A (Docker):** biến `API_INTERNAL_URL` phải là `http://api:4000/api/v1`
   trong `docker-compose.yml` — **không phải** `localhost`. Frontend chạy *bên trong*
   container, `localhost` sẽ trỏ ngược vào chính container đó chứ không tới API.
3. **Đường B (Node):** biến của frontend phải nằm trong `apps/web/.env.local`
   (Next.js **không** đọc file `.env` ở thư mục gốc):

   ```
   NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
   ```

   Sau khi sửa file này phải **dừng `pnpm dev` rồi chạy lại** — biến `NEXT_PUBLIC_*`
   được nhúng lúc khởi động, không đọc lại khi đang chạy.
   Không có file này cũng chạy được vì code mặc định trỏ về `http://localhost:4000/api/v1`.

### 6.4 Scrape ra `found = 0`

Scraper chạy được nhưng không lấy được job nào — gần như luôn do trang tuyển dụng đã
đổi cấu trúc HTML.

```powershell
curl.exe "http://localhost:4000/api/v1/scrape/runs?limit=3"
```

Xem trường `errors`. Cách sửa: mở URL tìm kiếm của nguồn đó trên trình duyệt, bấm F12 →
tab Elements, tìm selector thật của thẻ job, rồi sửa hằng số `SELECTORS` ở đầu file
scraper tương ứng (mọi selector đã gom về một chỗ cho dễ sửa).

Với nguồn Workday (`bakerhughes`, `chevron`, `oxy`, `bp`, `shell`…): `found = 0` thường do sai
`host`/`tenant`/`site`. Mở trang careers của công ty → F12 → tab Network → tìm request
tới `/wday/cxs/<tenant>/<site>/jobs` → copy đúng 3 giá trị vào `WORKDAY_TENANTS`.

### 6.5 `inserted = 0` dù `found > 0`

Bộ phân loại NLP đã loại hết. Kiểm tra bằng cách đưa một tiêu đề thật vào:

```powershell
curl.exe -X POST http://localhost:4000/api/v1/classify -H "Content-Type: application/json" -d "{\"title\":\"Senior Reservoir Engineer\",\"description\":\"history matching eclipse stoiip oil and gas\"}"
```

Kết quả phải là `"discipline":"RESERVOIR"` với `confidence` ~0.9.

Nếu ra `OTHER`: thiếu từ khóa cho loại job đó → bổ sung vào
`packages/shared/src/keywords.ts`, hoặc hạ `CLASSIFIER_MIN_SCORE` trong `.env` xuống 4–5.
Chi tiết cách tinh chỉnh: [NLP.md](NLP.md).

### 6.6 `psql` không phải là lệnh hợp lệ

PostgreSQL chưa được thêm vào PATH. Cách nhanh: dùng **SQL Shell (psql)** từ Start Menu.
Hoặc thêm vào PATH:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```

(lệnh này chỉ có hiệu lực trong cửa sổ hiện tại; để vĩnh viễn thì vào
*System Properties → Environment Variables → Path → New*)

### 6.7 `port is already allocated`

Có ứng dụng khác đang chiếm cổng 3000, 4000 hoặc 5432. Tìm thủ phạm:

```powershell
netstat -ano | findstr :4000
```

Cột cuối là PID. Xem đó là chương trình gì rồi tắt:

```powershell
tasklist /FI "PID eq <PID>"
taskkill /PID <PID> /F        # cẩn thận: lệnh này tắt cứng chương trình
```

Hoặc đổi cổng trong `docker-compose.yml` — ví dụ `'4001:4000'` để dùng cổng 4001
(nhớ sửa `NEXT_PUBLIC_API_URL` cho khớp).

### 6.8 `pnpm install` báo lỗi `ERR_PNPM_...`

```powershell
pnpm store prune
Remove-Item -Recurse -Force node_modules
pnpm install
```

Vẫn lỗi thì kiểm tra Node có đúng phiên bản ≥ 20.11 không (`node -v`).

### 6.9 Build Docker rất lâu hoặc thất bại giữa chừng

Lần đầu 10–20 phút là **bình thường** (image Playwright ~2 GB). Nếu treo:

- Kiểm tra kết nối mạng
- Docker Desktop → Settings → Resources → cấp ít nhất **4 GB RAM**
- Hết dung lượng ổ C → dọn: `docker system prune -a` (xóa mọi image không dùng)

### 6.10 Muốn xóa sạch làm lại từ đầu

```powershell
# Đường A
docker compose down -v
docker compose up -d --build
docker compose exec api node dist/scripts/seed.js

# Đường B
psql -U postgres -c "DROP DATABASE ogjobs;" -h localhost
psql -U postgres -c "CREATE DATABASE ogjobs OWNER ogjobs;" -h localhost
pnpm db:migrate
pnpm db:seed
```

---

## Bảng tra nhanh

| Việc | Đường A (Docker) | Đường B (Node) |
|---|---|---|
| Khởi động | `docker compose up -d` | `pnpm dev` |
| Dừng | `docker compose stop` | Ctrl+C |
| Xem log API | `docker compose logs -f api` | hiện thẳng trong terminal |
| Nạp dữ liệu nền | `docker compose exec api node dist/scripts/seed.js` | `pnpm db:seed` |
| Scrape 1 nguồn | `docker compose exec api node dist/scripts/scrape-cli.js bakerhughes` | `pnpm scrape bakerhughes` |
| Test classifier | `docker compose exec api node dist/scripts/classifier-eval.js` | `pnpm --filter @og/api eval` |
| Xem database | — | `pnpm db:studio` |
| Sau khi sửa code | `docker compose up -d --build` | tự động hot reload |
