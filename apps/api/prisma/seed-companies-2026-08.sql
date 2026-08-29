-- ═══════════════════════════════════════════════════════════════
--  Bổ sung 4 nhà tuyển dụng mới (thêm 2026-08-30)
--  Chạy trong Neon SQL Editor. An toàn khi chạy lại nhiều lần.
--
--  Không có 4 dòng này thì scraper vẫn chạy được, nhưng công ty sẽ
--  được tạo tự động với type mặc định 'OTHER' -> rơi vào nhóm "Khác"
--  ở trang Nhà tuyển dụng thay vì "Công ty dầu khí quốc tế".
-- ═══════════════════════════════════════════════════════════════

INSERT INTO companies (slug, name, type, website, careers_url, hq_country_id, updated_at)
VALUES
  ('occidental-petroleum', 'Occidental Petroleum', 'IOC',
   'https://www.oxy.com', 'https://oxy.wd5.myworkdayjobs.com/Corporate',
   (SELECT id FROM countries WHERE code = 'US'), NOW()),

  ('continental-resources', 'Continental Resources', 'IOC',
   'https://www.clr.com', 'https://clr.wd5.myworkdayjobs.com/CLR_Careers',
   (SELECT id FROM countries WHERE code = 'US'), NOW()),

  ('diamondback-energy', 'Diamondback Energy', 'IOC',
   'https://www.diamondbackenergy.com', 'https://diamondbackenergy.wd12.myworkdayjobs.com/DBE',
   (SELECT id FROM countries WHERE code = 'US'), NOW()),

  ('permian-resources', 'Permian Resources', 'IOC',
   'https://www.permianres.com', 'https://permianres.wd12.myworkdayjobs.com/Permian_Resources_Careers',
   (SELECT id FROM countries WHERE code = 'US'), NOW())

ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  type        = EXCLUDED.type,
  website     = EXCLUDED.website,
  careers_url = EXCLUDED.careers_url,
  updated_at  = NOW();

-- Kiểm chứng: phải trả về 4 dòng, cột type đều là IOC
SELECT slug, name, type FROM companies
WHERE slug IN ('occidental-petroleum','continental-resources','diamondback-energy','permian-resources');
