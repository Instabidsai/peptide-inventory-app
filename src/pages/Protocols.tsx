
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, List, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const protocolSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
});

type ProtocolFormData = z.infer<typeof protocolSchema>;

export default function Protocols() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [protocols, setProtocols] = useState<any[]>([]); // Placeholder for data

    const form = useForm<ProtocolFormData>({
        resolver: zodResolver(protocolSchema),
        defaultValues: { name: '', description: '' },
    });

    const handleCreate = async (data: ProtocolFormData) => {
        // Placeholder for mutation
        console.log('Creating protocol:', data);
        setProtocols([...protocols, { id: crypto.randomUUID(), ...data, items_count: 0 }]);
        setIsCreateOpen(false);
        form.reset();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Protocols</h1>
                    <p className="text-muted-foreground">Manage peptide regimens and treatment plans</p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Protocol
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Protocol</DialogTitle>
                            <DialogDescription>Define a new regimen template.</DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Weight Loss Phase 1" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="Details about this protocol..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter>
                                    <Button type="submit">Create Protocol</Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {protocols.length === 0 ? (
                    <Card className="col-span-full border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                            <FlaskConical className="h-12 w-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">No protocols defined</p>
                            <p className="text-sm">Create your first protocol to get started</p>
                        </CardContent>
                    </Card>
                ) : (
                    protocols.map((protocol) => (
                        <Card key={protocol.id} className="hover:bg-muted/50 cursor-pointer transition-colors">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {protocol.name}
                                </CardTitle>
                                <List className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{protocol.items_count} Items</div>
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {protocol.description || 'No description'}
                                </p>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
