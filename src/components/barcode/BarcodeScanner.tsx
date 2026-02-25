import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface BarcodeScannerProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: (barcode: string) => void;
}

export function BarcodeScanner({ isOpen, onClose, onScan }: BarcodeScannerProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [scanSuccess, setScanSuccess] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const mountedRef = useRef(true);
    const videoElementId = 'barcode-scanner-video';

    useEffect(() => {
        mountedRef.current = true;
        if (isOpen && !scannerRef.current) {
            initializeScanner();
        }

        return () => {
            mountedRef.current = false;
            stopScanner();
        };
    }, [isOpen]);

    const initializeScanner = async () => {
        try {
            const scanner = new Html5Qrcode(videoElementId);
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                },
                onScanSuccess,
                onScanFailure
            );

            if (mountedRef.current) setIsScanning(true);
        } catch (error) {
            logger.error('Error starting scanner:', error);
            if (mountedRef.current) {
                toast.error('Failed to access camera. Please check permissions.');
                onClose();
            }
        }
    };

    const stopScanner = async () => {
        const scanner = scannerRef.current;
        if (!scanner) return;
        try {
            await scanner.stop();
            scanner.clear();
        } catch (error) {
            logger.error('Error stopping scanner:', error);
        } finally {
            scannerRef.current = null;
            if (mountedRef.current) setIsScanning(false);
        }
    };

    const onScanSuccess = (decodedText: string) => {
        // Show success animation
        setScanSuccess(true);

        // Stop scanner
        stopScanner();

        // Notify parent component
        setTimeout(() => {
            onScan(decodedText);
            setScanSuccess(false);
            onClose();
        }, 500);
    };

    const onScanFailure = (error: string) => {
        // Ignore scan failures (they happen constantly as scanner processes frames)
        // Only log actual errors
        if (!error.includes('NotFoundException')) {
            logger.warn('Scan error:', error);
        }
    };

    const handleClose = async () => {
        await stopScanner();
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        Scan Barcode
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Close scanner"
                            onClick={handleClose}
                            className="h-6 w-6"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </DialogTitle>
                </DialogHeader>

                <div className="relative">
                    {/* Scanner Video Element */}
                    <div id={videoElementId} className="w-full rounded-lg overflow-hidden bg-black" />

                    {/* Success Overlay */}
                    {scanSuccess && (
                        <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-sm rounded-lg">
                            <div className="flex flex-col items-center gap-2 text-green-600">
                                <CheckCircle2 className="h-16 w-16 animate-bounce" />
                                <span className="font-semibold">Barcode Detected!</span>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {!isScanning && !scanSuccess && (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 backdrop-blur-sm rounded-lg">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <span className="text-sm text-muted-foreground">Starting camera...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Instructions */}
                <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                        Point your camera at a product barcode
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Supported: UPC, EAN-13, Code-128, and more
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
