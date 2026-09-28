"use client";

import Link from "next/link";
import { Checkbox } from "@/shared/components/ui/checkbox";

type ConsentLineProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
};

export function ConsentLine({ checked, onCheckedChange, id = "consent" }: ConsentLineProps) {
  return (
    <div className="mb-4 flex max-w-xs items-start gap-3 text-left">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <label htmlFor={id} className="text-[13px] font-light leading-snug text-[#111]">
        I agree to the{" "}
        <Link href="/terms" className="underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          privacy
        </Link>
        .
      </label>
    </div>
  );
}
