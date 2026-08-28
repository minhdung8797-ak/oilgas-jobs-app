-- ═══════════════════════════════════════════════════════════════
--  OG Jobs · Migration 002 · Full-text search + trigram + counters
--  Prisma không quản lý tsvector nên cột này là "unmanaged":
--  schema.prisma KHÔNG khai báo nó, backend truy vấn qua $queryRaw.
-- ═══════════════════════════════════════════════════════════════

-- 1) Cột tsvector sinh tự động (GENERATED ALWAYS) – Postgres 12+
--    Trọng số: A = tiêu đề, B = kỹ năng/công ty, C = mô tả.
ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("location_raw", '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce("description", ''), 200000)), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS "jobs_search_vector_idx"
  ON "jobs" USING GIN ("search_vector");

-- 2) Trigram index cho autocomplete / tìm gần đúng tiêu đề & công ty
CREATE INDEX IF NOT EXISTS "jobs_title_trgm_idx"
  ON "jobs" USING GIN ("title_normalized" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "companies_name_trgm_idx"
  ON "companies" USING GIN ("name" gin_trgm_ops);

-- 3) Index cho mảng matched_keywords (dùng khi debug classifier)
CREATE INDEX IF NOT EXISTS "jobs_matched_keywords_idx"
  ON "jobs" USING GIN ("matched_keywords");

-- 4) Partial index: 95% truy vấn chỉ quan tâm job đang active và thuộc 4 nhóm
CREATE INDEX IF NOT EXISTS "jobs_active_target_idx"
  ON "jobs" ("posted_at" DESC)
  WHERE "is_active" = true AND "discipline" <> 'OTHER';

-- 5) Trigger duy trì companies.job_count (tránh COUNT(*) mỗi request facet)
CREATE OR REPLACE FUNCTION sync_company_job_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NOT NULL AND NEW.is_active THEN
      UPDATE companies SET job_count = job_count + 1 WHERE id = NEW.company_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.company_id IS NOT NULL AND OLD.is_active THEN
      UPDATE companies SET job_count = GREATEST(job_count - 1, 0) WHERE id = OLD.company_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.company_id IS DISTINCT FROM NEW.company_id) OR (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
      IF OLD.company_id IS NOT NULL AND OLD.is_active THEN
        UPDATE companies SET job_count = GREATEST(job_count - 1, 0) WHERE id = OLD.company_id;
      END IF;
      IF NEW.company_id IS NOT NULL AND NEW.is_active THEN
        UPDATE companies SET job_count = job_count + 1 WHERE id = NEW.company_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_company_job_count ON "jobs";
CREATE TRIGGER trg_sync_company_job_count
  AFTER INSERT OR UPDATE OR DELETE ON "jobs"
  FOR EACH ROW EXECUTE FUNCTION sync_company_job_count();

-- 6) View tiện dụng cho dashboard / BI
CREATE OR REPLACE VIEW "v_job_stats" AS
SELECT
  j.discipline,
  c.code                       AS country_code,
  c.name                       AS country_name,
  c.region,
  COUNT(*)                     AS job_count,
  ROUND(AVG(j.salary_max_usd)) AS avg_max_salary_usd,
  MAX(j.posted_at)             AS latest_posted_at
FROM jobs j
LEFT JOIN countries c ON c.id = j.country_id
WHERE j.is_active = true AND j.discipline <> 'OTHER'
GROUP BY j.discipline, c.code, c.name, c.region;
