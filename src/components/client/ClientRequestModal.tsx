import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Send, Pill } from "lucide-react";
import { AudioRecorder } from "@/components/ui/AudioRecorder";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const requestSchema = z.object({
    subject: z.string().min(1, "Subject is required"),
    message: z.string().min(1, "Message is required"),
    type: z.enum(["general_inquiry", "product_request", "regimen_help"]),
    requested_quantity: z.number().min(1).optional(),
});

type RequestFormValues = z.infer<typeof requestSchema>;

interface ClientRequestModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultType?: "general_inquiry" | "product_request" | "regimen_help";
    prefillPeptide?: {
        id: string;
        name: string;
    };
    context?: {
        type: string;
        id: string;
        title: string;
    };
    onSuccess?: () => void;
}

export function ClientRequestModal({
    open,
    onOpenChange,
    defaultType = "general_inquiry",
    prefillPeptide,
    context,
    onSuccess
}: ClientRequestModalProps) {
    const { user, profile } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<RequestFormValues>({
        resolver: zodResolver(requestSchema),
        defaultValues: {
            type: defaultType,
            subject: prefillPeptide ? `Refill Request: ${prefillPeptide.name}` : context ? `Question about ${context.title}` : "",
            message: prefillPeptide ? `Hi, I'd like to request a refill for ${prefillPeptide.name}.` : "",
            requested_quantity: 1
        }
    });

    // Update form when props change
    useEffect(() => {
        if (open) {
            setValue("type", defaultType);
            if (prefillPeptide) {
                setValue("subject", `Refill Request: ${prefillPeptide.name}`);
                setValue("message", `Hi, I'd like to request a refill for ${prefillPeptide.name}.`);
            } else if (!watch("subject")) {
                // Only reset if empty to avoid wiping user draft on re-open (basic)
                // Actually, safer to reset if it's a fresh open for a different purpose
            }
        }
    }, [open, defaultType, prefillPeptide, setValue]);

    const requestType = watch("type");

    const [files, setFiles] = useState<File[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = e.target.files;
        if (newFiles && newFiles.length > 0) {
            setFiles(prev => [...prev, ...Array.from(newFiles)]);
        }
    };

    const handleVoiceRecording = (blob: Blob) => {
        const file = new File([blob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
        setFiles(prev => [...prev, file]);
        toast.success("Voice note added!");
    };

    const onSubmit = async (data: RequestFormValues) => {
        if (!user || !profile?.org_id) {
            toast.error("You must be logged in to send requests.");
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Upload Files (Mock/Real)
            const uploadedAttachments = [];
            if (files.length > 0) {
                // Try to upload to 'messaging-attachments' bucket
                for (const file of files) {
                    const fileName = `${Date.now()}-${file.name}`;
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('messaging-attachments')
                        .upload(`${user.id}/${fileName}`, file);

                    if (!uploadError && uploadData) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('messaging-attachments')
                            .getPublicUrl(`${user.id}/${fileName}`);

                        uploadedAttachments.push({
                            name: file.name,
                            type: file.type,
                            url: publicUrl
                        });
                    } else {
                        console.warn("Upload failed (Bucket likely missing):", uploadError);
                    }
                }
            }

            // 2. Insert Request (Defensive: Try with attachments, fallback if column missing)
            const basePayload = {
                org_id: profile.org_id,
                user_id: user.id,
                type: data.type,
                status: "pending",
                subject: data.subject,
                message: data.message,
                peptide_id: prefillPeptide?.id || null,
                requested_quantity: data.type === 'product_request' ? data.requested_quantity : null,
                context_type: context?.type || null,
                context_id: context?.id || null
            };

            const payloadWithAttachments = {
                ...basePayload,
                attachments: uploadedAttachments
            };

            // Attempt Insert with Attachments
            let { error } = await supabase.from("client_requests").insert(payloadWithAttachments);

            // Fallback: If Column Missing (Code 42703), retry without attachments
            if (error && error.code === '42703') {
                console.warn("Column 'attachments' missing. Retrying without it.");
                const retry = await supabase.from("client_requests").insert(basePayload);
                error = retry.error;
                if (!error) {
                    toast.warning("Request sent, but attachments were dropped (Database update needed).");
                }
            }

            if (error) throw error;

            toast.success("Request sent successfully!");
            reset();
            setFiles([]);
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            console.error("Error sending request:", error);
            toast.error("Failed to send request. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {prefillPeptide ? `Request Refill: ${prefillPeptide.name}` : "Send Message"}
                    </DialogTitle>
                    <DialogDescription>
                        {prefillPeptide
                            ? "Send a request to your provider for a refill."
                            : "Send a message or request to the admin team."}
                    </DialogDescription>
                    {context && (
                        <div className="mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                            Referring to: {context.title}
                        </div>
                    )}
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">

                    {/* Hidden Type Field (controlled via props usually, but selectable for general) */}
                    {!prefillPeptide && (
                        <div className="space-y-2">
                            <Label>Topic</Label>
                            <Select
                                onValueChange={(val) => setValue("type", val as RequestFormValues["type"])}
                                defaultValue={defaultType}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a topic" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="general_inquiry">General Question</SelectItem>
                                    <SelectItem value="product_request">Product Request</SelectItem>
                                    <SelectItem value="regimen_help">Regimen Help</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="subject">Subject</Label>
                        <Input id="subject" {...register("subject")} placeholder="Brief content..." />
                        {errors.subject && <p className="text-sm text-red-500">{errors.subject.message}</p>}
                    </div>

                    {/* Quantity only for product requests */}
                    {(requestType === 'product_request' || prefillPeptide) && (
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Quantity</Label>
                            <div className="flex items-center gap-3">
                                <Input
                                    id="quantity"
                                    type="number"
                                    className="w-24"
                                    {...register("requested_quantity", { valueAsNumber: true })}
                                />
                                <span className="text-muted-foreground text-sm">vial(s) / unit(s)</span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="message">Message</Label>
                        <Textarea
                            id="message"
                            {...register("message")}
                            placeholder="Type your message here..."
                            className="min-h-[100px]"
                        />
                        {errors.message && <p className="text-sm text-red-500">{errors.message.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Attachments & Voice</Label>
                        <div className="flex flex-col gap-3 p-3 bg-secondary/20 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <Input
                                    id="attachments"
                                    type="file"
                                    multiple
                                    onChange={handleFileChange}
                                    className="cursor-pointer"
                                />
                                <div className="h-8 w-px bg-border mx-2 hidden sm:block"></div>
                                <AudioRecorder onRecordingComplete={handleVoiceRecording} isSubmitting={isSubmitting} />
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {files.length > 0 ? `${files.length} file(s) ready to upload` : "Upload images or record a voice note."}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Send className="mr-2 h-4 w-4" />
                            Send Request
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
