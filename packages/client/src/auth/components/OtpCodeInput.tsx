import * as React from "react";
import { cn } from "../../lib/utils.js";

/**
 * 6-digit code as ONE input (UX-10 decision): native paste and SMS/e-mail autofill
 * (`autocomplete="one-time-code"`), one tab stop for screen readers; styled as segments.
 */
export const OtpCodeInput = React.forwardRef<
  HTMLInputElement,
  Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "onChange" | "value"
  > & { value: string; onValueChange(value: string): void }
>(({ value, onValueChange, className, ...props }, ref) => (
  <input
    ref={ref}
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="\d{6}"
    maxLength={6}
    value={value}
    onChange={(event) =>
      onValueChange(event.target.value.replace(/\D/g, "").slice(0, 6))
    }
    className={cn(
      "h-14 w-full rounded-lg border border-input bg-card px-4 text-center font-mono text-2xl font-extrabold tracking-[0.6em] text-foreground tabular-nums placeholder:text-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-danger",
      className,
    )}
    placeholder="······"
    {...props}
  />
));
OtpCodeInput.displayName = "OtpCodeInput";
