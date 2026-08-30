import Link from 'next/link';
import type { JobDto } from '@og/shared';
import { DISCIPLINE_STYLE, EMPLOYMENT_LABEL, WORK_MODE_LABEL, cn, formatUsd, timeAgo } from '@/lib/utils';

/** Card hiển thị 1 job trong danh sách. Server Component – không cần JS phía client. */
export function JobCard({ job }: { job: JobDto }) {
  const style = DISCIPLINE_STYLE[job.discipline] ?? DISCIPLINE_STYLE.OTHER;
  const salary =
    job.salary.display ??
    (job.salary.maxUsd ? `~ ${formatUsd(job.salary.maxUsd)}/năm (quy đổi)` : null);

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={cn('badge', style.className)}>{style.short}</span>
            {job.workMode !== 'UNKNOWN' && (
              <span className="badge bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                {WORK_MODE_LABEL[job.workMode]}
              </span>
            )}
            {job.rotation && (
              <span className="badge bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                Ca {job.rotation}
              </span>
            )}
            {job.disciplineConfidence < 0.4 && (
              <span
                className="badge bg-yellow-50 text-yellow-700 ring-yellow-200"
                title="Độ tin cậy phân loại thấp – nên kiểm tra lại"
              >
                Cần xem lại
              </span>
            )}
          </div>

          <h2 className="truncate text-base font-semibold text-slate-900 sm:text-lg dark:text-slate-50">
            <Link href={`/jobs/${job.slug}`} className="hover:text-brand-700 dark:hover:text-brand-400">
              {job.title}
            </Link>
          </h2>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {job.company?.name ?? 'Không rõ công ty'}
            </span>
            <span aria-hidden>·</span>
            <span>
              {[job.city, job.country?.name].filter(Boolean).join(', ') || job.locationRaw || 'Chưa rõ địa điểm'}
            </span>
            {job.experienceMinYears !== null && (
              <>
                <span aria-hidden>·</span>
                <span>{job.experienceMinYears}+ năm KN</span>
              </>
            )}
          </p>

          {job.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.skills.slice(0, 6).map((s) => (
                <span
                  key={s}
                  className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400"
                >
                  {s.replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          {salary ? (
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{salary}</p>
          ) : (
            <p className="text-sm text-slate-400">Lương thỏa thuận</p>
          )}
          <p className="mt-1 text-xs text-slate-500">{timeAgo(job.postedAt)}</p>
          <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">{job.source}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-xs text-slate-500">
          {EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType}
        </span>

        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/${job.slug}`}
            className="text-sm font-medium text-slate-600 hover:underline dark:text-slate-300"
          >
            Chi tiết
          </Link>

          {/*
            Link ứng tuyển đi THẲNG tới tin gốc, không qua trang trung gian.
            Đây cũng là cách làm được các job board chấp nhận rộng rãi nhất:
            app không giữ chân người dùng, không thay thế trang tuyển dụng gốc.

            rel="noopener noreferrer": chặn trang đích thao túng tab này qua
            window.opener. nofollow: không truyền uy tín SEO cho bên thứ ba.

            `sourceUrl` đã được API kiểm tra scheme (chỉ http/https) — xem
            apps/api/src/common/sanitize-html.ts. Ở đây vẫn kiểm tra rỗng vì
            job cũ trong DB có thể có chuỗi trống sau khi lọc.
          */}
          {job.sourceUrl ? (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              title={`Mở tin tuyển dụng gốc trên ${job.source} (tab mới)`}
            >
              Ứng tuyển ↗
            </a>
          ) : (
            <span className="text-sm text-slate-400" title="Nguồn không cung cấp link hợp lệ">
              Không có link
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="card space-y-3 p-5">
      <div className="skeleton h-5 w-24" />
      <div className="skeleton h-6 w-3/4" />
      <div className="skeleton h-4 w-1/2" />
      <div className="flex gap-2">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-4 w-16" />
      </div>
    </div>
  );
}
