import * as React from "react";
import { cn } from "../../lib/utils.js";

type FieldControlProps = {
  id: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

type FieldProps = {
  label: React.ReactNode;
  /** Shown after the label in muted text, e.g. "(facultatif)". */
  optionalHint?: string;
  hint?: React.ReactNode;
  /** French, user-facing message - never a raw error code. */
  error?: string | undefined;
  className?: string;
  /** Render prop receives the ids to wire label, hint and error for screen readers. */
  children: (control: FieldControlProps) => React.ReactNode;
};

/**
 * Label + control + hint/error, accessibility wired.
 * Works with react-hook-form: <Field label="Nom" error={errors.fullName?.message}>{(p) => <Input {...p} {...register("fullName")} />}</Field>
 */
export function Field({
  label,
  optionalHint,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control: FieldControlProps = { id };
  if (error) control["aria-invalid"] = true;
  if (describedBy) control["aria-describedby"] = describedBy;

  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
        {optionalHint ? (
          <>
            {" "}
            <span className="font-medium text-muted-foreground">
              {optionalHint}
            </span>
          </>
        ) : null}
      </label>
      {children(control)}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
