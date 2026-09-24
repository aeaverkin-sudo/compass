"use client";

import { NameOrTitleField } from "@/shared/components/name-or-title-field";

type NameFieldsProps = {
  name: string;
  onNameChange: (value: string) => void;
};

export function NameFields({ name, onNameChange }: NameFieldsProps) {
  return (
    <div className="flex w-full flex-col items-center">
      <label className="w-full border-b border-hairline pb-2">
        <NameOrTitleField
          value={name}
          onChange={onNameChange}
          fontSizePx={17}
          className="translate-y-[0.5mm] px-0 py-0 text-center"
        />
      </label>
    </div>
  );
}
