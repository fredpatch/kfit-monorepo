import { cn, initialsOf } from "../../lib/utils.js";

const tones = [
  "bg-brand-100 text-[#1f4d20]",
  "bg-info-soft text-info",
  "bg-waitlist-soft text-waitlist",
  "bg-warning-soft text-warning",
] as const;

const sizes = {
  sm: "size-8 text-xs",
  default: "size-10 text-sm",
  lg: "size-16 text-[22px]",
} as const;

/** Stable tone per name so the same client keeps the same colour everywhere. */
function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length] ?? tones[0];
}

type AvatarProps = {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
};

export function Avatar({ name, size = "default", className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        sizes[size],
        toneFor(name),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
