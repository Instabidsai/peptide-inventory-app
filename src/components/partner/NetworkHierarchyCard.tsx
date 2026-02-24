import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Network, Plus } from 'lucide-react';
import { NetworkTree } from './NetworkTree';
import type { PartnerNode, DownlineClient } from './types';

interface NetworkHierarchyCardProps {
    rootName: string;
    rootTier: string;
    rootProfileId: string | null;
    partners: PartnerNode[];
    clients: DownlineClient[];
    isLoading: boolean;
    onAddPerson: () => void;
}

export function NetworkHierarchyCard({
    rootName,
    rootTier,
    rootProfileId,
    partners,
    clients,
    isLoading,
    onAddPerson,
}: NetworkHierarchyCardProps) {
    return (
        <Card className="col-span-1">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                    <CardTitle>Network Hierarchy</CardTitle>
                    <CardDescription>Your team structure</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={onAddPerson}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                ) : (partners && partners.length > 0) || (clients && clients.length > 0) ? (
                    <NetworkTree
                        rootName={rootName}
                        rootTier={rootTier}
                        rootProfileId={rootProfileId}
                        partners={partners}
                        clients={clients}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Network className="h-8 w-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No partners or customers yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">Use "Add Person" to add customers to your network.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
