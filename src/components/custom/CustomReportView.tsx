import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileBarChart } from 'lucide-react';

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
        .single();
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
            <CardDescription>Chart: {report.chart_type} (visualization coming soon)</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {dataLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !rows.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No data returned</p>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
