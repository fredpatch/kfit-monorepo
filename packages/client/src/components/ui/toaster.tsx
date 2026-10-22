import { Toaster as Sonner } from "sonner";

/** Toast host. Usage: import { toast } from "sonner"; toast.success("Décision enregistrée."). */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-border !bg-card !text-foreground !font-sans !shadow-lg",
          description: "!text-muted-foreground",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}
