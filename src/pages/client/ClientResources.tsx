import { useState, useCallback, useMemo } from "react";
import DOMPurify from "dompurify";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import {
    Loader2, ArrowLeft, BookOpen, Video, ExternalLink, MessageSquare, Send,
    Search, Play, ChevronRight, Eye, Clock, FileText, Download, Users,
    FlaskConical, Atom
} from "lucide-react";
import { useClientProfile } from "@/hooks/use-client-profile";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { EmptyResourceState } from "@/components/resources/EmptyResourceState";

type Resource = {
    id: string;
    title: string;
    description: string | null;
    type: string;
    url: string;
    content: string | null;
    link_button_text: string | null;
    created_at: string;
    theme_id: string | null;
    thumbnail_url?: string | null;
    view_count?: number;
    duration?: number | null;
    is_featured?: boolean;
};

type Comment = {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
};

type Theme = {
    id: string;
    name: string;
    description: string | null;
};

type DiscussionTopic = {
    id: string;
    title: string;
    message_count: number;
    last_activity_at: string;
};

export default function ClientResources() {
    const { data: profile } = useClientProfile();
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [viewMode, setViewMode] = useState<'library' | 'topic'>('library');
    const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
    const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<'videos' | 'articles' | 'pdfs' | 'guides'>('videos');
    const [topicTab, setTopicTab] = useState<'overview' | 'research' | 'videos' | 'guides' | 'discussion'>('overview');

    // Pagination & Sort State
    const [visibleUploads, setVisibleUploads] = useState(4);
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [showAllThemes, setShowAllThemes] = useState(false);
    const [showAllPopular, setShowAllPopular] = useState(false);

    // Fetch Themes
    const { data: themes, isLoading: loadingThemes } = useQuery({
        queryKey: ['client-resource-themes'],
        queryFn: async () => {
            const { data, error } = await supabase.from('resource_themes').select('*').order('name');
            if (error) throw error;
            return data as Theme[];
        }
    });

    // Fetch Resources
    const { data: resources, isLoading: loadingResources } = useQuery({
        queryKey: ['client-resources', profile?.id, sortOrder],
        // Run query even if profile is null (admin view/public view), just don't filter by user ID if no profile
        queryFn: async () => {
            let query = supabase.from('resources').select('*');

            if (profile?.id) {
                query = query.or(`contact_id.is.null,contact_id.eq.${profile.id}`);
            } else {
                query = query.is('contact_id', null);
            }

            const { data, error } = await query.order('is_featured', { ascending: false }).order('created_at', { ascending: sortOrder === 'oldest' });
            if (error) throw error;
            return data as Resource[];
        },
    });

    // Fetch Discussion Topics
    const { data: discussionTopics } = useQuery({
        queryKey: ['discussion-topics-preview'],
        queryFn: async () => {
            try {
                const { data, error } = await supabase.from('discussion_topics')
                    .select('id, title, message_count, last_activity_at')
                    .order('last_activity_at', { ascending: false }).limit(3);
                if (error) return [];
                return data as DiscussionTopic[];
            } catch { return []; }
        }
    });

    const isLoading = loadingThemes || loadingResources;
    const displayThemes = showAllThemes ? (themes || []) : (themes?.slice(0, 6) || []);

    // Reset pagination when tab changes
    const handleTabChange = (tab: typeof activeTab) => {
        setActiveTab(tab);
        setVisibleUploads(4);
    };

    // Toggle Sort
    const toggleSort = () => {
        setSortOrder(prev => {
            const next = prev === 'newest' ? 'oldest' : 'newest';
            toast.info(`Sorting by ${next}`);
            return next;
        });
    };

    const getResourceCount = useCallback((themeId: string | null) => {
        if (!resources) return 0;
        return resources.filter(r => r.theme_id === themeId).length;
    }, [resources]);

    const topicResources = useMemo(() => {
        if (!resources || !selectedTheme) return [];
        return resources.filter(r => r.theme_id === selectedTheme.id);
    }, [resources, selectedTheme]);

    const featuredResource = useMemo(() => {
        if (!resources) return null;
        return resources.find(r => r.is_featured) || resources.find(r => r.type === 'video') || resources[0];
    }, [resources]);

    // Filter resources by search query
    const filteredResources = useMemo(() => {
        if (!resources) return [];
        if (!searchQuery.trim()) return resources;
        const q = searchQuery.toLowerCase();
        return resources.filter(r =>
            r.title.toLowerCase().includes(q) ||
            (r.description && r.description.toLowerCase().includes(q))
        );
    }, [resources, searchQuery]);

    const popularResources = useMemo(() => {
        if (!filteredResources.length) return [];
        return [...filteredResources].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    }, [filteredResources]);


    const getLatestByType = (type: string) => {
        if (!filteredResources.length) return [];
        return filteredResources.filter(r => r.type === type);
    };

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const formatTimeAgo = (dateStr: string) => {
        const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return `${Math.floor(diffMins / 1440)}d ago`;
    };

    if (isLoading) {
        return <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-6 pb-8">
            {viewMode === 'library' && (
                <>
                    {/* ===== HEADER ===== */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30">
                                <Atom className="h-6 w-6 text-emerald-400" />
                            </div>
                            <h1 className="text-xl font-bold">Research Library</h1>
                        </div>
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                            <Input
                                aria-label="Search resources"
                                placeholder="Search peptides, studies, videos..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-11 bg-card/50 border-input rounded-full text-sm h-11 shadow-inset"
                            />
                        </div>
                    </div>

                    {/* ===== FEATURED BANNER ===== */}
                    {featuredResource && (
                        <div
                            className="relative rounded-2xl overflow-hidden cursor-pointer group"
                            style={{
                                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 78, 59, 0.2) 100%)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                boxShadow: '0 0 40px rgba(16, 185, 129, 0.1)'
                            }}
                            onClick={() => setSelectedResource(featuredResource)}
                        >
                            <div className="grid md:grid-cols-2 gap-0">
                                <div className="p-6 md:p-8 flex flex-col justify-center">
                                    <p className="text-emerald-400 text-sm font-medium mb-2">Featured Research</p>
                                    <h2 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">
                                        {featuredResource.title}
                                    </h2>
                                    <p className="text-muted-foreground/70 text-sm mb-5 line-clamp-2">
                                        {featuredResource.description || "Tap to view this resource."}
                                    </p>
                                    <button className="w-fit px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-full text-sm transition-colors">
                                        Watch Now
                                    </button>
                                </div>
                                <div className="relative aspect-video md:aspect-auto min-h-[200px] bg-gradient-to-br from-card to-background flex items-center justify-center">
                                    {featuredResource.thumbnail_url ? (
                                        <img src={featuredResource.thumbnail_url} alt={featuredResource.title || 'Featured resource'} className="w-full h-full object-cover opacity-80" />
                                    ) : (
                                        <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
                                            <Play className="h-10 w-10 text-white ml-1" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ===== BROWSE BY TOPIC ===== */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Browse by Topic</h2>
                            <button
                                onClick={() => setShowAllThemes(!showAllThemes)}
                                className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                            >
                                {showAllThemes ? "Show Less" : "View All"} <ChevronRight className={`h-4 w-4 transition-transform ${showAllThemes ? 'rotate-90' : ''}`} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {displayThemes.map((theme, i) => {
                                const count = getResourceCount(theme.id);
                                return (
                                    <div
                                        key={theme.id}
                                        onClick={() => { setSelectedTheme(theme); setViewMode('topic'); }}
                                        className="relative group cursor-pointer transition-transform hover:-translate-y-1"
                                        style={{ height: '140px' }}
                                    >
                                        {/* Glow Effect */}
                                        <div
                                            className="absolute inset-0 bg-emerald-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
                                        />

                                        {/* Border Container (Gradient) */}
                                        <div
                                            className="absolute inset-0 p-[1px] transition-all"
                                            style={{
                                                clipPath: 'polygon(0 0, 40% 0, 45% 24px, 100% 24px, 100% 100%, 0 100%)',
                                                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.4) 0%, rgba(6, 78, 59, 0.1) 100%)'
                                            }}
                                        >
                                            {/* Inner Content (Dark Background) */}
                                            <div
                                                className="w-full h-full relative overflow-hidden"
                                                style={{
                                                    clipPath: 'polygon(0 0, 40% 0, 45% 24px, 100% 24px, 100% 100%, 0 100%)',
                                                    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%)',
                                                    backdropFilter: 'blur(10px)'
                                                }}
                                            >
                                                {/* Circuit Pattern Overlay */}
                                                <div className="absolute inset-0 opacity-10"
                                                    style={{
                                                        backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.5) 1px, transparent 1px)',
                                                        backgroundSize: '20px 20px'
                                                    }}
                                                />

                                                <div className="relative p-5 h-full flex flex-col justify-center">
                                                    <div className="flex items-center gap-4">
                                                        {/* Icon */}
                                                        {/* Using specific icons for known themes or generic flask */}
                                                        {theme.name.includes("BPC") ? <div className="text-emerald-400"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></div> :
                                                            theme.name.includes("TB-500") ? <div className="text-emerald-400"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg></div> :
                                                                theme.name.includes("GHK") ? <div className="text-emerald-400"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 9.5V5.25a.75.75 0 0 1 .75-.75H9.5"></path><path d="M19.5 14.5v4.25a.75.75 0 0 1-.75.75H14.5"></path><path d="M9.5 9.5 4.5 14.5"></path><path d="M14.5 9.5 19.5 4.5"></path><path d="M16 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8Z"></path></svg></div> :
                                                                    <div className="text-emerald-400"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31"></path><path d="M14 9.3V1.99"></path><path d="M8.5 2h7"></path><path d="M14 9.3a6.5 6.5 0 1 1-4 0"></path><path d="M5.52 16h12.96"></path></svg></div>}

                                                        <div className="flex-1 min-w-0 z-10">
                                                            <h3 className="text-xl font-bold text-white mb-2 leading-none">
                                                                {theme.name}
                                                            </h3>
                                                            <span className="inline-block px-3 py-1 text-xs font-bold rounded-full bg-emerald-500 text-white shadow shadow-emerald-500/20">
                                                                {count} Resources
                                                            </span>
                                                            <p className="text-[10px] text-muted-foreground/70 mt-2 line-clamp-2 leading-tight max-w-[90%]">
                                                                {theme.description || `Regenerative peptide for tissue repair and gut health.`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ===== POPULAR RESOURCES ===== */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Popular Resources</h2>
                            <button
                                onClick={() => setShowAllPopular(!showAllPopular)}
                                className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                            >
                                {showAllPopular ? "Show Less" : "View All"} <ChevronRight className={`h-4 w-4 transition-transform ${showAllPopular ? 'rotate-90' : ''}`} />
                            </button>
                        </div>
                        <ScrollArea className="w-full">
                            <div className={`flex gap-4 pb-4 ${showAllPopular ? 'flex-wrap' : ''}`}>
                                {(popularResources.length > 0 ? (showAllPopular ? popularResources : popularResources.slice(0, 4)) : []).map((resource) => (
                                    <div
                                        key={resource.id}
                                        onClick={() => popularResources.length > 0 && setSelectedResource(resource as Resource)}
                                        className="shrink-0 w-[220px] rounded-xl p-3 cursor-pointer transition-all hover:bg-card/50"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.5) 0%, rgba(17, 24, 39, 0.8) 100%)',
                                            border: '1px solid rgba(75, 85, 99, 0.3)'
                                        }}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 rounded-lg bg-card/30 shrink-0">
                                                {resource.type === 'video' ? <Video className="h-4 w-4 text-muted-foreground/70" /> :
                                                    resource.type === 'pdf' ? <Download className="h-4 w-4 text-muted-foreground/70" /> :
                                                        <FileText className="h-4 w-4 text-muted-foreground/70" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                                                    {resource.type}
                                                </span>
                                                <h4 className="text-sm font-semibold text-white mt-0.5 line-clamp-2 leading-snug">
                                                    {resource.title}
                                                </h4>
                                                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/50">
                                                    <span className="text-emerald-400">Author/Source</span>
                                                    <span className="flex items-center gap-1">
                                                        <Eye className="h-3 w-3" /> {resource.view_count || 0}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </div>

                    {/* ===== BOTTOM SECTION ===== */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Latest Uploads */}
                        <div className="rounded-xl p-4" style={{ background: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(75, 85, 99, 0.3)' }}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-emerald-400" />
                                    <h3 className="font-semibold">Latest Uploads</h3>
                                </div>
                                {/* Clean Tabs without background container */}
                                <div className="flex gap-2">
                                    {(['videos', 'articles', 'pdfs', 'guides'] as const).map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => handleTabChange(tab)}
                                            className={`px-3 py-1 text-xs rounded-full capitalize transition-all ${activeTab === tab
                                                ? 'bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-500/20'
                                                : 'text-muted-foreground/70 hover:text-white bg-card/30'
                                                }`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1">
                                {getLatestByType(activeTab === 'articles' ? 'article' : activeTab === 'pdfs' ? 'pdf' : activeTab === 'videos' ? 'video' : 'guide')
                                    .slice(0, visibleUploads)
                                    .map(resource => (
                                        <button
                                            key={resource.id}
                                            onClick={() => setSelectedResource(resource)}
                                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-card/50 transition-colors text-left group"
                                        >
                                            <div className="p-1.5 rounded-lg bg-emerald-500/20">
                                                <Play className="h-3 w-3 text-emerald-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{resource.title}</p>
                                                <p className="text-[11px] text-muted-foreground/50">Uploaded {formatDate(resource.created_at)}</p>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-emerald-400 transition-colors" />
                                        </button>
                                    ))}
                                {getLatestByType(activeTab === 'articles' ? 'article' : activeTab === 'pdfs' ? 'pdf' : activeTab === 'videos' ? 'video' : 'guide').length === 0 && (
                                    <p className="text-sm text-muted-foreground/50 text-center py-6">No {activeTab} uploaded yet.</p>
                                )}
                            </div>
                            {getLatestByType(activeTab === 'articles' ? 'article' : activeTab === 'pdfs' ? 'pdf' : activeTab === 'videos' ? 'video' : 'guide').length > visibleUploads && (
                                <button
                                    onClick={() => setVisibleUploads(prev => prev + 4)}
                                    className="w-full mt-3 py-2.5 text-sm font-medium text-muted-foreground bg-card/50 hover:bg-card hover:text-white rounded-lg transition-all"
                                >
                                    Load More
                                </button>
                            )}
                        </div>

                        {/* Join Discussion + Active Topics */}
                        <div className="space-y-4">
                            <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 78, 59, 0.2) 100%)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                <h3 className="font-semibold mb-3">Join Discussion</h3>
                                <button
                                    onClick={() => navigate('/community')}
                                    className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-white font-medium rounded-full text-sm transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
                                >
                                    <Users className="h-4 w-4" />
                                    Join Community Forum
                                </button>
                            </div>

                            <div className="rounded-xl p-4" style={{ background: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(75, 85, 99, 0.3)' }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <MessageSquare className="h-4 w-4 text-emerald-400" />
                                    <h3 className="font-semibold">Active Topics</h3>
                                </div>
                                <div className="space-y-1">
                                    {discussionTopics && discussionTopics.length > 0 ? (
                                        discussionTopics.map(topic => (
                                            <button
                                                key={topic.id}
                                                onClick={() => navigate('/community')}
                                                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-card/50 transition-colors text-left group"
                                            >
                                                <div className="p-1.5 rounded-lg bg-emerald-500/20">
                                                    <MessageSquare className="h-3 w-3 text-emerald-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{topic.title}</p>
                                                    <p className="text-[11px] text-muted-foreground/50">
                                                        {topic.message_count} replies • {formatTimeAgo(topic.last_activity_at)}
                                                    </p>
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-emerald-400 transition-colors" />
                                            </button>
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground/50 py-4 text-center">No discussions yet. Start one in the Community Forum!</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ===== TOPIC VIEW ===== */}
            {viewMode === 'topic' && selectedTheme && (
                <>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setSelectedTheme(null); setViewMode('library'); }} className="p-2 rounded-lg hover:bg-card transition-colors">
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold">{selectedTheme.name} Resources</h1>
                                <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    {topicResources.length} Resources
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={toggleSort}
                            className="px-3 py-1.5 text-sm border border-input rounded-lg hover:bg-card/50 transition-colors flex items-center gap-2"
                        >
                            Filter <ChevronRight className={`h-4 w-4 transition-transform ${sortOrder === 'oldest' ? '-rotate-90' : 'rotate-90'}`} />
                        </button>
                    </div>

                    {/* Topic Tabs */}
                    <div className="flex gap-1 bg-card/50 rounded-lg p-1 w-fit">
                        {(['overview', 'research', 'videos', 'guides', 'discussion'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setTopicTab(tab)}
                                className={`px-4 py-2 text-sm rounded-lg capitalize transition-all ${topicTab === tab
                                    ? 'bg-emerald-500 text-white font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
                                    : 'text-muted-foreground/70 hover:text-white'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Resources Grid */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {topicResources.length === 0 ? (
                            <div className="col-span-full">
                                <EmptyResourceState searchTerm={selectedTheme.name} />
                            </div>
                        ) : (
                            topicResources.map(resource => (
                                <div
                                    key={resource.id}
                                    onClick={() => setSelectedResource(resource)}
                                    className="rounded-xl overflow-hidden cursor-pointer hover:scale-[1.02] transition-all"
                                    style={{ background: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(75, 85, 99, 0.3)' }}
                                >
                                    <div className="aspect-video bg-card flex items-center justify-center relative">
                                        {resource.thumbnail_url ? (
                                            <img src={resource.thumbnail_url} alt={resource.title || 'Resource thumbnail'} className="w-full h-full object-cover" />
                                        ) : (
                                            <Play className="h-10 w-10 text-muted-foreground/40" />
                                        )}
                                        {resource.type === 'video' && resource.duration && (
                                            <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                                {Math.floor(resource.duration / 60)}:{String(resource.duration % 60).padStart(2, '0')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <h4 className="font-semibold text-sm text-white line-clamp-2 mb-1">{resource.title}</h4>
                                        <p className="text-xs text-muted-foreground/50 line-clamp-2 mb-2">{resource.description}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground/50 capitalize">{resource.type}</span>
                                            <span className="text-xs text-muted-foreground/50 flex items-center gap-1">
                                                <Eye className="h-3 w-3" /> {resource.view_count || 0}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {/* ===== RESOURCE DETAIL DIALOG ===== */}
            <Dialog open={!!selectedResource} onOpenChange={(open) => !open && setSelectedResource(null)}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                    {selectedResource && <ResourceDetailView resource={selectedResource} userId={user?.id} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ResourceDetailView({ resource, userId }: { resource: Resource, userId?: string }) {
    const [commentText, setCommentText] = useState("");
    const queryClient = useQueryClient();

    const { data: comments, isLoading } = useQuery({
        queryKey: ['resource-comments', resource.id],
        queryFn: async () => {
            const { data, error } = await supabase.from('resource_comments').select('*')
                .eq('resource_id', resource.id).order('created_at', { ascending: true });
            if (error) throw error;
            return data as Comment[];
        },
    });

    const addComment = useMutation({
        mutationFn: async (text: string) => {
            if (!userId) throw new Error("Not logged in");
            const { error } = await supabase.from('resource_comments').insert({ resource_id: resource.id, user_id: userId, content: text });
            if (error) throw error;
        },
        onSuccess: () => { setCommentText(""); queryClient.invalidateQueries({ queryKey: ['resource-comments', resource.id] }); toast.success("Comment added"); },
        onError: () => toast.error("Failed to post comment")
    });

    return (
        <div className="flex flex-col h-full">
            <DialogHeader className="p-6 border-b shrink-0">
                <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="capitalize">{resource.type}</Badge>
                    {resource.view_count !== undefined && <span className="text-xs text-muted-foreground/50">{resource.view_count} views</span>}
                </div>
                <DialogTitle className="text-2xl">{resource.title}</DialogTitle>
                {resource.description && <DialogDescription>{resource.description}</DialogDescription>}
            </DialogHeader>

            <div className="flex-1 overflow-hidden grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
                <ScrollArea className="md:col-span-2 h-full">
                    <div className="p-6">
                        {resource.type === 'video' && resource.url?.includes('youtube') ? (
                            <div className="aspect-video w-full rounded-lg overflow-hidden bg-black mb-4">
                                <iframe src={`https://www.youtube.com/embed/${resource.url.match(/(?:youtu.be\/|v=)([^#&?]*)/)?.[1]}`} className="w-full h-full" allowFullScreen />
                            </div>
                        ) : resource.content ? (
                            <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resource.content) }} />
                        ) : (
                            <div className="flex flex-col gap-4">
                                <p className="text-muted-foreground/70">This resource is available externally.</p>
                                <Button onClick={() => window.open(resource.url, '_blank')} className="w-fit gap-2">
                                    <ExternalLink className="h-4 w-4" /> {resource.link_button_text || "Open Resource"}
                                </Button>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="flex flex-col h-full bg-card/20">
                    <div className="p-4 border-b font-medium flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" /> Comments ({comments?.length || 0})
                    </div>
                    <ScrollArea className="flex-1 p-4">
                        <div className="space-y-4">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> :
                                comments?.length === 0 ? <p className="text-sm text-muted-foreground/50 text-center py-8">No comments yet.</p> :
                                    comments?.map(c => (
                                        <div key={c.id} className="bg-card/50 p-3 rounded-lg text-sm">
                                            {c.content}
                                            <p className="text-[10px] text-muted-foreground/50 mt-1">{new Date(c.created_at).toLocaleDateString('en-US')}</p>
                                        </div>
                                    ))}
                        </div>
                    </ScrollArea>
                    <div className="p-4 border-t">
                        <form onSubmit={(e) => { e.preventDefault(); if (commentText.trim()) addComment.mutate(commentText); }} className="flex gap-2">
                            <Textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Share your thoughts..." className="min-h-[40px] max-h-[100px] resize-none text-sm" />
                            <Button size="icon" type="submit" aria-label="Submit comment" disabled={!commentText.trim() || addComment.isPending}>
                                {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
