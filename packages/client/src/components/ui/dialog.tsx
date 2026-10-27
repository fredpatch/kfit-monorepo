import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils.js";

/* Dialog: confirmations (destructive actions). Sheet: side panels for create/edit (boards 04, 06). */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const Overlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-brand-950/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      className,
    )}
    {...props}
  />
));
Overlay.displayName = "Overlay";

function CloseButton() {
  return (
    <DialogPrimitive.Close className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <X className="size-4" aria-hidden="true" />
      <span className="sr-only">Fermer</span>
    </DialogPrimitive.Close>
  );
}

type PanelHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
};

function PanelHeader({ title, description }: PanelHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-1 flex-col gap-1">
        <DialogPrimitive.Title className="text-xl font-extrabold tracking-tight">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="text-[13px] text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      <CloseButton />
    </div>
  );
}

type ContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  "title"
> &
  PanelHeaderProps & { footer?: React.ReactNode };

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ContentProps
>(({ className, title, description, footer, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl bg-card p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        className,
      )}
      {...(description ? {} : { "aria-describedby": undefined })}
      {...props}
    >
      <PanelHeader title={title} description={description} />
      {children}
      {footer ? (
        <div className="flex flex-wrap justify-end gap-2">{footer}</div>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ContentProps
>(({ className, title, description, footer, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-[500px] flex-col bg-card shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
        className,
      )}
      {...(description ? {} : { "aria-describedby": undefined })}
      {...props}
    >
      <div className="border-b border-border-subtle px-6 pb-4 pt-6">
        <PanelHeader title={title} description={description} />
      </div>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        {children}
      </div>
      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-6 py-4">
          {footer}
        </div>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";
