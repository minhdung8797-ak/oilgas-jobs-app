import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { CompanyCategory, companyCategoryOf } from '@og/shared';
import {
  COMPANY_CATEGORY_HINT_I18N,
  COMPANY_CATEGORY_I18N,
  COMPANY_TYPE_I18N,
  parseLang,
  t,
} from '@/lib/i18n';

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

  // Gom hai tầng: nhóm lớn (Operator / Service) -> loại cụ thể (IOC, NOC, EPC…).
  //
  // Trước đây trang này chỉ có một tầng là loại cụ thể, nên bảy nhóm nằm ngang
  // hàng nhau và người đọc phải tự biết IOC với NOC là cùng một phía, còn EPC
  // với CONSULTANCY là phía kia. Tầng trên làm rõ điều đó ngay.
  const grouped = companies.reduce<Record<string, Record<string, typeof companies>>>((acc, c) => {
    const category = companyCategoryOf(c.type);
    ((acc[category] ??= {})[c.type] ??= []).push(c);
    return acc;
  }, {});

  // Thứ tự cố định, không theo số lượng — xem ghi chú ở facet bên API.
  const categoryOrder = [
    CompanyCategory.OPERATOR,
    CompanyCategory.SERVICE_PROVIDER,
    CompanyCategory.OTHER,
  ].filter((c) => grouped[c]) as CompanyCategory[];

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

      {categoryOrder.map((category) => {
        const byType = grouped[category];
        const total = Object.values(byType).reduce((s, l) => s + l.length, 0);
        return (
          <section key={category} className="space-y-5">
            <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
              <h2 className="text-lg font-bold tracking-tight">
                {COMPANY_CATEGORY_I18N[category]?.[lang] ?? category}
              </h2>
              <p className="text-sm text-slate-500">
                {COMPANY_CATEGORY_HINT_I18N[category]?.[lang]} · {total} {tr('companiesCount')}
              </p>
            </div>

            {Object.entries(byType).map(([type, list]) => (
              <div key={type}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {COMPANY_TYPE_I18N[type]?.[lang] ?? type}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((c) => (
                    // Kèm `lang` vào link để người đang đọc bản tiếng Anh không
                    // bị rơi ngược về tiếng Việt khi bấm sang trang danh sách.
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
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
