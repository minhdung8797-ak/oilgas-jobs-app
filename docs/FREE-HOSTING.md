# Chạy app hoàn toàn miễn phí ($0/tháng)

> Câu trả lời ngắn: **được**, nhưng phải ghép đúng nhà cung cấp và chấp nhận vài đánh đổi.
> Điểm mấu chốt là **không dùng cron trả phí** và **không dùng Postgres free của Render**.

---

## 1. Kiến trúc $0

```
GitHub repo (public)
   │
   ├──► GitHub Actions ──► chạy scraper theo lịch 03:15 UTC ──┐
   │    (miễn phí không giới hạn với repo public)             │ ghi thẳng vào DB
   │                                                          ▼
   ├──► Render (Free web service) ──► API NestJS ────────►  Neon Postgres (Free)
   │    512 MB · tự ngủ sau 15 phút                          0.5 GB · vĩnh viễn
   │                                       ▲
   └──► Vercel (Hobby) ──► Next.js ────────┘
        CDN edge · không giới hạn thực tế cho traffic nhỏ
```

| Thành phần | Nhà cung cấp | Gói | Giá | Giới hạn thật |
|---|---|---|---|---|
| Frontend | **Vercel** | Hobby | $0 | Chỉ dùng **phi thương mại**, cá nhân |
| API | **Render** | Free web service | $0 | 512 MB RAM · **ngủ sau 15 phút** không có traffic · 750 giờ/tháng |
| Database | **Neon** | Free | $0 | 0.5 GB/project · 100 CU-giờ/tháng · ngủ sau 5 phút rảnh · **không hết hạn** |
| Cron scraper | **GitHub Actions** | Free | $0 | Repo public: **không giới hạn phút**. Repo private: 2.000 phút Linux/tháng |
| **Tổng** | | | **$0** | |

### Vì sao chọn đúng tổ hợp này

**Neon thay cho Postgres free của Render.** Render nói rõ: *"Free Postgres hết hạn sau 30 ngày"*,
sau đó 14 ngày ân hạn rồi **xoá sạch dữ liệu**, và **không có backup**. Neon free không có hạn
30 ngày — chỉ ngủ khi rảnh rồi tự thức khi có truy vấn.

**GitHub Actions thay cho cron trả phí.** Render **không có gói cron miễn phí** (tối thiểu ~$1/tháng
mỗi cron service). Actions chạy scraper rồi thoát — đúng mô hình của `scrape-cli.js`. File
[`.github/workflows/scrape.yml`](../.github/workflows/scrape.yml) đã viết sẵn.

**Render free thay vì đặt API lên Vercel.** Vercel là serverless, không chạy được Playwright
và không giữ được tiến trình dài. Render free đủ cho phần đọc dữ liệu.

---

## 2. Đánh đổi phải chấp nhận

| Vấn đề | Ảnh hưởng thực tế | Cách giảm nhẹ |
|---|---|---|
| **API ngủ sau 15 phút** | Bạn của bạn mở link lần đầu trong ngày phải chờ **~1 phút** trắng màn hình | Ping `/api/v1/health` mỗi 10 phút bằng UptimeRobot (miễn phí) — nhưng sẽ đốt hết 750 giờ/tháng |
| **Neon ngủ sau 5 phút** | Truy vấn đầu tiên chậm thêm ~1 giây | Không đáng kể |
| **DB chỉ 0.5 GB** | Chứa được khoảng **20.000–40.000 job** (mỗi job ~15 KB kể cả mô tả) | Cron bảo trì tự ẩn job cũ; xoá hẳn job `is_active=false` quá 6 tháng nếu cần |
| **Vercel Hobby phi thương mại** | Chia sẻ cho bạn bè dùng: **OK**. Bán/chạy quảng cáo: **không được** | Chuyển Pro ($20/tháng) khi thương mại hoá |
| **Không Playwright** | Nguồn SLB không chạy được trên Render free (512 MB không đủ Chromium) | Chạy SLB **trong GitHub Actions** (`with_playwright: true`) — Actions có 7 GB RAM, thoải mái |
| **Actions tự tắt lịch** | Repo public không có hoạt động 60 ngày → lịch cron bị vô hiệu hoá | Vào tab Actions bấm "Enable workflow" |
| **Không có backup DB** | Mất dữ liệu là mất luôn | `pg_dump` định kỳ về máy, hoặc chạy lại scraper (dữ liệu tái tạo được) |

> **Điểm sáng:** dữ liệu của app này **tái tạo được** — mất DB thì chạy lại scraper là có lại.
> Đây là lý do gói free chấp nhận được ở đây, khác với app có dữ liệu người dùng.

---

## 3. Các bước thiết lập

> 👉 **Muốn hướng dẫn đầy đủ từng bước, không cần cài gì trên máy?**
> Xem [GO-LIVE-FREE.md](GO-LIVE-FREE.md) — walkthrough trọn vẹn từ GitHub tới link chia sẻ,
> kèm bước kiểm chứng và xử lý lỗi. Phần dưới đây chỉ liệt kê điểm KHÁC so với
> [RENDER-RUNBOOK.md](RENDER-RUNBOOK.md).

### 3.1 Database: dùng Neon thay Render Postgres

1. Đăng ký tại **https://neon.com** (đăng nhập bằng GitHub)
2. **Create project** → chọn region gần bạn (Singapore) → PostgreSQL 16
3. Copy **Connection string** — dạng:
   ```
   postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

Trong `render.yaml`, **xoá toàn bộ khối `databases:`** và sửa biến `DATABASE_URL` của cả 3
service thành nhập tay:

```yaml
      - key: DATABASE_URL
        sync: false        # Render sẽ hỏi giá trị khi tạo Blueprint
```

> Dùng chuỗi có `-pooler` (connection pooler của Neon) cho API vì Render free chỉ có
> 512 MB — pooler giảm số kết nối. Riêng khi chạy `prisma migrate` thì dùng chuỗi
> **không** có `-pooler` (Prisma cần kết nối trực tiếp để tạo bảng).

### 3.2 API: gói Free trên Render — đã cấu hình sẵn

`render.yaml` trong repo **đã là bản free**: `plan: free`, đúng 1 web service, không có
khối `databases:` và không có service `type: cron` (gói free không hỗ trợ cron — GitHub
Actions làm thay). Không cần sửa gì.

Nguồn Playwright (`slb`) cũng **đã để `enabled: false` sẵn** — 512 MB không đủ cho Chromium.
Xem [RENDER-RUNBOOK mục 1.2](RENDER-RUNBOOK.md) cho bảng trạng thái đầy đủ.

> Bản trả phí (database + API + 2 cron) nằm ở `render.paid.yaml`. Render chỉ đọc đúng tên
> `render.yaml`, nên muốn dùng bản trả phí thì phải đổi tên hai file cho nhau.

### 3.3 Cron: bật GitHub Actions

1. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `DATABASE_URL`
   - Value: chuỗi kết nối Neon **không có** `-pooler` (Actions cần chạy migrate)
2. Repo → tab **Actions** → nếu thấy thông báo → bấm **I understand my workflows, enable them**
3. Chạy thử ngay: **Actions** → **Scrape jobs** → **Run workflow** → để trống ô source → **Run**

Theo dõi log. Bước *Thu thập job* phải in ra bảng có `found` và `inserted` > 0.

### 3.4 Seed dữ liệu nền

Render free **không cho dùng Shell**, nên chạy từ máy bạn (Neon mở kết nối từ internet):

```powershell
cd "D:\Oil and Gas Job Hunting Web App"
$env:DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"   # chuỗi KHÔNG có -pooler
pnpm --filter @og/api exec prisma migrate deploy
pnpm db:seed
```

---

## 4. Khi nào nên bắt đầu trả tiền

| Dấu hiệu | Nâng cấp | Giá |
|---|---|---|
| Bạn bè phàn nàn "mở link phải chờ cả phút" | Render `0.5c-512mb` (không bao giờ ngủ) | +$7/tháng |
| Muốn bật nguồn SLB trực tiếp trên API | Render `1c-2g` (2 GB cho Chromium) | +$25/tháng |
| DB gần đầy 0.5 GB | Neon Launch | +$5/tháng |
| App bắt đầu có doanh thu / quảng cáo | Vercel Pro (bắt buộc theo ToS) | +$20/tháng |

Bước nâng cấp đáng tiền nhất và rẻ nhất là **$7 cho Render** — xoá bỏ hoàn toàn cảnh chờ 1 phút,
vốn là thứ khiến người ta đóng tab.

---

## 5. Chia sẻ *mã nguồn* cho bạn bè

Khác với chia sẻ *website*. Hiện repo **chưa có file LICENSE** — theo luật bản quyền mặc định,
không có license nghĩa là **người khác không có quyền sử dụng lại code**, kể cả khi repo public.

Muốn cho phép người khác dùng thoải mái, thêm file `LICENSE` ở gốc repo với nội dung giấy phép
**MIT** (thoáng nhất, chỉ yêu cầu giữ dòng ghi công). Bảo tôi là tôi tạo cho.

---

## 6. Lưu ý pháp lý khi chia sẻ công khai

Đây là điểm cần cân nhắc **nghiêm túc hơn** chuyện chi phí:

- App này **thu thập dữ liệu từ các trang tuyển dụng**. Một số job board (Rigzone,
  OilandGasJobSearch…) **cấm scraping trong Terms of Use**. Dùng riêng cho mình là một chuyện;
  chạy công khai cho nhiều người dùng là chuyện khác — rủi ro pháp lý và bị chặn IP cao hơn hẳn.
- **An toàn hơn:** chỉ bật các nguồn là **career site chính thức của công ty** — đây là dữ liệu
  công ty chủ động công bố để tuyển người. Đúng theo nguyên tắc đó, repo hiện bật **14 nguồn**,
  toàn bộ là career site chính thức, và `rigzone` / `oilandgasjobsearch` đã bị **tắt**:
  - **Workday JSON API (8):** Baker Hughes, Chevron, Occidental (`oxy`), Continental Resources,
    Diamondback, Permian Resources, BP, Shell
  - **Phenom People (1):** ADNOC
  - **Oracle Recruiting Cloud (2):** Eni, Petronas
  - **Jibe (1):** QatarEnergy
  - **SAP SuccessFactors (2):** Harbour Energy, Tullow Oil
- Luôn giữ `SCRAPER_USER_AGENT` có email liên hệ thật, và `SCRAPER_REQUEST_DELAY_MS ≥ 1500`.
- Frontend đã luôn dẫn người dùng **về trang gốc để ứng tuyển** (nút "Ứng tuyển tại nguồn"),
  không giữ chân họ lại — đây là cách làm được các job board chấp nhận rộng rãi nhất.
- Nếu định làm nghiêm túc và lâu dài: nhiều công ty có **RSS/XML feed** hoặc API tuyển dụng
  chính thức, dùng nguồn đó thay scraping là an toàn tuyệt đối.

---

## Nguồn tham khảo

- [Render · Free Instance Types](https://render.com/docs/free) — spin-down 15 phút, Postgres free hết hạn 30 ngày
- [Neon · Pricing](https://neon.com/pricing) — Free plan 0.5 GB, 100 CU-giờ/tháng
- [GitHub · Billing for Actions](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions) — public repo miễn phí, private 2.000 phút
- [GitHub · Scheduled workflows bị tắt sau 60 ngày](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
- [Vercel · Hobby Plan](https://vercel.com/docs/plans/hobby) — cá nhân, phi thương mại
- [Vercel · Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
