"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group relative inline-flex h-5 w-[30.6px] shrink-0 items-center border-0 bg-sky",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#111]",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <X
        aria-hidden
        strokeWidth={1.25}
        className="pointer-events-none absolute top-1/2 right-0.5 size-3.5 -translate-y-1/2 text-hairline opacity-0 group-data-[state=unchecked]:opacity-100"
      />
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-3.5 rounded-[1.5px] bg-[var(--grey)]",
          "data-[state=checked]:translate-x-[14.6px] data-[state=unchecked]:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
