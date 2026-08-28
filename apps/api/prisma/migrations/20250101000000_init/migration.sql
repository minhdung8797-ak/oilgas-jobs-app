-- ═══════════════════════════════════════════════════════════════
--  OG Jobs · Migration 001 · Initial schema
--  PostgreSQL >= 14 (khuyến nghị 16)
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy search công ty / tiêu đề
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- bỏ dấu khi full-text

-- ─────────────────────────── ENUM TYPES ───────────────────────
CREATE TYPE "Discipline"     AS ENUM ('RESERVOIR', 'PETROLEUM', 'PRODUCTION', 'GEOSCIENCE', 'OTHER');
CREATE TYPE "Seniority"      AS ENUM ('INTERN', 'ENTRY', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR', 'UNKNOWN');
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'GRADUATE', 'UNKNOWN');
CREATE TYPE "WorkMode"       AS ENUM ('ONSITE', 'OFFSHORE', 'REMOTE', 'HYBRID', 'ROTATIONAL', 'UNKNOWN');
CREATE TYPE "CompanyType"    AS ENUM ('IOC', 'NOC', 'SERVICE', 'EPC', 'CONSULTANCY', 'JOB_BOARD', 'OTHER');
CREATE TYPE "SalaryPeriod"   AS ENUM ('HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR');
CREATE TYPE "ScrapeStatus"   AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');
CREATE TYPE "SkillCategory"  AS ENUM ('SOFTWARE', 'DOMAIN', 'PROGRAMMING', 'CERTIFICATION', 'SOFT');

-- ─────────────────────────── countries ────────────────────────
CREATE TABLE "countries" (
    "id"         SERIAL       NOT NULL,
    "code"       VARCHAR(2)   NOT NULL,
    "iso3"       VARCHAR(3)   NOT NULL,
    "name"       VARCHAR(120) NOT NULL,
    "region"     VARCHAR(60),
    "currency"   VARCHAR(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");
CREATE INDEX "countries_region_idx" ON "countries"("region");

-- ─────────────────────────── companies ────────────────────────
CREATE TABLE "companies" (
    "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
    "slug"          VARCHAR(160)  NOT NULL,
    "name"          VARCHAR(200)  NOT NULL,
    "type"          "CompanyType" NOT NULL DEFAULT 'OTHER',
    "website"       VARCHAR(300),
    "careers_url"   VARCHAR(400),
    "logo_url"      VARCHAR(400),
    "description"   TEXT,
    "hq_country_id" INTEGER,
    "job_count"     INTEGER       NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
CREATE INDEX "companies_name_idx" ON "companies"("name");
CREATE INDEX "companies_type_idx" ON "companies"("type");
ALTER TABLE "companies"
  ADD CONSTRAINT "companies_hq_country_id_fkey"
  FOREIGN KEY ("hq_country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────── skills ───────────────────────────
CREATE TABLE "skills" (
    "id"         SERIAL          NOT NULL,
    "slug"       VARCHAR(80)     NOT NULL,
    "name"       VARCHAR(120)    NOT NULL,
    "category"   "SkillCategory" NOT NULL DEFAULT 'DOMAIN',
    "created_at" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "skills_slug_key" ON "skills"("slug");
CREATE INDEX "skills_category_idx" ON "skills"("category");

-- ─────────────────────────── jobs ─────────────────────────────
CREATE TABLE "jobs" (
    "id"                     UUID             NOT NULL DEFAULT gen_random_uuid(),
    "slug"                   VARCHAR(220)     NOT NULL,
    "source"                 VARCHAR(60)      NOT NULL,
    "source_url"             VARCHAR(700)     NOT NULL,
    "external_id"            VARCHAR(160),
    "title"                  VARCHAR(400)     NOT NULL,
    "title_normalized"       VARCHAR(400)     NOT NULL,
    "description"            TEXT,
    "description_html"       TEXT,
    "company_id"             UUID,
    "country_id"             INTEGER,
    "city"                   VARCHAR(160),
    "location_raw"           VARCHAR(300),
    "discipline"             "Discipline"     NOT NULL DEFAULT 'OTHER',
    "discipline_confidence"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discipline_scores"      JSONB,
    "classifier_version"     VARCHAR(40),
    "matched_keywords"       TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    "seniority"              "Seniority"      NOT NULL DEFAULT 'UNKNOWN',
    "employment_type"        "EmploymentType" NOT NULL DEFAULT 'UNKNOWN',
    "work_mode"              "WorkMode"       NOT NULL DEFAULT 'UNKNOWN',
    "rotation"               VARCHAR(40),
    "experience_min_years"   INTEGER,
    "salary_min"             DECIMAL(14,2),
    "salary_max"             DECIMAL(14,2),
    "salary_currency"        VARCHAR(3),
    "salary_period"          "SalaryPeriod",
    "salary_min_usd"         DECIMAL(14,2),
    "salary_max_usd"         DECIMAL(14,2),
    "posted_at"              TIMESTAMP(3),
    "expires_at"             TIMESTAMP(3),
    "scraped_at"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active"              BOOLEAN          NOT NULL DEFAULT true,
    "content_hash"           VARCHAR(64)      NOT NULL,
    "raw"                    JSONB,
    "created_at"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "jobs_slug_key"       ON "jobs"("slug");
CREATE UNIQUE INDEX "jobs_source_url_key" ON "jobs"("source_url");

-- Index phục vụ truy vấn chính: lọc theo nhóm ngành + còn hiệu lực, sắp xếp mới nhất
CREATE INDEX "jobs_discipline_is_active_posted_at_idx" ON "jobs"("discipline", "is_active", "posted_at" DESC);
CREATE INDEX "jobs_country_id_discipline_is_active_idx" ON "jobs"("country_id", "discipline", "is_active");
CREATE INDEX "jobs_company_id_is_active_idx"            ON "jobs"("company_id", "is_active");
CREATE INDEX "jobs_source_scraped_at_idx"               ON "jobs"("source", "scraped_at");
CREATE INDEX "jobs_posted_at_idx"                       ON "jobs"("posted_at" DESC);
CREATE INDEX "jobs_salary_max_usd_idx"                  ON "jobs"("salary_max_usd" DESC);
CREATE INDEX "jobs_content_hash_idx"                    ON "jobs"("content_hash");

ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────── job_skills ───────────────────────
CREATE TABLE "job_skills" (
    "job_id"   UUID             NOT NULL,
    "skill_id" INTEGER          NOT NULL,
    "weight"   DOUBLE PRECISION NOT NULL DEFAULT 1,
    CONSTRAINT "job_skills_pkey" PRIMARY KEY ("job_id", "skill_id")
);
CREATE INDEX "job_skills_skill_id_idx" ON "job_skills"("skill_id");
ALTER TABLE "job_skills"
  ADD CONSTRAINT "job_skills_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_skills"
  ADD CONSTRAINT "job_skills_skill_id_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────── scrape_runs ──────────────────────
CREATE TABLE "scrape_runs" (
    "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
    "source"       VARCHAR(60)    NOT NULL,
    "status"       "ScrapeStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at"  TIMESTAMP(3),
    "duration_ms"  INTEGER,
    "found"        INTEGER        NOT NULL DEFAULT 0,
    "inserted"     INTEGER        NOT NULL DEFAULT 0,
    "updated"      INTEGER        NOT NULL DEFAULT 0,
    "skipped"      INTEGER        NOT NULL DEFAULT 0,
    "failed"       INTEGER        NOT NULL DEFAULT 0,
    "errors"       JSONB,
    "triggered_by" VARCHAR(40)    NOT NULL DEFAULT 'cron',
    CONSTRAINT "scrape_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scrape_runs_source_started_at_idx" ON "scrape_runs"("source", "started_at" DESC);
CREATE INDEX "scrape_runs_status_idx"            ON "scrape_runs"("status");

-- ─────────────────────────── fx_rates ─────────────────────────
CREATE TABLE "fx_rates" (
    "code"        VARCHAR(3)    NOT NULL,
    "rate_to_usd" DECIMAL(18,8) NOT NULL,
    "fetched_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("code")
);
