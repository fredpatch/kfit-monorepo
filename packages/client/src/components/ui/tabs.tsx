import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils.js";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.List ref={ref} data-slot="tabs-list" className={cn("flex flex-wrap gap-1 border-b border-border", className)} {...props} />
  ),
);
TabsList.displayName = "TabsList";

/** Underline tab (board 03). Optional count badge via `badge`. */
export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { badge?: React.ReactNode }
>(({ className, children, badge, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      "-mb-px inline-flex h-11 items-center gap-2 border-b-2 border-transparent px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:font-bold data-[state=active]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
    {badge !== undefined && badge !== null ? <span className="inline-flex h-5 items-center rounded-full bg-muted px-1.5 text-[11px] font-bold text-neutral">{badge}</span> : null}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Content ref={ref} data-slot="tabs-content" className={cn("pt-5 focus-visible:outline-none", className)} {...props} />
  ),
);
TabsContent.displayName = "TabsContent";
