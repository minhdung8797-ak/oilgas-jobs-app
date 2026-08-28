'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-20 text-center">
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Đã có lỗi xảy ra</h2>
      <p className="mt-2 max-w-lg text-sm text-slate-500">
        {error.message || 'Không tải được dữ liệu. Vui lòng thử lại.'}
      </p>
      <button onClick={reset} className="btn-primary mt-6">
        Thử lại
      </button>
    </div>
  );
}
