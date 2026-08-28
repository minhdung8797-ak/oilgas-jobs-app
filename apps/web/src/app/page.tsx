import { Suspense } from 'react';
import type { Metadata } from 'next';
import { api, parseFilters } from '@/lib/api';
import { JobCard } from '@/components/JobCard';
import { FilterSidebar } from '@/components/FilterSidebar';
import { SearchBar } from '@/components/SearchBar';
import { Pagination } from '@/components/Pagination';
import { EmptyState } from '@/components/EmptyState';
import { StatsBar } from '@/components/StatsBar';

export const metadata: Metadata = {
  title: 'Việc làm dầu khí quốc tế',
  description:
    'Danh sách việc làm Reservoir, Petroleum, Production và Geoscience & Formation từ các nhà tuyển dụng dầu khí toàn cầu.',
};

// Trang render lại tối đa mỗi 60s (ISR) – cân bằng giữa độ tươi và chi phí.
export const revalidate = 60;

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const filters = parseFilters(searchParams);

  // Gọi song song: danh sách + facets. Lỗi 1 bên không làm sập cả trang.
  const [jobsResult, facets] = await Promise.all([
    api.jobs(filters).catch(() => null),
    api.facets(filters).catch(() => null),
  ]);

  if (!jobsResult || !facets) {
    return (
      <EmptyState
        title="Không kết nối được tới API"
        hint="Kiểm tra biến môi trường NEXT_PUBLIC_API_URL và đảm bảo backend đang chạy."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-950 px-6 py-10 text-white">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Việc làm dầu khí quốc tế, đã lọc sẵn cho bạn
        </h1>
        <p className="mt-2 max-w-2xl text-brand-100">
          Thu thập tự động từ Rigzone, SLB, Baker Hughes, Halliburton, Equinor và nhiều nguồn khác,
          rồi phân loại bằng NLP vào 4 nhóm: Reservoir · Petroleum · Production · Geoscience &amp; Formation.
        </p>
        <p className="mt-4 text-sm text-brand-200">
          Hiện có <strong className="text-white">{facets.total.toLocaleString('vi-VN')}</strong> vị trí đang mở.
        </p>
      </section>

      <StatsBar facets={facets} />

      <Suspense fallback={<div className="skeleton h-10 w-full" />}>
        <SearchBar />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Suspense fallback={<div className="skeleton h-[600px] w-full rounded-xl" />}>
          <FilterSidebar facets={facets} />
        </Suspense>

        <div>
          {jobsResult.data.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="space-y-3">
                {jobsResult.data.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
              <Suspense fallback={null}>
                <Pagination
                  page={jobsResult.meta.page}
                  totalPages={jobsResult.meta.totalPages}
                  total={jobsResult.meta.total}
                />
              </Suspense>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
