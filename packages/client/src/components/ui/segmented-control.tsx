import * as React from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "../../lib/utils.js";

export type SegmentedOption<V extends string> = {
  value: V;
  label: React.ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<V extends string> = {
  value: V;
  onValueChange: (value: V) => void;
  options: ReadonlyArray<SegmentedOption<V>>;
  "aria-label": string;
  size?: "default" | "sm";
  className?: string;
};

/** Single-choice pill group (availability, period, channel). Always keeps one value selected. */
export function SegmentedControl<V extends string>({
  value,
  onValueChange,
  options,
  size = "default",
  className,
  ...aria
}: SegmentedControlProps<V>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as V);
      }}
      aria-label={aria["aria-label"]}
      className={cn(
        "inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1",
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled ?? false}
          className={cn(
            "rounded-[9px] px-3.5 font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm",
            size === "sm" ? "h-7 text-xs" : "h-8 text-[13px]",
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
