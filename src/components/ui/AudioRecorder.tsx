import React, { useState, useEffect } from 'react';
import { useReactMediaRecorder } from 'react-media-recorder';
import { LiveAudioVisualizer } from 'react-audio-visualize';
import { Mic, Square, Trash2, Check, Play, Pause, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from "date-fns";

interface AudioRecorderProps {
    onRecordingComplete: (blob: Blob) => void;
    isSubmitting?: boolean;
}

export function AudioRecorder({ onRecordingComplete, isSubmitting }: AudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [timer, setTimer] = useState(0);

    const { startRecording: start, stopRecording: stop, mediaBlobUrl, clearBlobUrl } = useReactMediaRecorder({
        audio: true,
        blobPropertyBag: { type: "audio/webm" },
        onStop: (blobUrl, blob) => {
            setAudioBlob(blob);
        }
    });

    // Handle Mic Access & Visualizer Stream
    useEffect(() => {
        if (isRecording) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                const recorder = new MediaRecorder(stream);
                setMediaRecorder(recorder);
            });
            const interval = setInterval(() => setTimer(t => t + 1), 1000);
            return () => clearInterval(interval);
        } else {
            setMediaRecorder(null);
            setTimer(0);
        }
    }, [isRecording]);

    const handleStart = () => {
        setIsRecording(true);
        start();
    };

    const handleStop = () => {
        setIsRecording(false);
        stop();
    };

    const handleDelete = () => {
        clearBlobUrl();
        setAudioBlob(null);
        setTimer(0);
    };

    const handleConfirm = () => {
        if (audioBlob) {
            onRecordingComplete(audioBlob);
            handleDelete(); // Reset UI after passing blob up
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Review Mode
    if (audioBlob && mediaBlobUrl) {
        return (
            <div className="flex items-center gap-3 p-2 border rounded-full bg-secondary/20 animate-in fade-in slide-in-from-bottom-2">
                <audio src={mediaBlobUrl} controls className="h-8 w-48" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4" />
                </Button>
                <Button size="icon" className="h-8 w-8 bg-emerald-500 hover:bg-emerald-600 rounded-full" onClick={handleConfirm} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
            </div>
        );
    }

    // Recording Mode
    if (isRecording && mediaRecorder) {
        return (
            <div className="flex items-center gap-4 p-3 border border-red-200 bg-red-50 rounded-lg w-full">
                <div className="relative">
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full animate-ping" />
                    <Button variant="destructive" size="icon" className="h-10 w-10 rounded-full shadow-lg" onClick={handleStop}>
                        <Square className="h-4 w-4 fill-current" />
                    </Button>
                </div>

                <div className="flex-1 h-8 flex items-center justify-center bg-background/50 rounded overflow-hidden">
                    {/* Visualizer needs live media stream */}
                    {mediaRecorder && (
                        <LiveAudioVisualizer
                            mediaRecorder={mediaRecorder}
                            width={150}
                            height={30}
                            barWidth={2}
                            gap={1}
                            barColor="#ef4444"
                        />
                    )}
                </div>

                <div className="font-mono text-red-600 font-medium min-w-[45px]">
                    {formatTime(timer)}
                </div>
            </div>
        );
    }

    // Idle Mode
    return (
        <Button
            variant="outline"
            type="button"
            onClick={handleStart}
            className="rounded-full gap-2 transition-all hover:border-primary hover:text-primary"
        >
            <Mic className="h-4 w-4" />
            Record Note
        </Button>
    );
}
