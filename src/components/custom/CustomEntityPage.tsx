import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCustomEntities, useCustomEntityRecords, useCreateEntityRecord, useDeleteEntityRecord } from '@/hooks/use-custom-entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CustomEntityPage() {
  const { entitySlug } = useParams<{ entitySlug: string }>();
  const { data: entities = [], isLoading: entitiesLoading } = useCustomEntities();
  const entity = entities.find(e => e.slug === entitySlug);
  const entityId = entity?.id || '';
  const { data: records = [], isLoading: recordsLoading } = useCustomEntityRecords(entityId);
  const createRecord = useCreateEntityRecord(entityId);
  const deleteRecord = useDeleteEntityRecord(entityId);
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  if (entitiesLoading) return <Skeleton className="h-64 w-full" />;

  if (!entity) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Database className="h-12 w-12 mb-4" />
        <p>Entity not found: {entitySlug}</p>
      </div>
    );
  }

  const schemaFields: { name: string; label?: string; type?: string }[] =
    Array.isArray(entity.schema) ? entity.schema : (entity.schema?.fields || []);

  const handleCreate = async () => {
    try {
      await createRecord.mutateAsync(formData);
      setFormData({});
      setDialogOpen(false);
      toast({ title: 'Record created' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord.mutateAsync(id);
      toast({ title: 'Record deleted' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{entity.name}</h2>
          {entity.description && <p className="text-sm text-muted-foreground">{entity.description}</p>}
          <p className="text-xs text-muted-foreground">{records.length} records</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Record</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New {entity.name} Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {schemaFields.map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <Label>{f.label || f.name}</Label>
                  <Input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={formData[f.name] ?? ''}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      [f.name]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                    }))}
                    placeholder={f.label || f.name}
                  />
                </div>
              ))}
              {!schemaFields.length && (
                <p className="text-sm text-muted-foreground">
                  No schema defined. Records will store freeform JSON data.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createRecord.isPending}>
                {createRecord.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {recordsLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !records.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Database className="h-8 w-8 mb-3" />
            <p>No records yet. Click "Add Record" to create one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map(record => (
            <Card key={record.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {record.data?.name || record.data?.title || record.id.slice(0, 8)}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {new Date(record.created_at).toLocaleDateString()}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(record.id)}
                      disabled={deleteRecord.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {Object.entries(record.data || {}).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-muted-foreground">{key.replace(/_/g, ' ')}: </span>
                      <span>{String(value ?? '—')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
