type NameFieldsProps = {
  name: string;
  onNameChange: (value: string) => void;
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

export function NameFields({ name, onNameChange, onFocusChange }: NameFieldsProps) {
  return (
    <div className="flex w-full flex-col items-center">
      <label className="w-full border-b border-hairline pb-2">
        <span className="sr-only">Name or portfolio title</span>
        <input
          type="text"
          name="displayName"
          value={name}
          placeholder="name, portfolio title"
          autoComplete="name"
          autoCapitalize="words"
          onChange={(event) => onNameChange(event.target.value)}
          onFocus={() => {
            window.scrollTo(0, 0);
            onFocusChange?.(true);
          }}
          onBlur={() => blurIfOutsideFields(onFocusChange)}
          className="compass-input w-full translate-y-[0.5mm] bg-transparent px-0 py-0 text-center text-[17px] leading-[1.15] text-foreground outline-none placeholder:text-hint"
        />
      </label>
    </div>
  );
}
