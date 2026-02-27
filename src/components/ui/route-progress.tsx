import { useEffect, useState } from 'react';
import { useNavigation, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

/** Thin animated progress bar at top of page during route transitions. */
export function RouteProgress() {
    const location = useLocation();
    const [isNavigating, setIsNavigating] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Show progress briefly on route change
        setIsNavigating(true);
        setProgress(30);
        const t1 = setTimeout(() => setProgress(70), 100);
        const t2 = setTimeout(() => setProgress(100), 200);
        const t3 = setTimeout(() => setIsNavigating(false), 400);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [location.pathname]);

    return (
        <AnimatePresence>
            {isNavigating && (
                <motion.div
                    className="fixed top-0 left-0 right-0 z-[100] h-[2px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <motion.div
                        className="h-full bg-gradient-to-r from-primary via-primary to-primary/60 shadow-[0_0_10px_hsl(var(--primary)/0.5)]"
                        initial={{ width: '0%' }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
