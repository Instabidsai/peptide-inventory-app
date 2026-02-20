import { useCustomFields, useCustomFieldValues, useSaveCustomFieldValue } from '@/hooks/use-custom-fields';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';

interface CustomFieldsSectionProps {
  entity: string;
  recordId: string;
  editable?: boolean;
}

export function CustomFieldsSection({ entity, recordId, editable = true }: CustomFieldsSectionProps) {
  const { data: fields = [], isLoading: fieldsLoading } = useCustomFields(entity);
  const { data: values = {}, isLoading: valuesLoading } = useCustomFieldValues(entity, recordId);
  const saveMutation = useSaveCustomFieldValue();
  const [localValues, setLocalValues] = useState<Record<string, any>>({});

  useEffect(() => {
    setLocalValues(values);
  }, [values]);

  if (fieldsLoading || valuesLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (!fields.length) return null;

  const handleChange = (fieldId: string, fieldName: string, value: any) => {
    setLocalValues(prev => ({ ...prev, [fieldName]: value }));
    saveMutation.mutate({ fieldId, recordId, value });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Custom Fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map(field => {
          const currentValue = localValues[field.field_name] ?? '';

          return (
            <div key={field.id} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>

              {field.field_type === 'text' && (
                <Input
                  value={String(currentValue)}
                  onChange={e => handleChange(field.id, field.field_name, e.target.value)}
                  disabled={!editable}
                  placeholder={field.label}
                />
              )}

              {field.field_type === 'number' && (
                <Input
                  type="number"
                  value={currentValue}
                  onChange={e => handleChange(field.id, field.field_name, Number(e.target.value))}
                  disabled={!editable}
                />
              )}

              {field.field_type === 'boolean' && (
                <Switch
                  checked={!!currentValue}
                  onCheckedChange={v => handleChange(field.id, field.field_name, v)}
                  disabled={!editable}
                />
              )}

              {field.field_type === 'date' && (
                <Input
                  type="date"
                  value={String(currentValue)}
                  onChange={e => handleChange(field.id, field.field_name, e.target.value)}
                  disabled={!editable}
                />
              )}

              {field.field_type === 'select' && (
                <Select
                  value={String(currentValue)}
                  onValueChange={v => handleChange(field.id, field.field_name, v)}
                  disabled={!editable}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${field.label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options?.choices || []).map((opt: string) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {field.field_type === 'url' && (
                <Input
                  type="url"
                  value={String(currentValue)}
                  onChange={e => handleChange(field.id, field.field_name, e.target.value)}
                  disabled={!editable}
                  placeholder="https://..."
                />
              )}

              {field.field_type === 'email' && (
                <Input
                  type="email"
                  value={String(currentValue)}
                  onChange={e => handleChange(field.id, field.field_name, e.target.value)}
                  disabled={!editable}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
