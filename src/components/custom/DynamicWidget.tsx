import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DashboardWidget } from '@/hooks/use-custom-dashboard';
import { BarChart3, Table2, Hash, List } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

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
      const { data: result, error } = await supabase.rpc('run_readonly_query', {
        query_text: config.query,
        p_org_id: orgId,
      });
      if (error) return { value: 'Error' };
      const row = Array.isArray(result) ? result[0] : result;
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

const CHART_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

function ChartWidget({ config, orgId }: { config: Record<string, any>; orgId: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['widget-chart', orgId, config.query],
    queryFn: async () => {
      if (!config.query) return [];
      const { data, error } = await supabase.rpc('run_readonly_query', {
        query_text: config.query,
        p_org_id: orgId,
      });
      if (error) return [];
      return Array.isArray(data) ? data.slice(0, 50) : [];
    },
    enabled: !!config.query,
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data</p>;

  const keys = Object.keys(rows[0]);
  const labelKey = config.label_field || keys[0];
  const valueKeys = config.value_fields
    ? (Array.isArray(config.value_fields) ? config.value_fields : [config.value_fields])
    : keys.filter(k => k !== labelKey && typeof rows[0][k] === 'number');
  // Ensure numeric values
  const chartData = rows.map(row => {
    const entry: Record<string, any> = { [labelKey]: row[labelKey] };
    for (const vk of valueKeys) entry[vk] = Number(row[vk]) || 0;
    return entry;
  });

  const chartType = config.chart_type || 'bar';

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'pie' ? (
          <PieChart>
            <Pie data={chartData} dataKey={valueKeys[0]} nameKey={labelKey} cx="50%" cy="50%" outerRadius="70%" label={({ name }) => name}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        ) : chartType === 'line' ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <Tooltip />
            {valueKeys.length > 1 && <Legend />}
            {valueKeys.map((vk: string, i: number) => (
              <Line key={vk} type="monotone" dataKey={vk} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : chartType === 'area' ? (
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <Tooltip />
            {valueKeys.length > 1 && <Legend />}
            {valueKeys.map((vk: string, i: number) => (
              <Area key={vk} type="monotone" dataKey={vk} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.2} />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <Tooltip />
            {valueKeys.length > 1 && <Legend />}
            {valueKeys.map((vk: string, i: number) => (
              <Bar key={vk} dataKey={vk} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
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
        {widget.widget_type === 'chart' && <ChartWidget config={widget.config} orgId={orgId} />}
      </CardContent>
    </Card>
  );
}
