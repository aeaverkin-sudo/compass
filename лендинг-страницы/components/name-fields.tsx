type NameFieldsProps = {
  name: string;
  onNameChange: (value: string) => void;
};

export function NameFields({ name, onNameChange }: NameFieldsProps) {
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
          className="compass-input w-full translate-y-[0.5mm] bg-transparent px-0 py-0 text-center text-[17px] leading-[1.15] text-foreground outline-none placeholder:text-hint"
        />
      </label>
    </div>
  );
}
