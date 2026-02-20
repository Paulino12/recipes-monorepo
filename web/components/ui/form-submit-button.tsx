"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FormSubmitButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  showSpinner?: boolean;
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
 * Reusable submit control for server actions/forms.
 * Shows pending feedback and prevents double submits while work is in-flight.
 */
export function FormSubmitButton({
  children,
  pendingText,
  disabled,
  variant = "default",
  size = "default",
  className,
  showSpinner = true,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled || pending);

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={isDisabled}
      aria-busy={pending || undefined}
      className={cn("min-w-20", className)}
      {...props}
    >
      {pending && showSpinner ? <Spinner /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
