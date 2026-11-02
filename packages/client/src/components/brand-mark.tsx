import { cn } from "../lib/utils.js";

/** The coach's brand logo (public/logo.jpg, black square). Decorative: the name « K'FIT » is always written next to it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo.jpg"
      alt=""
      width={800}
      height={800}
      decoding="async"
      className={cn(
        "size-8 shrink-0 rounded-[9px] bg-black object-cover",
        className,
      )}
    />
  );
}
