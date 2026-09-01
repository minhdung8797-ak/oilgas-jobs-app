# OilGas Jobs Radar

Web app thu thập – chuẩn hóa – phân loại – hiển thị việc làm dầu khí quốc tế thuộc **4 nhóm ngành**:

| Nhóm | Enum | Ví dụ vị trí |
|---|---|---|
| Reservoir Engineering | `RESERVOIR` | Reservoir Engineer, Simulation Engineer, Reserves Analyst |
| Petroleum Engineering | `PETROLEUM` | Drilling Engineer, Completion Engineer, Well Engineer |
| Production Engineering | `PRODUCTION` | Production Engineer, Artificial Lift, Flow Assurance |
| Geoscience & Formation | `GEOSCIENCE` | Geologist, Geophysicist, Petrophysicist, Formation Evaluation |

---

## 1. Kiến trúc hệ thống

```
                        ┌──────────────────────────────────────────┐
                        │   NGUỒN DỮ LIỆU (14 nguồn đang bật —     │
                        │   đều là career site chính thức)         │
                        │  Baker Hughes · Chevron · Oxy · BP       │
                        │  Shell · Continental · Diamondback ·     │
                        │  Permian Resources · ADNOC · Eni ·       │
                        │  Petronas · QatarEnergy · Harbour ·      │
                        │  Tullow                                  │
                        └───────────────┬──────────────────────────┘
                                        │ HTTP / JSON API
                ┌───────────────────────▼───────────────────────┐
                │              SCRAPER LAYER                    │
                │  ┌──────────┐┌────────┐┌──────┐┌────┐┌──────┐ │
                │  │ Workday  ││ Phenom ││Oracle││Jibe││ SAP  │ │
                │  │ JSON API ││ People ││ ORC  ││    ││ SF   │ │
                │  │   (8)    ││  (1)   ││ (2)  ││(1) ││ (2)  │ │
                │  └────┬─────┘└───┬────┘└──┬───┘└─┬──┘└──┬───┘ │
                │       └──────────┴────────┴──────┴──────┘     │
                │              ScraperRegistry                  │
                │  (Playwright/SPA: chỉ dùng bởi nguồn đang tắt)│
                └───────────────────────┬───────────────────────┘
                                        │  RawJob[]
                              ┌─────────▼─────────┐
                              │   PREFILTER       │  ~80% bị loại ở đây
                              │ (substring match) │  → tiết kiệm request
                              └─────────┬─────────┘
                              ┌─────────▼─────────┐
                              │   NORMALIZER      │
                              │ country · city    │
                              │ salary → USD/năm  │
                              │ contract · rotation│
                              │ seniority · skills│
                              └─────────┬─────────┘
                              ┌─────────▼─────────┐
                              │  NLP CLASSIFIER   │
                              │ rule + keyword    │
                              │ weight + penalty  │
                              │ → HF zero-shot    │ (tùy chọn, ~3% case)
                              └─────────┬─────────┘
                              ┌─────────▼─────────┐
                              │   PERSIST         │  upsert theo sourceUrl
                              │   PostgreSQL 16   │  + contentHash dedupe
                              └─────────┬─────────┘
       ┌────────────────────────────────┼────────────────────────────────┐
       │                                │                                │
┌──────▼───────┐              ┌─────────▼──────────┐          ┌──────────▼─────────┐
│  CRON JOBS   │              │   REST API (Nest)  │          │  Next.js 14 (App)  │
│ 03:15 scrape │              │  /jobs /jobs/:id   │◄─────────┤  SSR + ISR 60s     │
│ 04:30 expire │              │  /scrape/run       │  fetch   │  Tailwind UI       │
│ 05:00 fx     │              │  /classify /facets │          │  Filter trong URL  │
└──────────────┘              └────────────────────┘          └────────────────────┘
```

### Luồng dữ liệu (1 vòng scrape)

1. **Cron** (03:15 UTC) gọi `ScraperService.runAll()`.
2. Mỗi nguồn chạy song song (giới hạn `SCRAPER_CONCURRENCY`), ghi 1 bản ghi `scrape_runs`.
3. `listJobs()` duyệt trang danh sách → `RawJob[]` (rẻ, chưa mở trang chi tiết).
4. **Prefilter** loại job không chứa từ khóa ngành → giảm ~80% request chi tiết.
5. `enrich()` mở trang chi tiết cho phần còn lại, ưu tiên đọc JSON-LD / JSON API.
6. **Normalizer** tách quốc gia/thành phố, parse lương → quy đổi USD/năm, suy ra loại hợp đồng, cấp bậc, ca luân phiên, kỹ năng.
7. **Classifier** chấm điểm theo từ điển có trọng số; nếu mơ hồ và bật `HF_ENABLED` thì gọi HuggingFace zero-shot rồi trộn điểm.
8. **Upsert** theo `source_url`; nếu `content_hash` không đổi thì chỉ cập nhật `last_seen_at` (rẻ).
9. Job không thuộc 4 nhóm → `is_active = false`, không xuất hiện trên frontend.
10. Cron 04:30 ẩn job không còn thấy trên nguồn quá `JOB_TTL_DAYS`.

### Các service

| Service | Vai trò | File chính |
|---|---|---|
| Scraper | Thu thập dữ liệu thô | `apps/api/src/scraper/` |
| Normalizer | Chuẩn hóa & quy đổi | `apps/api/src/normalizer/` |
| Classifier | Phân loại NLP | `apps/api/src/classifier/` |
| API | REST + Swagger | `apps/api/src/jobs/`, `companies/`, `countries/` |
| Scheduler | Cron job | `apps/api/src/scheduler/` |
| Frontend | Next.js SSR | `apps/web/` |

---

## 2. Công nghệ

| Lớp | Công nghệ |
|---|---|
| Frontend | Next.js 14 (App Router, RSC) · TailwindCSS 3 · TypeScript |
| Backend | NestJS 10 · Express · class-validator · Swagger |
| Database | PostgreSQL 16 · Prisma 5 · tsvector + GIN + pg_trgm |
| Scraper | Axios · Cheerio · Playwright (Chromium — **hiện không nguồn nào đang bật dùng tới**, chỉ nguồn `slb` đang tắt cần) |
| NLP | Rule-based có trọng số · keyword dictionary · HuggingFace zero-shot (tùy chọn) |
| Deploy | Docker multi-stage · Render Blueprint (API+DB+cron) hoặc Railway · Vercel (Web) |

---

## 3. Cấu trúc thư mục

```
.
├── apps
│   ├── api                        # NestJS backend
│   │   ├── prisma
│   │   │   ├── schema.prisma
│   │   │   └── migrations/        # SQL migration thuần
│   │   ├── src
│   │   │   ├── classifier/        # NLP pipeline
│   │   │   ├── normalizer/        # chuẩn hóa + FX
│   │   │   ├── scraper/
│   │   │   │   ├── lib/           # HttpClient, BrowserPool, BaseScraper
│   │   │   │   └── sources/
│   │   │   │       ├── workday.scraper.ts      # 8 nguồn Workday (bakerhughes, chevron, bp…)
│   │   │   │       ├── phenom.scraper.ts       # Phenom People (adnoc)
│   │   │   │       ├── oracle-orc.scraper.ts   # Oracle Recruiting Cloud (eni, petronas)
│   │   │   │       ├── jibe.scraper.ts         # Jibe (qatarenergy)
│   │   │   │       ├── generic-html.scraper.ts # SAP SuccessFactors (harbourenergy, tullow)
│   │   │   │       ├── bakerhughes.scraper.ts
│   │   │   │       ├── rigzone.scraper.ts      # đang tắt (ToU)
│   │   │   │       └── slb.scraper.ts          # đang tắt (cần Playwright)
│   │   │   ├── jobs/ companies/ countries/ skills/
│   │   │   ├── scheduler/         # cron
│   │   │   ├── scripts/           # seed.ts, scrape-cli.ts, classifier-eval.ts
│   │   │   └── main.ts
│   │   └── Dockerfile
│   └── web                        # Next.js frontend
│       ├── src/app/               # page.tsx, jobs/[slug], companies
│       ├── src/components/        # JobCard, FilterSidebar, SearchBar…
│       └── Dockerfile
├── packages/shared                # types, enums, keyword dictionary, countries
├── docker-compose.yml
├── render.yaml                    # Render Blueprint (miễn phí, plan: free): CHỈ 1 web service
│                                  #   — không database, không cron; DB dùng Neon
├── render.paid.yaml               # Render Blueprint (trả phí): DB + API + 2 cron job
├── .github/workflows/scrape.yml   # Cron miễn phí bằng GitHub Actions
└── docs/
```

---

## 4. Chạy local

> 🪟 **Máy Windows chưa cài gì?** Xem [`docs/LOCAL-SETUP-WINDOWS.md`](docs/LOCAL-SETUP-WINDOWS.md)
> — hướng dẫn từ con số 0: cài Docker Desktop (hoặc Node + PostgreSQL), chạy, nạp dữ liệu,
> scrape thử, kèm mục xử lý lỗi. Phần dưới đây là bản tóm tắt cho người đã có sẵn môi trường.

### 4.1 Bằng Docker (nhanh nhất)

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api node dist/scripts/seed.js     # nạp countries/companies/skills/fx
docker compose exec api node dist/scripts/scrape-cli.js bakerhughes   # thử 1 nguồn
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- Swagger: http://localhost:4000/api/v1/docs

### 4.2 Chạy trực tiếp (dev)

```bash
# Yêu cầu: Node >= 20.11, pnpm 9, PostgreSQL 16
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env                  # sửa DATABASE_URL cho đúng

pnpm db:generate                      # prisma generate
pnpm db:migrate                       # tạo schema
pnpm db:seed                          # dữ liệu nền
pnpm --filter @og/api playwright:install   # tải Chromium

pnpm dev                              # chạy song song api (4000) + web (3000)
```

### 4.3 Chạy scraper thủ công

```bash
pnpm scrape --list          # liệt kê nguồn
pnpm scrape bakerhughes     # 1 nguồn
pnpm scrape                 # tất cả nguồn đang bật (14 nguồn)

# Đánh giá classifier trên tập mẫu có nhãn (không cần DB):
pnpm --filter @og/api eval

# hoặc qua API:
curl -X POST http://localhost:4000/api/v1/scrape/run \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source":"bakerhughes","async":true}'
```

### 4.4 Nguồn chỉ chạy được từ máy cá nhân

Một số nhà tuyển dụng chặn theo **dải IP trung tâm dữ liệu**, không phải chặn bot
nói chung. Saudi Aramco là ca đã đo được ba lần, ba nơi:

| Chạy từ | Thời gian | Tin tìm được |
|---|---|---|
| Render (Oregon) | 1131 giây | 0 |
| Render (Oregon) | 1128 giây | 0 |
| GitHub Actions | 1126 giây | 0 |
| Máy cá nhân (IP dân dụng) | 0,3 giây | 52 |

Mọi request từ máy chủ đều treo tới hết giờ rồi trả rỗng — đặc trưng của tường
lửa chống bot chứ không phải lỗi cấu hình. Những nguồn như vậy để `enabled: false`
trong registry (API và cron trên GitHub không đụng tới) và chạy riêng từ máy cá nhân:

```powershell
.\scripts\aramco-local.ps1                  # chạy một lần
.\scripts\setup-aramco-task.ps1             # hẹn giờ chạy hằng ngày 10:30
.\scripts\setup-aramco-task.ps1 -Remove     # gỡ lịch
```

Script ghi thẳng vào Neon, không qua API trên Render, nên không phụ thuộc việc API
có đang ngủ hay không. Nhật ký nằm ở `logs/aramco-YYYY-MM.log`.

> **Không** lách chặn bằng cách giả User-Agent trình duyệt hay dùng proxy vượt rào.
> Cách trên hợp lệ vì nó chỉ là chạy cùng một scraper từ một đường mạng khác, vẫn
> khai báo đúng danh tính bot và vẫn chỉ lấy dữ liệu công khai.

---

## 5. API

Xem đầy đủ tại `/api/v1/docs` (Swagger UI). Tóm tắt:

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| GET | `/jobs` | Danh sách + lọc nâng cao + phân trang | – |
| GET | `/jobs/facets` | Đếm theo từng giá trị filter (vẽ sidebar) | – |
| GET | `/jobs/suggest?term=` | Autocomplete tiêu đề (pg_trgm) | – |
| GET | `/jobs/:idOrSlug` | Chi tiết + 6 job liên quan | – |
| GET | `/companies`, `/companies/:slug` | Công ty | – |
| GET | `/countries` | Quốc gia + số job | – |
| GET | `/skills` | Kỹ năng/phần mềm | – |
| POST | `/classify` | Phân loại thử 1 job | – |
| GET | `/classify/dictionary` | Xem từ điển keyword | – |
| GET | `/classify/stats` | Phân bố nhãn & confidence | – |
| POST | `/classify/rebuild` | Phân loại lại toàn bộ DB | Bearer |
| POST | `/scrape/run` | Kích hoạt scrape | Bearer |
| GET | `/scrape/sources`, `/scrape/runs` | Trạng thái & lịch sử | – |
| GET | `/health` | Health check | – |

**Ví dụ query đầy đủ:**

```
GET /api/v1/jobs
    ?q=reservoir simulation
    &discipline=RESERVOIR,PRODUCTION
    &country=AE,NO,GB
    &workMode=OFFSHORE,ROTATIONAL
    &employmentType=FULL_TIME
    &seniority=SENIOR,LEAD
    &skill=petrel,eclipse
    &salaryMinUsd=120000
    &postedWithinDays=30
    &sort=salary_desc
    &page=1&pageSize=20
```

Response:

```json
{
  "data": [
    {
      "id": "…", "slug": "senior-reservoir-engineer-adnoc-abu-dhabi-a1b2c3",
      "title": "Senior Reservoir Engineer",
      "company": { "name": "ADNOC", "slug": "adnoc", "type": "NOC" },
      "country": { "code": "AE", "name": "United Arab Emirates", "region": "Middle East" },
      "discipline": "RESERVOIR", "disciplineConfidence": 0.87,
      "salary": { "min": 45000, "max": 60000, "currency": "AED", "period": "MONTH",
                  "minUsd": 147000, "maxUsd": 196000, "display": "AED 45k – 60k/month" },
      "skills": ["eclipse", "history-matching", "reserves-prms"],
      "postedAt": "2026-08-20T00:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 342, "totalPages": 18, "hasNext": true, "hasPrev": false }
}
```

---

## 6. NLP Classification

Chi tiết thuật toán và cách tinh chỉnh: [`docs/NLP.md`](docs/NLP.md).

Tóm tắt 6 bước: prefilter → cổng ngành O&G → chấm điểm keyword có trọng số (title ×2, body ×0.55) → trừ điểm negative keyword → so ngưỡng + margin → HuggingFace zero-shot cho case mơ hồ.

Tinh chỉnh từ điển: sửa `packages/shared/src/keywords.ts`, rồi chạy:

```bash
curl -X POST http://localhost:4000/api/v1/classify/rebuild \
  -H "Authorization: Bearer $ADMIN_API_KEY" -d '{"limit":5000}'
```

---

## 7. Triển khai

- [`docs/GO-LIVE-FREE.md`](docs/GO-LIVE-FREE.md) — **đưa app lên internet $0/tháng, từng bước**:
  GitHub → Neon → Render → Vercel → GitHub Actions. Không cần cài Node trên máy.
- [`docs/FREE-HOSTING.md`](docs/FREE-HOSTING.md) — kiến trúc $0: vì sao chọn tổ hợp đó,
  đánh đổi gì, khi nào nên trả tiền.
- [`docs/RENDER-RUNBOOK.md`](docs/RENDER-RUNBOOK.md) — **runbook Git → Render → Vercel** (khuyến nghị):
  toàn bộ backend dựng bằng 1 file [`render.yaml`](render.yaml), kèm bước kiểm chứng và xử lý lỗi.
- [`docs/PRODUCTION-RUNBOOK.md`](docs/PRODUCTION-RUNBOOK.md) — **runbook Railway + Vercel** từng bước
  trên Railway + Vercel: mọi lệnh copy-paste được, có bước kiểm chứng sau mỗi giai đoạn,
  checklist nghiệm thu và mục xử lý lỗi thường gặp.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — bản tham chiếu ngắn, kèm phương án VPS/Docker Compose.

---

## 8. Lưu ý pháp lý & vận hành

- **App không tự đọc `robots.txt`** — không có đoạn code nào kiểm tra file này. Việc kiểm tra `robots.txt` và Terms of Use của từng nguồn là **thủ công, do bạn tự làm** trước khi bật nguồn mới trên production. Chính vì vậy, 14 nguồn đang bật đều **chỉ là career site chính thức của công ty** (dữ liệu công ty chủ động công bố để tuyển người). Hai job board bên thứ ba `rigzone` và `oilandgasjobsearch` đã bị tắt vì Terms of Use cấm scraping — nếu cần dữ liệu từ đó, hãy dùng API chính thức hoặc RSS/XML feed nếu có.
- Đặt `SCRAPER_REQUEST_DELAY_MS` đủ lớn (≥ 1500ms) và khai báo User-Agent có thông tin liên hệ.
- Nguồn nào chưa xác minh selector thì để `enabled: false` (xem `generic-html.scraper.ts`).
- Theo dõi bảng `scrape_runs`: `found` tụt về 0 là dấu hiệu site đã đổi cấu trúc DOM.
