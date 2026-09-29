import Link from "next/link";

const POINTS = [
  "ADED uses AI.",
  "A portfolio may not be used for anything illegal. That includes pornography, weapons, drugs, resale of prescription medicine, sanctioned goods, and any other illegal use.",
  "We store the data securely.",
  "Do not put sensitive data on a portfolio. A phone number or an Instagram handle is usually already public; sharing it here is voluntary.",
  "We do not scan every portfolio. We may check one suspicious word or item. We do not review the whole portfolio as a routine.",
  "We cooperate with the authorities when the law requires it.",
  "We do not sell the data and we do not give it to third parties.",
  "Sign-in is Google, or a starter code sent by email. That code is the password until you change it. You are responsible for keeping the profile secure.",
];

export function LegalDraft({ title }: { title: string }) {
  return (
    <main className="compass-main min-h-lvh overflow-y-auto bg-white px-6 py-10 text-[#111]">
      <p className="text-[12px] font-normal tracking-[0.08em] uppercase">Draft</p>
      <h1 className="mt-3 text-[28px] font-light leading-tight">{title}</h1>
      <p className="mt-4 max-w-md text-[14px] font-light leading-snug">
        This is not the final legal text. The version on the checkbox is 2026-09-28.
      </p>
      <ol className="mt-8 max-w-md list-decimal space-y-3 pl-5 text-[14px] font-normal leading-snug">
        {POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ol>
      <p className="mt-10 text-[14px] font-light">
        <Link href="/terms" className="underline">
          Terms
        </Link>
        {" · "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
      </p>
    </main>
  );
}
