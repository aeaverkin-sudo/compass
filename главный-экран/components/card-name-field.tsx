"use client";

import { NameOrTitleField } from "@/shared/components/name-or-title-field";

type CardNameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  fontSizePx: number;
  className?: string;
};

export function CardNameField({ value, onChange, fontSizePx, className }: CardNameFieldProps) {
  return (
    <NameOrTitleField
      value={value}
      onChange={onChange}
      fontSizePx={fontSizePx}
      className={className ?? "compass-type-name text-center"}
    />
  );
}
