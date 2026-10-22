import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils.js";

/* The « ⋯ » menu for secondary and rare actions (boards 03, 04, 06). */

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof Menu.Content>, React.ComponentPropsWithoutRef<typeof Menu.Content>>(
  ({ className, sideOffset = 6, align = "end", ...props }, ref) => (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  ),
);
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item> & { destructive?: boolean }
>(({ className, destructive = false, ...props }, ref) => (
  <Menu.Item
    ref={ref}
    className={cn(
      "flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium outline-none transition-colors focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
      destructive ? "text-danger focus:bg-danger-soft" : "",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuLabel = React.forwardRef<React.ElementRef<typeof Menu.Label>, React.ComponentPropsWithoutRef<typeof Menu.Label>>(
  ({ className, ...props }, ref) => <Menu.Label ref={ref} className={cn("px-2.5 py-1.5 text-xs font-semibold text-muted-foreground", className)} {...props} />,
);
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = React.forwardRef<React.ElementRef<typeof Menu.Separator>, React.ComponentPropsWithoutRef<typeof Menu.Separator>>(
  ({ className, ...props }, ref) => <Menu.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border-subtle", className)} {...props} />,
);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
