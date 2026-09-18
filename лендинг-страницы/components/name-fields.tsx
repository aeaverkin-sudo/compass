export function NameFields() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <label className="w-full border-b border-hairline pb-2">
        <span className="sr-only">First name</span>
        <input
          type="text"
          name="firstName"
          placeholder="first name"
          autoComplete="given-name"
          className="compass-input w-full bg-transparent text-center text-[17px] text-foreground outline-none placeholder:text-hint"
        />
      </label>
      <label className="w-full border-b border-hairline pb-2">
        <span className="sr-only">Second name</span>
        <input
          type="text"
          name="secondName"
          placeholder="second name"
          autoComplete="family-name"
          className="compass-input w-full bg-transparent text-center text-[17px] text-foreground outline-none placeholder:text-hint"
        />
      </label>
    </div>
  );
}
