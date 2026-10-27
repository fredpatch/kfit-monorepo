import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";

/**
 * A personal link shown once after it is created (quote, receipt, proof upload - board 15c).
 * The server never returns the token again, so the coach copies or sends it now.
 */
export function OneTimeLink({
  url,
  label,
  meta,
  onHide,
}: {
  url: string;
  label: string;
  meta?: string;
  onHide?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Lien copié.");
    } catch {
      toast.error(
        "Copie impossible. Sélectionne le lien et copie-le manuellement.",
      );
    }
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border-[1.5px] border-primary bg-brand-50 p-3.5">
      <p className="text-[13px] font-bold">
        Lien créé - copie-le maintenant, il ne sera plus affiché.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          readOnly
          aria-label={label}
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 basis-56"
        />
        <Button size="sm" className="h-10" onClick={() => void copy()}>
          <Copy aria-hidden="true" />
          {copied ? "Copié" : "Copier"}
        </Button>
        <Button asChild size="sm" variant="whatsapp" className="h-10">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle aria-hidden="true" />
            WhatsApp
          </a>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {meta ? `${meta} · ` : ""}À partager uniquement avec la cliente ou le
          client concerné.
        </p>
        {onHide ? (
          <Button size="sm" variant="ghost" onClick={onHide}>
            Masquer le lien
          </Button>
        ) : null}
      </div>
    </div>
  );
}
