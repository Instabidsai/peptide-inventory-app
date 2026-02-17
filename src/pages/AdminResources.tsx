import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { Plus, Pencil, Trash2, ExternalLink, Video, FileText, BookOpen, Folder, ChevronRight, ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type Resource = {
    id: string;
    title: string;
    description: string | null;
    type: string;
    url: string;
    content: string | null;
    link_button_text: string | null;
    theme_id: string | null;
    created_at: string;
    thumbnail_url?: string | null;
    is_featured?: boolean;
    duration?: number | null;
};

type Theme = {
    id: string;
    name: string;
    description: string | null;
    is_general?: boolean;
};

export default function AdminResources() {

    const [viewMode, setViewMode] = useState<'themes' | 'list'>('themes');
    const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
    const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);
    const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
    const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
    const [editingResource, setEditingResource] = useState<Resource | null>(null);
    const [deletingItem, setDeletingItem] = useState<{ id: string; name: string; type: 'theme' | 'resource' } | null>(null);

    const [resourceForm, setResourceForm] = useState({
        title: "",
        description: "",
        type: "article",
        url: "",
        content: "",
        link_button_text: "Open",
        theme_id: "none",
        thumbnail_url: "",
        is_featured: false,
        duration: ""
    });

    const [themeForm, setThemeForm] = useState({
        name: "",
        description: ""
    });

    const queryClient = useQueryClient();

    // Data Fetching
    const { data: themes, isLoading: loadingThemes } = useQuery({
        queryKey: ['resource-themes'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('resource_themes')
                .select('*')
                .order('name');
            if (error) throw error;
            return data as Theme[];
        }
    });

    const { data: resources, isLoading: loadingResources } = useQuery({
        queryKey: ['admin-resources'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('resources')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data as Resource[];
        }
    });

    // Mutations
    const upsertTheme = useMutation({
        mutationFn: async (data: { name: string; description: string }) => {
            if (editingTheme) {
                const { error } = await supabase.from('resource_themes').update(data).eq('id', editingTheme.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('resource_themes').insert([data]);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resource-themes'] });
            setIsThemeDialogOpen(false);
            setThemeForm({ name: "", description: "" });
            setEditingTheme(null);
            toast.success(editingTheme ? "Theme updated" : "Theme created");
        },
        onError: () => toast.error("Failed to save theme")
    });

    const deleteTheme = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('resource_themes').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resource-themes'] });
            toast.success("Theme deleted");
        },
        onError: (error) => {
            console.error("Delete theme error:", error);
            toast.error("Failed to delete theme: " + error.message);
        }
    });

    const upsertResource = useMutation({
        mutationFn: async (data: typeof resourceForm) => {
            const payload = {
                ...data,
                theme_id: data.theme_id === "none" ? null : data.theme_id,
                duration: data.duration ? parseInt(data.duration) : null
            };
            if (editingResource) {
                const { error } = await supabase.from('resources').update(payload).eq('id', editingResource.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('resources').insert([payload]);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-resources'] });
            setIsResourceDialogOpen(false);
            resetResourceForm();
            toast.success(editingResource ? "Resource updated" : "Resource created");
        },
        onError: (error) => {
            console.error("Upsert resource error:", error);
            toast.error("Failed to save resource: " + error.message);
        }
    });

    const deleteResource = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('resources').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-resources'] });
            toast.success("Resource deleted");
        },
        onError: (error) => {
            console.error("Delete resource error:", error);
            toast.error("Failed to delete resource: " + error.message);
        }
    });

    // Filtering & Logic
    const getResourceCount = (themeId: string | null) => {
        if (!resources) return 0;
        return resources.filter(r => r.theme_id === themeId).length;
    };

    const filteredResources = selectedTheme
        ? resources?.filter(r => (selectedTheme.id === 'general' ? r.theme_id === null : r.theme_id === selectedTheme.id))
        : [];

    // Handlers
    const handleCreateTheme = () => {
        setEditingTheme(null);
        setThemeForm({ name: "", description: "" });
        setIsThemeDialogOpen(true);
    };

    const handleEditTheme = (theme: Theme) => {
        if (theme.is_general) return;
        setEditingTheme(theme);
        setThemeForm({ name: theme.name, description: theme.description || "" });
        setIsThemeDialogOpen(true);
    };

    const resetResourceForm = () => {
        setResourceForm({
            title: "",
            description: "",
            type: "article",
            url: "",
            content: "",
            link_button_text: "Open",
            theme_id: selectedTheme && !selectedTheme.is_general ? selectedTheme.id : "none",
            thumbnail_url: "",
            is_featured: false,
            duration: ""
        });
        setEditingResource(null);
    };

    const handleCreateResource = () => {
        resetResourceForm();
        setIsResourceDialogOpen(true);
    };

    const handleEditResource = (resource: Resource) => {
        setEditingResource(resource);
        setResourceForm({
            title: resource.title,
            description: resource.description || "",
            type: resource.type || "article",
            url: resource.url,
            content: resource.content || "",
            link_button_text: resource.link_button_text || "Open",
            theme_id: resource.theme_id || "none",
            thumbnail_url: resource.thumbnail_url || "",
            is_featured: resource.is_featured || false,
            duration: resource.duration?.toString() || ""
        });
        setIsResourceDialogOpen(true);
    };

    const generalTheme: Theme = { id: 'general', name: 'General / Miscellaneous', description: 'Uncategorized resources', is_general: true };
    const allThemes = themes ? [generalTheme, ...themes] : [generalTheme];

    // Sync Logic
    const syncThemes = useMutation({
        mutationFn: async () => {
            // Fetch all active peptides
            const { data: peptides, error: pError } = await supabase.from('peptides').select('name').eq('active', true);
            if (pError) throw pError;
            if (!peptides || peptides.length === 0) return { created: 0 };

            // Fetch existing themes to avoid duplicates
            const { data: existingThemes, error: tError } = await supabase.from('resource_themes').select('name');
            if (tError) throw tError;

            const existingNames = new Set((existingThemes || []).map(t => t.name.toLowerCase()));

            // Filter to only new peptides not already in themes
            const newThemes = peptides
                .filter(p => !existingNames.has(p.name.toLowerCase()))
                .map(p => ({ name: p.name, description: `Resources related to ${p.name}` }));

            if (newThemes.length === 0) {
                return { created: 0, message: "All peptides already have themes" };
            }

            // Insert new themes
            const { error: insertError } = await supabase.from('resource_themes').insert(newThemes);
            if (insertError) throw insertError;

            return { created: newThemes.length };
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['resource-themes'] });
            if (result?.created === 0) {
                toast.info(result?.message || "No new themes to create");
            } else {
                toast.success(`Created ${result?.created} new theme(s)`);
            }
        },
        onError: (error) => {
            console.error("Sync themes error:", error);
            toast.error("Failed to sync themes");
        }
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {viewMode === 'list' && (
                        <Button variant="ghost" size="icon" aria-label="Back to themes" onClick={() => { setSelectedTheme(null); setViewMode('themes'); }} className="mr-2">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {viewMode === 'themes' ? 'Manage Themes' : selectedTheme?.name}
                        </h1>
                        <p className="text-muted-foreground">
                            {viewMode === 'themes'
                                ? 'Organize content into broad topics.'
                                : `Manage resources for ${selectedTheme?.name}.`}
                        </p>
                    </div>
                </div>

                {viewMode === 'themes' ? (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => syncThemes.mutate()} disabled={syncThemes.isPending}>
                            {syncThemes.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Sync Peptides
                        </Button>
                        <Button onClick={handleCreateTheme}>
                            <Plus className="mr-2 h-4 w-4" /> Add Theme
                        </Button>
                    </div>
                ) : (
                    <Button onClick={handleCreateResource}>
                        <Plus className="mr-2 h-4 w-4" /> Add Resource
                    </Button>
                )}
            </div>

            {/* View Switching */}
            {viewMode === 'themes' && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {loadingThemes ? (
                        <div className="col-span-full text-center py-8 text-muted-foreground">Loading themes...</div>
                    ) : (
                        allThemes.map((theme) => {
                            const count = getResourceCount(theme.is_general ? null : theme.id);
                            return (
                                <Card
                                    key={theme.id}
                                    className="group cursor-pointer hover:border-primary/50 transition-colors relative flex flex-col"
                                    onClick={() => { setSelectedTheme(theme); setViewMode('list'); }}
                                >
                                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                                <Folder className="h-6 w-6 text-primary" />
                                            </div>
                                        </div>
                                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                            {!theme.is_general && (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label="Edit theme"
                                                        className="h-8 w-8 hover:bg-muted"
                                                        onClick={() => handleEditTheme(theme)}
                                                        title="Edit Theme"
                                                    >
                                                        <Pencil className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label="Delete theme"
                                                        className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() => setDeletingItem({ id: theme.id, name: theme.name, type: 'theme' })}
                                                        title="Delete Theme"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-1">
                                        <CardTitle className="text-xl">{theme.name}</CardTitle>
                                        <CardDescription className="mt-1 line-clamp-2">
                                            {theme.description || `${count} resource(s)`}
                                        </CardDescription>
                                    </CardContent>
                                    <CardFooter className="pt-0 mt-auto">
                                        <Button variant="ghost" className="w-full justify-between group-hover:text-primary pl-0">
                                            Open Folder <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            )
                        })
                    )}
                </div>
            )}

            {viewMode === 'list' && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-in fade-in slide-in-from-right-4 duration-300">
                    {filteredResources?.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center p-8 border border-dashed rounded-lg bg-muted/20 text-center">
                            <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <h3 className="text-lg font-medium">No resources yet</h3>
                            <p className="text-sm text-muted-foreground mb-4">Add your first video or guide to this theme.</p>
                            <Button variant="outline" onClick={handleCreateResource}>Add Resource</Button>
                        </div>
                    ) : (
                        filteredResources?.map((resource) => {
                            let Icon = FileText;
                            if (resource.type === 'video') Icon = Video;
                            if (resource.type === 'guide') Icon = BookOpen;

                            return (
                                <Card key={resource.id} className="flex flex-col group">
                                    <CardHeader className="relative pb-2">
                                        <div className="flex justify-between items-start">
                                            <div className="p-2 bg-secondary rounded-lg">
                                                <Icon className="h-5 w-5 text-foreground" />
                                            </div>
                                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" aria-label="Edit resource" className="h-8 w-8" onClick={() => handleEditResource(resource)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" aria-label="Delete resource" className="h-8 w-8 hover:text-destructive" onClick={() => {
                                                    setDeletingItem({ id: resource.id, name: resource.title, type: 'resource' });
                                                }}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <CardTitle className="mt-4 line-clamp-1">{resource.title}</CardTitle>
                                        <CardDescription className="line-clamp-2 min-h-[40px]">
                                            {resource.description || 'No description provided.'}
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent className="flex-1">
                                        {/* Visual Preview Stub */}
                                        <div className="w-full h-32 bg-muted/30 rounded-lg flex items-center justify-center border border-dashed">
                                            {resource.type === 'video' ? (
                                                <div className="flex flex-col items-center text-muted-foreground">
                                                    <Video className="h-8 w-8 mb-2 opacity-50" />
                                                    <span className="text-xs">Video Content</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center text-muted-foreground">
                                                    <FileText className="h-8 w-8 mb-2 opacity-50" />
                                                    <span className="text-xs">Read Guide</span>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>

                                    <CardFooter className="pt-0 pb-4">
                                        <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
                                            <span>{new Date(resource.created_at).toLocaleDateString()}</span>
                                            <Badge variant="secondary" className="capitalize">{resource.type}</Badge>
                                        </div>
                                    </CardFooter>
                                </Card>
                            )
                        })
                    )}
                </div>
            )}

            {/* Theme Dialog */}
            <Dialog open={isThemeDialogOpen} onOpenChange={(open) => !open && setIsThemeDialogOpen(false)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingTheme ? 'Edit Theme' : 'Create New Theme'}</DialogTitle>
                        <DialogDescription>Create a folder to organize your resources.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="t-name">Theme Name</Label>
                            <Input
                                id="t-name"
                                value={themeForm.name}
                                onChange={(e) => setThemeForm({ ...themeForm, name: e.target.value })}
                                placeholder="e.g., BPC-157"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="t-desc">Description (Optional)</Label>
                            <Input
                                id="t-desc"
                                value={themeForm.description}
                                onChange={(e) => setThemeForm({ ...themeForm, description: e.target.value })}
                                placeholder="Short description..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsThemeDialogOpen(false)}>Cancel</Button>
                        <Button onClick={() => upsertTheme.mutate(themeForm)} disabled={!themeForm.name}>
                            {editingTheme ? 'Save Changes' : 'Create Theme'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isResourceDialogOpen} onOpenChange={(open) => { if (!open) resetResourceForm(); setIsResourceDialogOpen(open); }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingResource ? 'Edit Resource' : 'Create Resource'}</DialogTitle>
                        <DialogDescription>
                            {selectedTheme && !selectedTheme.is_general
                                ? `Adding content to ${selectedTheme.name}.`
                                : "Add educational content."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={(e) => { e.preventDefault(); upsertResource.mutate(resourceForm); }} className="space-y-4">
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="title">Title</Label>
                                <Input
                                    id="title"
                                    value={resourceForm.title}
                                    onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="type">Type</Label>
                                    <Select
                                        value={resourceForm.type}
                                        onValueChange={(val) => setResourceForm({ ...resourceForm, type: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="article">Article / Link</SelectItem>
                                            <SelectItem value="video">Video</SelectItem>
                                            <SelectItem value="guide">Internal Guide</SelectItem>
                                            <SelectItem value="pdf">PDF</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="theme">Theme</Label>
                                    <Select
                                        value={resourceForm.theme_id}
                                        onValueChange={(val) => setResourceForm({ ...resourceForm, theme_id: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select theme..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">General / Miscellaneous</SelectItem>
                                            {themes?.map((t) => (
                                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="description">Description (Short)</Label>
                                <Textarea
                                    id="description"
                                    value={resourceForm.description}
                                    onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
                                    rows={2}
                                />
                            </div>

                            {resourceForm.type === 'guide' ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="content">Guide Content (HTML)</Label>
                                    <Textarea
                                        id="content"
                                        className="font-mono text-sm"
                                        value={resourceForm.content}
                                        onChange={(e) => setResourceForm({ ...resourceForm, content: e.target.value })}
                                        rows={8}
                                        placeholder="<h1>Title</h1><p>Content...</p>"
                                    />
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    <Label htmlFor="url">URL</Label>
                                    <Input
                                        id="url"
                                        type="url"
                                        value={resourceForm.url}
                                        onChange={(e) => setResourceForm({ ...resourceForm, url: e.target.value })}
                                        placeholder="https://..."
                                    />
                                </div>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="btn_text">Button Text</Label>
                                <Input
                                    id="btn_text"
                                    value={resourceForm.link_button_text}
                                    onChange={(e) => setResourceForm({ ...resourceForm, link_button_text: e.target.value })}
                                    placeholder="e.g. Open"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="thumbnail">Thumbnail URL</Label>
                                    <Input
                                        id="thumbnail"
                                        value={resourceForm.thumbnail_url}
                                        onChange={(e) => setResourceForm({ ...resourceForm, thumbnail_url: e.target.value })}
                                        placeholder="https://..."
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="duration">Duration (Seconds)</Label>
                                    <Input
                                        id="duration"
                                        type="number"
                                        value={resourceForm.duration}
                                        onChange={(e) => setResourceForm({ ...resourceForm, duration: e.target.value })}
                                        placeholder="e.g. 120"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="is_featured"
                                    className="h-4 w-4 rounded border-gray-300"
                                    checked={resourceForm.is_featured}
                                    onChange={(e) => setResourceForm({ ...resourceForm, is_featured: e.target.checked })}
                                />
                                <Label htmlFor="is_featured">Feature this resource?</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsResourceDialogOpen(false)}>Cancel</Button>
                            <Button type="submit">{editingResource ? 'Save Changes' : 'Create'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Alert Dialog */}
            <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the {deletingItem?.type} "{deletingItem?.name}"
                            {deletingItem?.type === 'theme' && " and all associated resources"}.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (deletingItem?.type === 'theme') {
                                    deleteTheme.mutate(deletingItem.id);
                                } else if (deletingItem?.type === 'resource') {
                                    deleteResource.mutate(deletingItem.id);
                                }
                                setDeletingItem(null);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
