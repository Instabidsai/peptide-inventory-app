import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOrgFeatures, type ResolvedFeature } from '@/hooks/use-org-features';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  FEATURE_REGISTRY,
  type FeatureCategory,
} from '@/lib/feature-registry';
import {
  ToggleRight, Lock, Check, X, Eye,
  Sparkles, Package, ShoppingCart, Users2, Brain, BarChart3, Puzzle, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<FeatureCategory, React.ElementType> = {
  core: Shield,
  ai: Brain,
  inventory: Package,
  sales: ShoppingCart,
  partners: Users2,
  clients: Sparkles,
  finance: BarChart3,
  customization: Puzzle,
};

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'sales_rep', label: 'Sales Rep' },
  { value: 'fulfillment', label: 'Fulfillment' },
  { value: 'client', label: 'Client / Customer' },
];

export default function FeatureManagement() {
  const { features, toggleFeature, isLoaded } = useOrgFeatures();
  const { toast } = useToast();
  const [previewRole, setPreviewRole] = useState('admin');
  // super_admin sees everything admin sees
  const effectivePreviewRole = previewRole === 'super_admin' ? 'admin' : previewRole;

  const grouped = CATEGORY_ORDER.reduce<Record<string, ResolvedFeature[]>>((acc, cat) => {
    const items = features.filter((f) => f.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const handleToggle = async (key: string, enabled: boolean) => {
    try {
      await toggleFeature(key, enabled);
      const feature = features.find((f) => f.key === key);
      toast({
        title: enabled ? 'Feature enabled' : 'Feature disabled',
        description: `${feature?.label || key} has been ${enabled ? 'enabled' : 'disabled'}.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Failed to update',
        description: 'Could not save your changes. Please try again.',
      });
    }
  };

  // Role preview: which features would this role see?
  const previewFeatures = features.filter(
    (f) => f.enabled && f.roles.includes(effectivePreviewRole) && f.sidebarItems.length > 0,
  );
  const hiddenCount = features.filter(
    (f) => f.sidebarItems.length > 0 && (!f.enabled || !f.roles.includes(effectivePreviewRole)),
  ).length;

  if (!isLoaded) {
    return (
      <div className="space-y-6 p-1">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ToggleRight className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Feature Management</h1>
        </div>
        <p className="text-muted-foreground ml-12">
          Control which features are available to your team. Disabled features are hidden from the sidebar and inaccessible.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel: Feature toggles */}
        <div className="lg:col-span-2 space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            if (!items) return null;
            const Icon = CATEGORY_ICONS[cat];
            const isCore = cat === 'core';

            return (
              <Card key={cat} className={cn(isCore && 'border-primary/20 bg-primary/[0.02]')}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', isCore ? 'text-primary' : 'text-muted-foreground')} />
                    <CardTitle className="text-base">{CATEGORY_LABELS[cat]}</CardTitle>
                    {isCore && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        <Lock className="h-3 w-3 mr-1" />
                        Always On
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {items.map((feature) => (
                    <div
                      key={feature.key}
                      className={cn(
                        'flex items-center justify-between py-3 px-3 rounded-lg transition-colors',
                        feature.core
                          ? 'opacity-60'
                          : 'hover:bg-muted/50',
                      )}
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{feature.label}</span>
                          <div className="flex gap-1">
                            {feature.roles.slice(0, 3).map((r) => (
                              <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0">
                                {r === 'sales_rep' ? 'partner' : r}
                              </Badge>
                            ))}
                            {feature.roles.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{feature.roles.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {feature.description}
                        </p>
                      </div>
                      <Switch
                        checked={feature.enabled}
                        disabled={feature.core}
                        onCheckedChange={(checked) => handleToggle(feature.key, checked)}
                        aria-label={`Toggle ${feature.label}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Right panel: Role preview */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Role Preview</CardTitle>
              </div>
              <CardDescription>
                See what each role will have access to with current settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={previewRole} onValueChange={setPreviewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-1.5">
                {FEATURE_REGISTRY.filter((f) => f.sidebarItems.length > 0).map((f) => {
                  const resolved = features.find((rf) => rf.key === f.key);
                  const visible = resolved?.enabled && f.roles.includes(effectivePreviewRole);
                  return (
                    <div
                      key={f.key}
                      className={cn(
                        'flex items-center gap-2 py-1.5 px-2 rounded text-sm transition-colors',
                        visible ? 'text-foreground' : 'text-muted-foreground/40 line-through',
                      )}
                    >
                      {visible ? (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                      )}
                      <span>{f.label}</span>
                      {!resolved?.enabled && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">
                          off
                        </Badge>
                      )}
                      {resolved?.enabled && !f.roles.includes(effectivePreviewRole) && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">
                          no access
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{previewFeatures.length}</span> features visible
                  {hiddenCount > 0 && (
                    <> &middot; <span className="font-medium">{hiddenCount}</span> hidden</>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
