export function NameFields() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <label className="block w-full">
        <span className="sr-only">First name</span>
        <input
          type="text"
          name="firstName"
          placeholder="first name"
          autoComplete="given-name"
          className="compass-input w-full border-0 border-b border-hairline bg-transparent px-0 pt-0 pb-[calc(0.25rem+0.5mm)] text-center text-[17px] leading-[1.15] text-foreground outline-none placeholder:text-hint"
        />
      </label>
      <label className="block w-full">
        <span className="sr-only">Second name</span>
        <input
          type="text"
          name="secondName"
          placeholder="second name"
          autoComplete="family-name"
          className="compass-input w-full border-0 border-b border-hairline bg-transparent px-0 pt-0 pb-[calc(0.25rem+0.5mm)] text-center text-[17px] leading-[1.15] text-foreground outline-none placeholder:text-hint"
        />
      </label>
    </div>
  );
}
