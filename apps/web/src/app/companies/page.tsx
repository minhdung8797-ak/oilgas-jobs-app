import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { COMPANY_TYPE_I18N, parseLang, t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Nhà tuyển dụng dầu khí',
  description: 'Danh sách công ty dầu khí đang tuyển dụng: IOC, NOC, nhà thầu dịch vụ và EPC.',
};

// revalidate = 0: trang luôn dựng lại theo từng request.
// Mọi lời gọi API bên trong đã dùng `cache: 'no-store'` (xem lib/api.ts) nên
// Next tự coi trang là động; đặt 0 ở đây chỉ để ý định rõ ràng, tránh người
// đọc sau tưởng còn ISR. Tải cho API vẫn được chặn bởi header s-maxage phía API.
export const revalidate = 0;

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const lang = parseLang(searchParams.lang);
  const tr = t(lang);

  const companies = await api.companies().catch(() => null);
  if (!companies)
    return (
      <EmptyState lang={lang} title="Không tải được danh sách công ty" hint="Kiểm tra kết nối API." />
    );

  // Danh sách rỗng trước đây rơi vào nhánh dựng trang bình thường và cho ra một
  // trang chỉ có tiêu đề với số 0 — trông như lỗi. Hiện thông báo rõ ràng hơn.
  if (companies.length === 0) return <EmptyState lang={lang} />;

  const grouped = companies.reduce<Record<string, typeof companies>>((acc, c) => {
    (acc[c.type] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{tr('employers')}</h1>
        <p className="mt-1 text-slate-500">
          {companies.length} {tr('companiesCount')} ·{' '}
          {companies.reduce((s, c) => s + c.jobCount, 0).toLocaleString('vi-VN')}{' '}
          {tr('openPositions')}
        </p>
      </header>

      {Object.entries(grouped).map(([type, list]) => (
        <section key={type}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {COMPANY_TYPE_I18N[type]?.[lang] ?? type}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              // Kèm `lang` vào link để người đang đọc bản tiếng Anh không bị
              // rơi ngược về tiếng Việt khi bấm sang trang danh sách.
              <Link
                key={c.slug}
                href={`/?company=${c.slug}${lang === 'en' ? '&lang=en' : ''}`}
                className="card flex items-center justify-between p-4"
              >
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
