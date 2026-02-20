import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DashboardWidget } from '@/hooks/use-custom-dashboard';
import { BarChart3, Table2, Hash, List } from 'lucide-react';

const sizeClasses: Record<string, string> = {
  sm: 'col-span-1',
  md: 'col-span-1 md:col-span-2',
  lg: 'col-span-1 md:col-span-3',
  full: 'col-span-full',
};

const typeIcons: Record<string, React.ElementType> = {
  stat: Hash,
  chart: BarChart3,
  table: Table2,
  list: List,
};

function StatWidget({ config, orgId }: { config: Record<string, any>; orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-stat', orgId, config.query],
    queryFn: async () => {
      if (!config.query) return { value: '—' };
      const { data, error } = await supabase.rpc('run_readonly_query', {
        query_text: config.query,
        p_org_id: orgId,
      });
      if (error) return { value: 'Error' };
      const row = Array.isArray(data) ? data[0] : data;
      return { value: row?.value ?? row?.count ?? '—' };
    },
    enabled: !!config.query,
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-12 w-24" />;

  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-primary">{data?.value ?? '—'}</div>
      {config.subtitle && <p className="text-xs text-muted-foreground mt-1">{config.subtitle}</p>}
    </div>
  );
}

function TableWidget({ config, orgId }: { config: Record<string, any>; orgId: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['widget-table', orgId, config.query],
    queryFn: async () => {
      if (!config.query) return [];
      const { data, error } = await supabase.rpc('run_readonly_query', {
        query_text: config.query,
        p_org_id: orgId,
      });
      if (error) return [];
      return Array.isArray(data) ? data.slice(0, 10) : [];
    },
    enabled: !!config.query,
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data</p>;

  const columns = Object.keys(rows[0]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60">
            {columns.map(col => (
              <th key={col} className="text-left py-2 px-2 text-muted-foreground font-medium">
                {col.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: Record<string, any>, i: number) => (
            <tr key={i} className="border-b border-border/30">
              {columns.map(col => (
                <td key={col} className="py-1.5 px-2">{String(row[col] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListWidget({ config, orgId }: { config: Record<string, any>; orgId: string }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['widget-list', orgId, config.query],
    queryFn: async () => {
      if (!config.query) return [];
      const { data, error } = await supabase.rpc('run_readonly_query', {
        query_text: config.query,
        p_org_id: orgId,
      });
      if (error) return [];
      return Array.isArray(data) ? data.slice(0, 20) : [];
    },
    enabled: !!config.query,
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!items.length) return <p className="text-sm text-muted-foreground">No items</p>;

  const labelKey = config.label_field || Object.keys(items[0])[0];
  const valueKey = config.value_field || Object.keys(items[0])[1];

  return (
    <ul className="space-y-1.5">
      {items.map((item: Record<string, any>, i: number) => (
        <li key={i} className="flex items-center justify-between text-sm">
          <span>{String(item[labelKey] ?? '')}</span>
          {valueKey && <Badge variant="secondary">{String(item[valueKey] ?? '')}</Badge>}
        </li>
      ))}
    </ul>
  );
}

export function DynamicWidget({ widget }: { widget: DashboardWidget }) {
  const { profile } = useAuth();
  const orgId = profile?.org_id || '';
  const Icon = typeIcons[widget.widget_type] || Hash;

  return (
    <Card className={sizeClasses[widget.size] || 'col-span-1'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {widget.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {widget.widget_type === 'stat' && <StatWidget config={widget.config} orgId={orgId} />}
        {widget.widget_type === 'table' && <TableWidget config={widget.config} orgId={orgId} />}
        {widget.widget_type === 'list' && <ListWidget config={widget.config} orgId={orgId} />}
        {widget.widget_type === 'chart' && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Chart visualization coming soon
          </div>
        )}
      </CardContent>
    </Card>
  );
}
