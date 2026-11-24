import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalScreen } from "./legal-screen";

export const metadata: Metadata = { title: "Legal — ADED" };

export default function LegalPage() {
  const terms = readFileSync(path.join(process.cwd(), "legal/terms-and-conditions.md"), "utf8");
  const privacy = readFileSync(path.join(process.cwd(), "legal/privacy-policy.md"), "utf8");
  return <LegalScreen terms={terms} privacy={privacy} />;
}
