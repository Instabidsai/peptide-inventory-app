import { useCustomDashboard } from '@/hooks/use-custom-dashboard';
import { DynamicWidget } from './DynamicWidget';
import { Skeleton } from '@/components/ui/skeleton';

export function CustomDashboard() {
  const { data: widgets = [], isLoading } = useCustomDashboard();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  if (!widgets.length) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Custom Dashboard</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {widgets.map(widget => (
          <DynamicWidget key={widget.id} widget={widget} />
        ))}
      </div>
    </div>
  );
}
