import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

const columnWidths = ["w-[30%]", "w-[15%]", "w-[20%]", "w-[15%]", "w-[10%]", "w-[10%]"];

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="space-y-1">
      {/* Header skeleton */}
      <div className="flex gap-4 px-4 py-3 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`h-${i}`}
            className={`h-3 rounded ${columnWidths[i % columnWidths.length]}`}
          />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex gap-4 px-4 py-3.5 border-b border-border/40"
          style={{ animationDelay: `${row * 75}ms` }}
        >
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton
              key={`${row}-${col}`}
              className={`h-4 rounded ${columnWidths[col % columnWidths.length]}`}
              style={{ animationDelay: `${(row * columns + col) * 50}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
