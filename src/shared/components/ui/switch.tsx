"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center border-0 bg-white p-0.5",
        "shadow-[inset_0_0_0_1px_var(--rule)]",
        "data-[state=checked]:bg-sky data-[state=checked]:shadow-none",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#111]",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-3.5 bg-[var(--ink)] transition-transform duration-150",
          "data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
