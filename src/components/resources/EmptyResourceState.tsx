import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, Sparkles, BookOpen, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function EmptyResourceState({ searchTerm }: { searchTerm?: string }) {
    return (
        <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto py-12">
            {/* Primary Action - AI Agent */}
            <div className="relative overflow-hidden rounded-xl border border-indigo-500/20 bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950/30 p-8 text-center ring-1 ring-white/10">
                <div className="absolute top-0 right-0 -mt-16 -mr-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl mx-auto"></div>

                <div className="relative z-10 flex flex-col items-center">
                    <div className="h-16 w-16 mb-6 rounded-2xl bg-indigo-500/10 flex items-center justify-center ring-1 ring-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                        <Bot className="h-8 w-8 text-indigo-400" />
                    </div>

                    <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
                        {searchTerm ? `No data cached for "${searchTerm}"` : "This topic hasn't been indexed yet"}
                    </h3>

                    <p className="text-muted-foreground max-w-lg mb-8 leading-relaxed">
                        Our internal knowledge base doesn't have a curated guide for this yet.
                        You can dispatch our Research Agent to synthesize a report from PubMed and clinical trials.
                    </p>

                    <Button
                        size="lg"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-8 py-6 h-auto shadow-lg shadow-indigo-500/20 group"
                        onClick={() => {
                            toast.info("Research Agent dispatched! You will be notified when the report is ready (~2 mins).");
                        }}
                    >
                        <Sparkles className="mr-2 h-5 w-5 animate-pulse text-indigo-200" />
                        Generate Research Brief
                    </Button>

                    <p className="mt-4 text-xs text-indigo-400/60 font-mono">
                        ~2 minute processing time • Uses Live Scientific Data
                    </p>
                </div>
            </div>

            {/* Secondary - Fallback Categories */}
            <div className="grid md:grid-cols-2 gap-4">
                <Card className="bg-muted/20 border-border/40 hover:border-border/80 transition-colors group cursor-pointer">
                    <CardContent className="p-6 flex items-start gap-4">
                        <div className="p-3 rounded-lg bg-primary/10 text-primary">
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">General Safety Guide</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                                Standard protocols for reconstitution, storage, and handling of lyophilized peptides.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-muted/20 border-border/40 hover:border-border/80 transition-colors group cursor-pointer">
                    <CardContent className="p-6 flex items-start gap-4">
                        <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500">
                            <AlertCircle className="h-6 w-6" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-foreground group-hover:text-amber-400 transition-colors">Side Effect Management</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                                How to identify and manage common reactions like injection site redness or flushing.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
