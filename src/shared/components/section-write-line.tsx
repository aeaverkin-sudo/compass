"use client";

import { Checkbox } from "@/shared/components/ui/checkbox";
import { WrapField, type WrapFieldHandle } from "@main/components/wrap-field";

/** The line under a section's rows. No checkbox. The hint stays until someone types. */
export function SectionWriteLine({
  zoneId,
  hint,
  about = false,
  hintPlus = false,
  autoFocus = false,
  initial = "",
  inputRef,
  onCommit,
  onBlur,
  onTextChange,
  onFocus,
}: {
  zoneId: string;
  hint: string;
  about?: boolean;
  /** Edit only. A grey plus in front of the hint. It leaves with the hint. */
  hintPlus?: boolean;
  autoFocus?: boolean;
  initial?: string;
  inputRef?: (handle: WrapFieldHandle | null) => void;
  onCommit: (value: string) => void;
  onBlur: (value: string) => void;
  onTextChange?: (value: string) => void;
  onFocus?: (value: string) => void;
}) {
  return (
    <div data-entry-seed={zoneId} className="min-w-0">
      <WrapField
        ref={inputRef}
        initial={initial}
        label={hint}
        placeholder={hint}
        multiline={about}
        breakButton={false}
        wrapPlaceholder
        placeholderMark={hintPlus}
        autoFocus={autoFocus}
        placeholderClassName="t-body text-[var(--placeholder)]"
        onFocus={() => onFocus?.(initial)}
        onTextChange={onTextChange}
        onDone={(value) => {
          if (about) return;
          onCommit(value);
        }}
        onBlur={(value) => onBlur(value)}
        className="t-body min-h-11 bg-transparent text-[var(--ink)] caret-[var(--ink)]"
      />
    </div>
  );
}

/** A library row in the questionnaire: text and the sky square. Edit keeps its own gestures. */
export function LibraryLine({
  text,
  checked,
  marked = false,
  onToggle,
}: {
  text: string;
  checked: boolean;
  marked?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative min-w-0">
      <p
        className="t-body mr-[26px] whitespace-pre-wrap break-words"
        style={{ color: marked ? "#E23B2F" : checked ? "var(--ink)" : "var(--placeholder)" }}
      >
        {text}
      </p>
      <div className="absolute top-0 right-0">
        <Checkbox
          variant="library"
          checked={checked}
          data-no-swipe
          aria-label={checked ? "Remove from portfolio" : "Add to portfolio"}
          className="relative z-10 -mr-[11px] -mt-[11px]"
          onCheckedChange={(next) => {
            if (Boolean(next) === checked) return;
            onToggle();
          }}
        />
      </div>
    </div>
  );
}
