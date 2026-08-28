import { JobCardSkeleton } from '@/components/JobCard';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-10 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="skeleton h-[600px] rounded-xl" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <JobCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
