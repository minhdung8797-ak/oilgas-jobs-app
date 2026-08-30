-- ═══════════════════════════════════════════════════════════════
--  Bổ sung 4 nhà tuyển dụng mới (thêm 2026-08-31)
--  Chạy trong Neon SQL Editor. An toàn khi chạy lại nhiều lần.
--
--  Không chạy thì scraper vẫn hoạt động, nhưng công ty sẽ được tạo tự động với
--  type mặc định 'OTHER' -> rơi vào nhóm "Khác" ở trang Nhà tuyển dụng.
--  Chạy TRƯỚC khi scrape thì gọn hơn (khỏi phải sửa nhãn sau).
-- ═══════════════════════════════════════════════════════════════

INSERT INTO companies (slug, name, type, website, careers_url, hq_country_id, updated_at)
VALUES
  ('crescent-petroleum', 'Crescent Petroleum', 'IOC',
   'https://www.crescent.ae', 'https://careers.crescent.ae/CrescentPetroleum/search/',
   (SELECT id FROM countries WHERE code = 'AE'), NOW()),

  ('north-oil-company', 'North Oil Company', 'NOC',
   'https://www.noc.qa', 'https://careers.noc.qa/search/',
   (SELECT id FROM countries WHERE code = 'QA'), NOW()),

  ('bw-energy', 'BW Energy', 'IOC',
   'https://www.bwenergy.no', 'https://apply.workable.com/bw-energy/',
   (SELECT id FROM countries WHERE code = 'NO'), NOW()),

  ('assala-energy', 'Assala Energy', 'IOC',
   'https://www.assalaenergy.com', 'https://apply.workable.com/assala-energy/',
   (SELECT id FROM countries WHERE code = 'GB'), NOW())

ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  type        = EXCLUDED.type,
  website     = EXCLUDED.website,
  careers_url = EXCLUDED.careers_url,
  updated_at  = NOW();

-- Kiểm chứng: phải trả về 4 dòng
SELECT slug, name, type FROM companies
WHERE slug IN ('crescent-petroleum','north-oil-company','bw-energy','assala-energy');
