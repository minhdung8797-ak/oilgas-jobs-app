import { Suspense } from 'react';
import type { Metadata } from 'next';
import { api, parseFilters } from '@/lib/api';
import { JobCard } from '@/components/JobCard';
import { FilterSidebar } from '@/components/FilterSidebar';
import { SearchBar } from '@/components/SearchBar';
import { Pagination } from '@/components/Pagination';
import { EmptyState } from '@/components/EmptyState';
import { StatsBar } from '@/components/StatsBar';
import { parseLang, t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Việc làm dầu khí quốc tế',
  description:
    'Danh sách việc làm Reservoir, Petroleum, Production và Geoscience & Formation từ các nhà tuyển dụng dầu khí toàn cầu.',
};

// revalidate = 0: trang luôn dựng lại theo từng request.
// Mọi lời gọi API bên trong đã dùng `cache: 'no-store'` (xem lib/api.ts) nên
// Next tự coi trang là động; đặt 0 ở đây chỉ để ý định rõ ràng, tránh người
// đọc sau tưởng còn ISR. Tải cho API vẫn được chặn bởi header s-maxage phía API.
export const revalidate = 0;

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const filters = parseFilters(searchParams);

  // Ngôn ngữ đọc thẳng từ URL: Server Component render sẵn đúng thứ tiếng, không
  // có cảnh chớp tiếng Việt rồi mới đổi. `lang` được truyền xuống mọi Client
  // Component bằng prop — chúng KHÔNG tự đọc searchParams cho việc này.
  const lang = parseLang(searchParams.lang);
  const tr = t(lang);

  // Gọi song song: danh sách + facets. Lỗi 1 bên không làm sập cả trang.
  const [jobsResult, facets] = await Promise.all([
    api.jobs(filters).catch(() => null),
    api.facets(filters).catch(() => null),
  ]);

  // `api.jobs` và `api.facets` đều có dữ liệu rỗng dự phòng nên KHÔNG BAO GIỜ
  // throw — nhánh này là code chết, giữ lại chỉ để TypeScript yên tâm.
  if (!jobsResult || !facets)
    return <EmptyState lang={lang} title="Không tải được dữ liệu" />;

  // Danh sách rỗng có hai nguyên nhân hoàn toàn khác nhau, và người dùng cần
  // biết mình đang gặp cái nào:
  //   • Bộ lọc quá hẹp -> tự nới lỏng là xong
  //   • API Render đang ngủ (dậy mất ~60 giây) -> chỉ cần chờ rồi tải lại
  // Chỉ hỏi /health khi thật sự rỗng, nên không tốn thêm request lúc bình thường.
  const apiAlive = jobsResult.data.length === 0 ? await api.isAlive() : true;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-950 px-6 py-10 text-white">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tr('heroTitle')}</h1>
        <p className="mt-2 max-w-2xl text-brand-100">{tr('heroBody')}</p>
        <p className="mt-4 text-sm text-brand-200">
          {tr('heroCount')}{' '}
          <strong className="text-white">{facets.total.toLocaleString('vi-VN')}</strong>{' '}
          {tr('heroCountSuffix')}
        </p>
      </section>

      <StatsBar facets={facets} lang={lang} />

      <Suspense fallback={<div className="skeleton h-10 w-full" />}>
        <SearchBar lang={lang} />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Suspense fallback={<div className="skeleton h-[600px] w-full rounded-xl" />}>
          <FilterSidebar facets={facets} lang={lang} />
        </Suspense>

        <div>
          {jobsResult.data.length === 0 ? (
            apiAlive ? (
              <EmptyState lang={lang} title={tr('emptyTitle')} hint={tr('emptyHint')} />
            ) : (
              <EmptyState lang={lang} title={tr('wakingTitle')} hint={tr('wakingHint')} />
            )
          ) : (
            <>
              <div className="space-y-3">
                {jobsResult.data.map((job) => (
                  <JobCard key={job.id} job={job} lang={lang} />
                ))}
              </div>
              <Suspense fallback={null}>
                <Pagination
                  page={jobsResult.meta.page}
                  totalPages={jobsResult.meta.totalPages}
                  total={jobsResult.meta.total}
                  lang={lang}
                />
              </Suspense>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
