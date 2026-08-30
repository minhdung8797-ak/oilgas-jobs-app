import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, isNotFound } from '@/lib/api';
import { JobCard } from '@/components/JobCard';
import {
  DISCIPLINE_STYLE,
  EMPLOYMENT_LABEL,
  SENIORITY_LABEL,
  WORK_MODE_LABEL,
  cn,
  formatUsd,
  timeAgo,
} from '@/lib/utils';

// revalidate = 0: trang luôn dựng lại theo từng request.
// Mọi lời gọi API bên trong đã dùng `cache: 'no-store'` (xem lib/api.ts) nên
// Next tự coi trang là động; đặt 0 ở đây chỉ để ý định rõ ràng, tránh người
// đọc sau tưởng còn ISR. Tải cho API vẫn được chặn bởi header s-maxage phía API.
export const revalidate = 0;

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const job = await api.job(params.slug);
    const location = [job.city, job.country?.name].filter(Boolean).join(', ');
    return {
      title: `${job.title}${job.company ? ` · ${job.company.name}` : ''}`,
      description: `${job.title} tại ${job.company?.name ?? 'công ty dầu khí'}${location ? `, ${location}` : ''}. ${
        job.description?.slice(0, 140) ?? ''
      }`,
      openGraph: { title: job.title, description: location },
      alternates: { canonical: `/jobs/${job.slug}` },
    };
  } catch {
    return { title: 'Không tìm thấy việc làm' };
  }
}

export default async function JobDetailPage({ params }: PageProps) {
  // Chỉ 404 THẬT mới gọi notFound(). Lỗi mạng / API ngủ / hết 25 giây thì để lỗi
  // nổi lên cho error.tsx xử lý — ở đó có nút "Thử lại".
  //
  // Trước đây `.catch(() => null)` gộp mọi loại lỗi thành notFound(), gây ba hậu
  // quả: người dùng đọc thông báo sai ("tin đã bị gỡ" trong khi API chỉ đang ngủ),
  // Google nhận HTTP 404 và gỡ chỉ mục tin còn tuyển, và ISR cache cái 404 đó 300
  // giây nên tải lại vẫn 404 dù API đã thức.
  let job: Awaited<ReturnType<typeof api.job>>;
  try {
    job = await api.job(params.slug);
  } catch (err) {
    if (isNotFound(err)) notFound();
    throw err;
  }

  const style = DISCIPLINE_STYLE[job.discipline] ?? DISCIPLINE_STYLE.OTHER;
  const location = [job.city, job.country?.name].filter(Boolean).join(', ') || job.locationRaw;

  // JSON-LD giúp Google hiển thị rich result cho tin tuyển dụng
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description ?? job.title,
    datePosted: job.postedAt ?? undefined,
    employmentType: job.employmentType,
    hiringOrganization: job.company
      ? { '@type': 'Organization', name: job.company.name }
      : undefined,
    jobLocation: job.country
      ? {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: job.city ?? undefined,
            addressCountry: job.country.code,
          },
        }
      : undefined,
    baseSalary:
      job.salary.min || job.salary.max
        ? {
            '@type': 'MonetaryAmount',
            currency: job.salary.currency ?? 'USD',
            value: {
              '@type': 'QuantitativeValue',
              minValue: job.salary.min ?? undefined,
              maxValue: job.salary.max ?? undefined,
              unitText: job.salary.period ?? 'YEAR',
            },
          }
        : undefined,
  };

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // JSON.stringify KHONG escape dau '<'. Mot job co mo ta chua
          // "</script><img src=x onerror=...>" se thoat khoi the script va chay.
          // Escape '<' thanh \\u003c la cach chuan de nhung JSON vao HTML.
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:text-brand-700">
          Việc làm
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700 dark:text-slate-300">{job.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Nội dung chính ── */}
        <article className="card p-6">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className={cn('badge', style.className)}>{style.label}</span>
            {job.workMode !== 'UNKNOWN' && (
              <span className="badge bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                {WORK_MODE_LABEL[job.workMode]}
              </span>
            )}
            {job.rotation && (
              <span className="badge bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                Luân ca {job.rotation}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {job.title}
          </h1>

          <p className="mt-2 text-slate-600 dark:text-slate-400">
            <strong className="text-slate-800 dark:text-slate-200">
              {job.company?.name ?? 'Không rõ công ty'}
            </strong>
            {location && <> · {location}</>} · Đăng {timeAgo(job.postedAt)}
          </p>

          {job.skills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {job.skills.map((s) => (
                <Link
                  key={s}
                  href={`/?skill=${s}`}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {s.replace(/-/g, ' ')}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800">
            {job.descriptionHtml ? (
              <div
                className="prose-og space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 [&_a]:text-brand-600 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold"
                // An toàn: API đã lọc qua allowlist trước khi trả về — xem
                // apps/api/src/common/sanitize-html.ts. Chỉ còn thẻ định dạng,
                // mọi thuộc tính on* / style / javascript: đều đã bị loại.
                dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
              />
            ) : (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {job.description ?? 'Chưa có mô tả chi tiết. Xem tại nguồn gốc.'}
              </p>
            )}
          </div>
        </article>

        {/* ── Sidebar ── */}
        <aside className="space-y-4">
          <div className="card p-5">
            {job.sourceUrl ? (
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn-primary w-full"
              >
                Ứng tuyển tại nguồn ↗
              </a>
            ) : (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-sm text-slate-500 dark:bg-slate-800">
                Nguồn không cung cấp link hợp lệ
              </p>
            )}
            <p className="mt-2 text-center text-xs text-slate-500">
              Chuyển tới <strong>{job.source}</strong>
            </p>
            {/*
              Tin tuyển dụng hết hạn là chuyện bình thường: kiểm tra thực tế
              2026-08-30 cho thấy một tin Petronas đã thu thập được nay trả về
              "job expired". App không thể biết điều đó cho tới lần scrape sau,
              nên nói trước với người dùng thay vì để họ bấm vào rồi thất vọng.
            */}
            <p className="mt-1 text-center text-[11px] leading-snug text-slate-400">
              Tin có thể đã đóng nếu nhà tuyển dụng gỡ sau lần cập nhật gần nhất
            </p>

            <dl className="mt-5 space-y-3 text-sm">
              <Row label="Mức lương">
                {job.salary.display ?? 'Thỏa thuận'}
                {job.salary.maxUsd && (
                  <span className="block text-xs text-slate-500">
                    ≈ {formatUsd(job.salary.maxUsd)}/năm quy đổi USD
                  </span>
                )}
              </Row>
              <Row label="Loại hợp đồng">{EMPLOYMENT_LABEL[job.employmentType]}</Row>
              <Row label="Cấp bậc">{SENIORITY_LABEL[job.seniority]}</Row>
              <Row label="Kinh nghiệm">
                {job.experienceMinYears !== null ? `${job.experienceMinYears}+ năm` : '—'}
              </Row>
              <Row label="Hình thức">{WORK_MODE_LABEL[job.workMode]}</Row>
              <Row label="Địa điểm">{location ?? '—'}</Row>
              <Row label="Độ tin cậy phân loại">
                <span
                  className={cn(
                    'font-medium',
                    job.disciplineConfidence >= 0.6
                      ? 'text-emerald-600'
                      : job.disciplineConfidence >= 0.4
                        ? 'text-amber-600'
                        : 'text-red-500',
                  )}
                >
                  {Math.round(job.disciplineConfidence * 100)}%
                </span>
              </Row>
            </dl>
          </div>

          {job.company && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Công ty</h2>
              <p className="mt-2 text-lg font-semibold">{job.company.name}</p>
              <Link
                href={`/?company=${job.company.slug}`}
                className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                Xem tất cả việc làm của {job.company.name} →
              </Link>
            </div>
          )}
        </aside>
      </div>

      {job.related.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Việc làm liên quan</h2>
          <div className="space-y-3">
            {job.related.map((r) => (
              <JobCard key={r.id} job={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}
