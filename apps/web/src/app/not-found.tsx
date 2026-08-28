import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card flex flex-col items-center px-6 py-20 text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <h2 className="mt-4 text-xl font-semibold">Không tìm thấy trang</h2>
      <p className="mt-2 text-sm text-slate-500">
        Việc làm có thể đã bị gỡ khỏi nguồn hoặc đường dẫn không đúng.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Về danh sách việc làm
      </Link>
    </div>
  );
}
