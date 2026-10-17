"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

function Checkbox({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  /** Library row: sky fill, no tick. */
  variant?: "default" | "library";
}) {
  if (variant === "library") {
    return (
      <CheckboxPrimitive.Root
        data-slot="checkbox"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center bg-transparent",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#111]",
          "disabled:opacity-40",
          className,
        )}
        {...props}
      >
        <span className="flex size-[22px] items-center justify-center rounded-none border-[1.6px] border-[var(--placeholder)] bg-white">
          <CheckboxPrimitive.Indicator className="flex items-center justify-center">
            <span className="block size-[16px] rounded-none bg-sky" />
          </CheckboxPrimitive.Indicator>
        </span>
      </CheckboxPrimitive.Root>
    );
  }
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 border-0 bg-sky",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#111]",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[#111]">
        <Check className="size-3" strokeWidth={2} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
