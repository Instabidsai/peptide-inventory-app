import { lazy, Suspense } from "react";
import type { BuildPreviewVariant } from "./LiveBuildPreview";

const LiveBuildPreviewFull = lazy(() =>
  import("./LiveBuildPreview").then(m => ({ default: m.LiveBuildPreview }))
);

interface Props {
  phase: number;
  variant: BuildPreviewVariant;
}

/**
 * Lightweight wrapper that lazy-loads the full LiveBuildPreview module.
 * Prevents the 791-line file from blocking the initial Hero render.
 */
export function LiveBuildPreviewLazy({ phase, variant }: Props) {
  return (
    <Suspense fallback={<div className="h-24 rounded-lg bg-muted-foreground/5 animate-pulse" />}>
      <LiveBuildPreviewFull phase={phase} variant={variant} />
    </Suspense>
  );
}
