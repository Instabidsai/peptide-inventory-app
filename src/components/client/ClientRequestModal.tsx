import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Send, Pill } from "lucide-react";

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
    onSuccess?: () => void;
}

export function ClientRequestModal({
    open,
    onOpenChange,
    defaultType = "general_inquiry",
    prefillPeptide,
    onSuccess
}: ClientRequestModalProps) {
    const { user, profile } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<RequestFormValues>({
        resolver: zodResolver(requestSchema),
        defaultValues: {
            type: defaultType,
            subject: prefillPeptide ? `Refill Request: ${prefillPeptide.name}` : "",
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

    const onSubmit = async (data: RequestFormValues) => {
        if (!user || !profile?.org_id) {
            toast.error("You must be logged in to send requests.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from("client_requests").insert({
                org_id: profile.org_id,
                user_id: user.id,
                type: data.type,
                status: "pending",
                subject: data.subject,
                message: data.message,
                peptide_id: prefillPeptide?.id || null, // Only link if passed explicity for now
                requested_quantity: data.type === 'product_request' ? data.requested_quantity : null
            });

            if (error) throw error;

            toast.success("Request sent successfully!");
            reset();
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
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">

                    {/* Hidden Type Field (controlled via props usually, but selectable for general) */}
                    {!prefillPeptide && (
                        <div className="space-y-2">
                            <Label>Topic</Label>
                            <Select
                                onValueChange={(val) => setValue("type", val as any)}
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
