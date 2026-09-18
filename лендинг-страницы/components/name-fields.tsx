export function NameFields() {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <input
        type="text"
        name="firstName"
        placeholder="first name"
        autoComplete="given-name"
        className="w-full bg-transparent text-center text-[17px] text-foreground outline-none placeholder:text-hint"
      />
      <input
        type="text"
        name="secondName"
        placeholder="second name"
        autoComplete="family-name"
        className="w-full bg-transparent text-center text-[17px] text-foreground outline-none placeholder:text-hint"
      />
    </div>
  );
}
