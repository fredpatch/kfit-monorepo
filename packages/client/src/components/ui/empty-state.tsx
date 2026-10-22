import type * as React from "react";
import { cn } from "../../lib/utils.js";

type EmptyStateProps = { title: string; description?: string; action?: React.ReactNode; className?: string };

/** A clear message, plus one action when useful (board 01). */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-input px-5 py-8 text-center", className)}>
      <p className="text-sm font-bold">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
