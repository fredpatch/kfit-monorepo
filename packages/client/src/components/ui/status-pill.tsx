import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";
import type { StatusDescriptor, StatusTone } from "../../lib/status-map.js";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
  {
    variants: {
      tone: {
        success: "bg-success-soft text-success",
        info: "bg-info-soft text-info",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        neutral: "bg-neutral-soft text-neutral",
        waitlist: "bg-waitlist-soft text-waitlist",
      },
      size: {
        default: "h-6 px-2.5 text-xs",
        sm: "h-5 px-2 text-[11px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "default" },
  },
);

type PillProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  size?: "default" | "sm";
  /** Leading dot - on by default so status never relies on colour alone with the label. */
  dot?: boolean;
};

/** Generic tone pill; prefer StatusPill when the value comes from status-map. */
export function Pill({
  tone = "neutral",
  size = "default",
  dot = true,
  className,
  children,
  ...props
}: PillProps) {
  return (
    <span
      data-slot="pill"
      className={cn(pillVariants({ tone, size }), className)}
      {...props}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

type StatusPillProps = Omit<PillProps, "tone" | "children"> & {
  status: StatusDescriptor;
  /** Optional suffix such as "· 4 j". */
  suffix?: string;
};

export function StatusPill({ status, suffix, ...props }: StatusPillProps) {
  return (
    <Pill tone={status.tone} {...props}>
      {suffix ? `${status.label} ${suffix}` : status.label}
    </Pill>
  );
}
