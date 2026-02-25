import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileBarChart } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const CHART_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

interface CustomReport {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  query_sql: string;
  chart_type: string | null;
  parameters: Record<string, any>;
  created_at: string;
}

export default function CustomReportView() {
  const { reportId } = useParams<{ reportId: string }>();
  const { profile } = useAuth();

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['custom-report', reportId],
    queryFn: async () => {
      if (!reportId || !profile?.org_id) return null;
      const { data, error } = await supabase
        .from('custom_reports')
        .select('*')
        .eq('id', reportId)
        .eq('org_id', profile.org_id)
        .maybeSingle();
      if (error) throw error;
      return data as CustomReport;
    },
    enabled: !!reportId && !!profile?.org_id,
  });

  const { data: rows = [], isLoading: dataLoading } = useQuery({
    queryKey: ['custom-report-data', reportId, profile?.org_id],
    queryFn: async () => {
      if (!report?.query_sql || !profile?.org_id) return [];
      const { data, error } = await supabase.rpc('run_readonly_query', {
        query_text: report.query_sql,
        p_org_id: profile.org_id,
      });
      if (error) return [];
      return Array.isArray(data) ? data : [];
    },
    enabled: !!report?.query_sql && !!profile?.org_id,
    staleTime: 60_000,
  });

  if (reportLoading) return <Skeleton className="h-64 w-full" />;

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileBarChart className="h-12 w-12 mb-4" />
        <p>Report not found</p>
      </div>
    );
  }

  const columns = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{report.name}</h2>
        {report.description && <p className="text-sm text-muted-foreground mt-1">{report.description}</p>}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Results</CardTitle>
            <Badge variant="secondary">{rows.length} rows</Badge>
          </div>
          {report.chart_type && (
            <CardDescription>Chart: {report.chart_type}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {dataLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !rows.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No data returned</p>
          ) : (
            <div className="space-y-6">
            {report.chart_type && rows.length > 0 && (() => {
              const keys = Object.keys(rows[0]);
              const labelKey = keys[0];
              const valueKeys = keys.filter(k => k !== labelKey && typeof rows[0][k] === 'number');
              if (!valueKeys.length) return null;
              const chartData = rows.map(row => {
                const entry: Record<string, any> = { [labelKey]: row[labelKey] };
                for (const vk of valueKeys) entry[vk] = Number(row[vk]) || 0;
                return entry;
              });
              const ct = report.chart_type;
              return (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {ct === 'pie' ? (
                      <PieChart>
                        <Pie data={chartData} dataKey={valueKeys[0]} nameKey={labelKey} cx="50%" cy="50%" outerRadius="70%" label={({ name }) => name}>
                          {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip /><Legend />
                      </PieChart>
                    ) : ct === 'line' ? (
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                        <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />{valueKeys.length > 1 && <Legend />}
                        {valueKeys.map((vk, i) => <Line key={vk} type="monotone" dataKey={vk} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />)}
                      </LineChart>
                    ) : ct === 'area' ? (
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                        <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />{valueKeys.length > 1 && <Legend />}
                        {valueKeys.map((vk, i) => <Area key={vk} type="monotone" dataKey={vk} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.2} />)}
                      </AreaChart>
                    ) : (
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                        <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />{valueKeys.length > 1 && <Legend />}
                        {valueKeys.map((vk, i) => <Bar key={vk} dataKey={vk} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />)}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              );
            })()}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {columns.map(col => (
                      <th key={col} className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap">
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: Record<string, any>, i: number) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                      {columns.map(col => (
                        <td key={col} className="py-2 px-3 whitespace-nowrap">
                          {String(row[col] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
