"use client";

import { useFormStatus } from "react-dom";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type PendingSubmitSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  turningOnText?: string;
  turningOffText?: string;
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

/**
 * Toggle control that submits a parent form and swaps to progress text while pending.
 */
export function PendingSubmitSwitch({
  checked,
  disabled = false,
  ariaLabel,
  turningOnText = "Turning on...",
  turningOffText = "Turning off...",
}: PendingSubmitSwitchProps) {
  const { pending } = useFormStatus();
  const nextState = !checked;

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Spinner />
        {nextState ? turningOnText : turningOffText}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "text-[11px] font-semibold leading-none",
          checked ? "text-emerald-700" : "text-muted-foreground",
        )}
      >
        ON
      </span>
      <Switch
        type="submit"
        checked={checked}
        checkedSide="left"
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span
        className={cn(
          "text-[11px] font-semibold leading-none",
          checked ? "text-muted-foreground" : "text-slate-700",
        )}
      >
        OFF
      </span>
    </div>
  );
}
