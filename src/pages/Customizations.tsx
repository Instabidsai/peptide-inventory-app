import { usePageTitle } from '@/hooks/use-page-title';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCustomFields } from '@/hooks/use-custom-fields';
import { useCustomEntities } from '@/hooks/use-custom-entities';
import { useCustomDashboard } from '@/hooks/use-custom-dashboard';
import { useAutomations, useToggleAutomation, useDeleteAutomation } from '@/hooks/use-automations';
import { AiBuilderChat } from '@/components/custom/AiBuilderChat';
import { CustomDashboard } from '@/components/custom/CustomDashboard';
import { useNavigate } from 'react-router-dom';
import { Wand2, Database, LayoutDashboard, Zap, FileBarChart, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

function FieldsList() {
  const { data: fields = [], isLoading } = useCustomFields();

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!fields.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Database className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No custom fields yet. Use the AI Builder to create some.</p>
        </CardContent>
      </Card>
    );
  }

  const byEntity = fields.reduce((acc, f) => {
    (acc[f.entity] = acc[f.entity] || []).push(f);
    return acc;
  }, {} as Record<string, typeof fields>);

  return (
    <div className="space-y-4">
      {Object.entries(byEntity).map(([entity, entityFields]) => (
        <Card key={entity}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium capitalize">{entity}</CardTitle>
            <CardDescription>{entityFields.length} custom field{entityFields.length !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {entityFields.map(f => (
                <div key={f.id} className="flex items-center justify-between text-sm p-2 rounded bg-secondary/30">
                  <div>
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground ml-2">({f.field_name})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{f.field_type}</Badge>
                    {f.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EntitiesList() {
  const { data: entities = [], isLoading } = useCustomEntities();
  const navigate = useNavigate();

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!entities.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Database className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No custom entities yet. Use the AI Builder to create some.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {entities.map(e => (
        <Card key={e.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/custom/${e.slug}`)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="text-lg">{e.icon || '📦'}</span>
              {e.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {(Array.isArray(e.schema) ? e.schema.length : (e.schema?.fields?.length || 0))} fields defined
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AutomationsList() {
  const { data: automations = [], isLoading } = useAutomations();
  const toggleMutation = useToggleAutomation();
  const deleteMutation = useDeleteAutomation();
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!automations.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No automations yet. Use the AI Builder to create some.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {automations.map(a => (
        <Card key={a.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{a.name}</span>
                <Badge variant="secondary" className="text-xs">{a.trigger_type}</Badge>
                <Badge variant="outline" className="text-xs">{a.action_type}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Runs: {a.run_count} {a.last_run_at ? `· Last: ${new Date(a.last_run_at).toLocaleDateString()}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={a.active}
                onCheckedChange={(checked) => {
                  toggleMutation.mutate({ id: a.id, active: checked });
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  deleteMutation.mutate(a.id, {
                    onSuccess: () => toast({ title: 'Automation deleted' }),
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReportsList() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['custom-reports', profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) return [];
      const { data, error } = await supabase
        .from('custom_reports')
        .select('id, name, description, chart_type, created_at')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.org_id,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!reports.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <FileBarChart className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No custom reports yet. Use the AI Builder to create some.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map(r => (
        <Card key={r.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/reports/${r.id}`)}>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">{r.name}</p>
              {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              {r.chart_type && <Badge variant="secondary" className="text-xs">{r.chart_type}</Badge>}
              <Badge variant="outline" className="text-xs">
                {new Date(r.created_at).toLocaleDateString()}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Customizations() {
  usePageTitle('Customizations');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customizations</h1>
        <p className="text-muted-foreground">
          Use the AI Builder to customize your platform — add fields, create entities, build dashboards, and automate workflows.
        </p>
      </div>

      <Tabs defaultValue="builder" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="builder" className="gap-2">
            <Wand2 className="h-4 w-4" />
            AI Builder
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="fields" className="gap-2">
            <Database className="h-4 w-4" />
            Fields
          </TabsTrigger>
          <TabsTrigger value="entities" className="gap-2">
            <Database className="h-4 w-4" />
            Entities
          </TabsTrigger>
          <TabsTrigger value="automations" className="gap-2">
            <Zap className="h-4 w-4" />
            Automations
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileBarChart className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <AiBuilderChat />
        </TabsContent>

        <TabsContent value="dashboard">
          <CustomDashboard />
        </TabsContent>

        <TabsContent value="fields">
          <FieldsList />
        </TabsContent>

        <TabsContent value="entities">
          <EntitiesList />
        </TabsContent>

        <TabsContent value="automations">
          <AutomationsList />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
