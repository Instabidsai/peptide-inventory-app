
import { useState } from "react";
import { useSupplements, Supplement } from "@/hooks/use-supplements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Plus, Pencil, Trash2, Pill, ExternalLink, Image as ImageIcon } from "lucide-react";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplementLinkedPeptides } from "@/components/supplements/SupplementLinkedPeptides";

export default function AdminSupplements() {
    const { supplements, isLoading, createSupplement, updateSupplement, deleteSupplement } = useSupplements();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Supplement | null>(null);

    const handleCreate = async (data: any) => {
        await createSupplement.mutateAsync(data);
        setIsCreateOpen(false);
    };

    const handleUpdate = async (data: any) => {
        if (!editingItem) return;
        await updateSupplement.mutateAsync({ ...data, id: editingItem.id });
        setEditingItem(null);
    };

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Supplements Catalog</h1>
                    <p className="text-muted-foreground">Manage supplements available for client protocols.</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> Add Supplement
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {supplements?.map((item) => (
                    { supplements?.map((item) => (
                        <Card key={item.id} className="overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
                            <div className="h-48 bg-white relative p-4 border-b">
                                {item.image_url ? (
                                    <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted/50 rounded-lg">
                                        <Pill className="h-12 w-12 opacity-20" />
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setEditingItem(item)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <DeleteConfirm onConfirm={() => deleteSupplement.mutate(item.id)} />
                                </div>
                            </div>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex justify-between items-start text-lg">
                                    {item.name}
                                </CardTitle>
                                <CardDescription className="line-clamp-2 min-h-[40px]">
                                    {item.description || "No description."}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 text-sm space-y-2">
                                <div className="flex justify-between py-1 border-b">
                                    <span className="text-muted-foreground">Default Dosage:</span>
                                    <span className="font-medium">{item.default_dosage || "N/A"}</span>
                                </div>
                                {item.purchase_link && (
                                    <a
                                        href={item.purchase_link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1 text-primary hover:underline pt-2 text-xs truncate"
                                    >
                                        <ExternalLink className="h-3 w-3" /> {item.purchase_link}
                                    </a>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                {supplements?.length === 0 && (
                    <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
                        <Pill className="mx-auto h-12 w-12 opacity-20 mb-2" />
                        <p>No supplements found. Create one to get started.</p>
                    </div>
                )}
            </div>

            <SupplementDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onSubmit={handleCreate}
                title="Add New Supplement"
            />

            <SupplementDialog
                open={!!editingItem}
                onOpenChange={(open) => !open && setEditingItem(null)}
                onSubmit={handleUpdate}
                initialData={editingItem || undefined}
                title="Edit Supplement"
            />
        </div>
    );
}

function SupplementDialog({ open, onOpenChange, onSubmit, initialData, title }: any) {
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        description: initialData?.description || '',
        image_url: initialData?.image_url || '',
        purchase_link: initialData?.purchase_link || '',
        default_dosage: initialData?.default_dosage || ''
    });

    // Reset when opening fresh
    // Note: simplifed for this context, real app might use useEffect to sync initialData

    const handleSubmit = () => {
        onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Enter the details for this supplement.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="details" className="mt-2">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="details">Details</TabsTrigger>
                        <TabsTrigger value="links" disabled={!initialData}>Linked Peptides</TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="pt-4 space-y-4">
                        <div className="grid gap-2">
                            <Label>Name</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Vitamin D3 + K2"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Brief description of benefits..."
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Image URL</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={formData.image_url}
                                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                    placeholder="https://..."
                                    className="flex-1"
                                />
                                {formData.image_url && <img src={formData.image_url} className="h-10 w-10 rounded object-cover border bg-white" onError={(e) => e.currentTarget.style.display = 'none'} />}
                            </div>
                            <p className="text-[10px] text-muted-foreground">Use Unsplash or direct image links for best results.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Def. Dosage</Label>
                                <Input
                                    value={formData.default_dosage}
                                    onChange={(e) => setFormData({ ...formData, default_dosage: e.target.value })}
                                    placeholder="e.g. 1 cap"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Purchase Link</Label>
                                <Input
                                    value={formData.purchase_link}
                                    onChange={(e) => setFormData({ ...formData, purchase_link: e.target.value })}
                                    placeholder="https://store..."
                                />
                            </div>
                        </div>
                        <DialogFooter className="mt-4">
                            <Button onClick={handleSubmit} disabled={!formData.name}>Save Details</Button>
                        </DialogFooter>
                    </TabsContent>

                    <TabsContent value="links" className="pt-4">
                        {initialData ? (
                            <SupplementLinkedPeptides supplementId={initialData.id} />
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                Save the supplement first to add links.
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirm({ onConfirm }: { onConfirm: () => void }) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive text-muted-foreground/50">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will delete the supplement from the catalog. It will not remove it from historical protocols.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
