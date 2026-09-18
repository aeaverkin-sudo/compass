type NameFieldsProps = {
  firstName: string;
  secondName: string;
  onFirstNameChange: (value: string) => void;
  onSecondNameChange: (value: string) => void;
  onFocusChange?: (focused: boolean) => void;
};

function blurIfOutsideFields(onFocusChange?: (focused: boolean) => void) {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    const stillFocused =
      active instanceof HTMLInputElement && active.classList.contains("compass-input");
    onFocusChange?.(stillFocused);
  });
}

export function NameFields({
  firstName,
  secondName,
  onFirstNameChange,
  onSecondNameChange,
  onFocusChange,
}: NameFieldsProps) {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <label className="w-full border-b border-hairline pb-2">
        <span className="sr-only">First name</span>
        <input
          type="text"
          name="firstName"
          value={firstName}
          placeholder="first name"
          autoComplete="given-name"
          onChange={(event) => onFirstNameChange(event.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => blurIfOutsideFields(onFocusChange)}
          className="compass-input w-full translate-y-[0.5mm] bg-transparent px-0 py-0 text-center text-[17px] leading-[1.15] text-foreground outline-none placeholder:text-hint"
        />
      </label>
      <label className="w-full border-b border-hairline pb-2">
        <span className="sr-only">Second name</span>
        <input
          type="text"
          name="secondName"
          value={secondName}
          placeholder="second name"
          autoComplete="family-name"
          onChange={(event) => onSecondNameChange(event.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => blurIfOutsideFields(onFocusChange)}
          className="compass-input w-full translate-y-[0.5mm] bg-transparent px-0 py-0 text-center text-[17px] leading-[1.15] text-foreground outline-none placeholder:text-hint"
        />
      </label>
    </div>
  );
}
