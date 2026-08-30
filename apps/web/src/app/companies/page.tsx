import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';

export const metadata: Metadata = {
  title: 'Nhà tuyển dụng dầu khí',
  description: 'Danh sách công ty dầu khí đang tuyển dụng: IOC, NOC, nhà thầu dịch vụ và EPC.',
};

// revalidate = 0: trang luôn dựng lại theo từng request.
// Mọi lời gọi API bên trong đã dùng `cache: 'no-store'` (xem lib/api.ts) nên
// Next tự coi trang là động; đặt 0 ở đây chỉ để ý định rõ ràng, tránh người
// đọc sau tưởng còn ISR. Tải cho API vẫn được chặn bởi header s-maxage phía API.
export const revalidate = 0;

const TYPE_LABEL: Record<string, string> = {
  IOC: 'Công ty dầu khí quốc tế',
  NOC: 'Công ty dầu khí quốc gia',
  SERVICE: 'Nhà thầu dịch vụ',
  EPC: 'EPC / Xây lắp',
  CONSULTANCY: 'Tư vấn',
  JOB_BOARD: 'Job board',
  OTHER: 'Khác',
};

export default async function CompaniesPage() {
  const companies = await api.companies().catch(() => null);
  if (!companies) return <EmptyState title="Không tải được danh sách công ty" hint="Kiểm tra kết nối API." />;

  const grouped = companies.reduce<Record<string, typeof companies>>((acc, c) => {
    (acc[c.type] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Nhà tuyển dụng</h1>
        <p className="mt-1 text-slate-500">
          {companies.length} công ty · {companies.reduce((s, c) => s + c.jobCount, 0).toLocaleString('vi-VN')} vị trí đang mở
        </p>
      </header>

      {Object.entries(grouped).map(([type, list]) => (
        <section key={type}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {TYPE_LABEL[type] ?? type}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <Link key={c.slug} href={`/?company=${c.slug}`} className="card flex items-center justify-between p-4">
                <span className="truncate font-medium">{c.name}</span>
                <span className="ml-3 shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  {c.jobCount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
