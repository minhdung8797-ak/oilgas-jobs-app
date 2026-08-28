# NLP Classification Pipeline

Mục tiêu: gán mỗi tin tuyển dụng vào đúng 1 trong 4 nhóm — `RESERVOIR`, `PETROLEUM`, `PRODUCTION`, `GEOSCIENCE` — hoặc `OTHER` (bị loại khỏi kết quả public).

## Vì sao rule-based đứng trước, ML đứng sau

| Tiêu chí | Rule-based | Zero-shot LLM |
|---|---|---|
| Tốc độ | ~0.1 ms/job | 300–2000 ms/job |
| Chi phí | 0 | theo request |
| Giải thích được | Có (`matchedKeywords`) | Không |
| Ổn định | Deterministic | Thay đổi theo phiên bản model |
| Xử lý trường hợp lạ | Kém | Tốt |

Ngành dầu khí có bộ thuật ngữ **rất đặc trưng và ít nhập nhằng** (`history matching`, `nodal analysis`, `formation evaluation`…). Vì vậy rule-based xử lý được ~95% trường hợp; ML chỉ cần cho phần đuôi.

---

## 6 bước

### Bước 1 — Prefilter (`ClassifierService.prefilter`)
Substring match với `PREFILTER_TERMS`. Chạy trên **trang danh sách**, trước khi tốn request mở trang chi tiết. Loại bỏ ~80% lưu lượng.

### Bước 2 — Cổng ngành O&G (`industryScore`)
Cộng điểm tín hiệu ngành (`upstream`, `hydrocarbon`, `bopd`, `offshore platform`…). Nếu điểm < 4 **và** điểm nhóm cao nhất chưa đủ mạnh → trả `OTHER` ngay.

Mục đích: chặn `Production Engineer` của nhà máy ô tô, `Reservoir` của công trình thủy lợi.

### Bước 3 — Chấm điểm keyword có trọng số

```ts
if (khớp trong title) score += weight × titleBoost   // titleBoost = 2.0
if (khớp trong body)  score += weight × 0.55
```

Hai nguyên tắc thiết kế:

1. **Tiêu đề nặng gấp ~3.6 lần mô tả.** Tiêu đề là tuyên bố chính thức về vai trò; mô tả thường liệt kê cả các ngành lân cận ("phối hợp với đội geoscience…").
2. **Không đếm tần suất.** Mỗi keyword tính tối đa 1 lần cho body. Nếu đếm tần suất, một tin nhắc "reservoir" 20 lần trong phần giới thiệu công ty sẽ áp đảo tín hiệu thật.

Trọng số:

| Weight | Ý nghĩa | Ví dụ |
|---|---|---|
| 10 | Gần như chắc chắn | `reservoir engineer`, `petrophysicist` |
| 7–9 | Thuật ngữ chuyên ngành mạnh | `history matching`, `nodal analysis`, `formation evaluation` |
| 4–6 | Hỗ trợ | `waterflooding`, `MWD/LWD`, `sand control` |
| 2–3 | Yếu, chỉ có ý nghĩa khi cộng dồn | `aquifer`, `gas injection` |

### Bước 4 — Negative keywords
`NEGATIVE_KEYWORDS` trừ điểm **toàn cục** (mọi nhóm). Bắt các trường hợp:

- `video/film/media production` → không phải Production Engineering
- `petroleum accountant/lawyer/landman` → không phải kỹ thuật
- `software engineer` (trừ khi có `reservoir|petrophysic|seismic|subsurface`)
- `gas station attendant`, `truck driver`, `agriculture`

### Bước 5 — Quyết định

```
decided = topScore >= CLASSIFIER_MIN_SCORE (6)
       && margin  >= CLASSIFIER_MIN_MARGIN (2)      // margin = top1 − top2
```

`margin` quan trọng: một tin "Reservoir & Production Engineer" có thể đạt điểm cao ở cả hai nhóm. Khi đó gán bừa nhóm cao hơn 0.5 điểm là sai; hệ thống chuyển sang bước 6.

**Confidence** = hàm logistic mềm, không bao giờ đạt 1.0:

```
base        = 1 − e^(−score/25)
marginBoost = clamp(margin/30, 0, 0.25)
confidence  = clamp(base × 0.8 + marginBoost, 0, 0.99)
```

### Bước 6 — HuggingFace zero-shot (tùy chọn)

Bật bằng `HF_ENABLED=true` + `HF_API_TOKEN`. Model mặc định: `MoritzLaurer/deberta-v3-base-zeroshot-v2.0` (nhẹ, chạy tốt trên Inference API miễn phí).

Nhãn dùng ngôn ngữ tự nhiên chứ không phải tên enum — model hiểu tốt hơn nhiều:

```
"reservoir engineering, reservoir simulation and reserves estimation"
"petroleum engineering, drilling and well completion engineering"
"production engineering, artificial lift and well production optimisation"
"geoscience, geology, geophysics, petrophysics and formation evaluation"
"unrelated to oil and gas subsurface or well engineering"
```

Điểm cuối = trộn có trọng số, rule vẫn nặng hơn:

```
blended = 0.6 × (ruleScore / maxRuleScore) + 0.4 × hfProbability
```

Chấp nhận nhãn nếu `blended >= 0.45`. Kết quả HF được cache in-memory theo 400 ký tự đầu để không gọi lặp trong cùng phiên.

Nếu HF lỗi/timeout → tự động rơi về kết quả rule-based, không bao giờ làm hỏng pipeline.

---

## Trích xuất bổ sung

Cùng lượt quét text, `NormalizerService` rút ra:

| Trường | Cách làm |
|---|---|
| `seniority` | regex trên title (`senior`, `lead`, `principal`, `manager`…), fallback theo số năm kinh nghiệm |
| `employmentType` | regex (`contract`, `permanent`, `day rate`, `graduate`…) |
| `workMode` | `offshore`, `FPSO`, `hybrid`, `28/28 rotation`, `FIFO` |
| `rotation` | `28/28`, `14 days on / 14 days off` |
| `experienceMinYears` | `minimum 8 years of relevant experience` |
| `skills` | 32 pattern phần mềm/kỹ năng (Petrel, Eclipse, PIPESIM, OLGA, Techlog…) |

---

## Tinh chỉnh và đánh giá

```bash
# 1. Thử 1 tin cụ thể, xem điểm từng nhóm + keyword khớp
curl -X POST localhost:4000/api/v1/classify \
  -H 'Content-Type: application/json' \
  -d '{"title":"Production Technologist - Gas Lift Optimisation","description":"..."}'

# 2. Xem phân bố nhãn hiện tại và số job confidence thấp
curl localhost:4000/api/v1/classify/stats

# 3. Sửa packages/shared/src/keywords.ts, build lại shared, rồi:
curl -X POST localhost:4000/api/v1/classify/rebuild \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' -d '{"limit":10000}'
```

`rebuild` trả về danh sách tối đa 100 job đổi nhãn — dùng để kiểm tra thay đổi có đúng hướng không trước khi chạy trên toàn bộ DB.

### Quy trình cải thiện có kỷ luật

1. Lấy 200 job có `disciplineConfidence < 0.4` (`GET /jobs?minConfidence=0` + lọc thủ công).
2. Gán nhãn tay 200 job này làm tập vàng, lưu ra CSV.
3. Sửa từ điển → chạy `rebuild` → so với tập vàng, tính precision/recall từng nhóm.
4. Chỉ giữ thay đổi làm tăng F1; ghi lại bằng cách tăng `CLASSIFIER_VERSION`.

`classifier_version` được lưu trên từng job nên luôn biết bản ghi nào phân loại bằng phiên bản nào.

---

## Bẫy thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Nhiều job "Production" là ngành sản xuất | thiếu negative keyword | thêm pattern vào `NEGATIVE_KEYWORDS` |
| Job Drilling bị gán RESERVOIR | mô tả nhắc nhiều "reservoir" | tăng `titleBoost` hoặc thêm keyword drilling weight cao |
| Nhiều job rơi vào OTHER | `CLASSIFIER_MIN_SCORE` quá cao | giảm về 4–5 rồi đo lại |
| Confidence toàn bộ đều thấp | mô tả bị cắt quá ngắn ở scraper | kiểm tra `enrich()` có lấy được `description` không |
