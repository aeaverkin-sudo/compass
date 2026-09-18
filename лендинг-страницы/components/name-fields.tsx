type NameFieldsProps = {
  firstName: string;
  secondName: string;
  onFirstNameChange: (value: string) => void;
  onSecondNameChange: (value: string) => void;
};

export function NameFields({
  firstName,
  secondName,
  onFirstNameChange,
  onSecondNameChange,
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
          className="compass-input w-full translate-y-[0.5mm] bg-transparent px-0 py-0 text-center text-[17px] leading-[1.15] text-foreground outline-none placeholder:text-hint"
        />
      </label>
    </div>
  );
}
