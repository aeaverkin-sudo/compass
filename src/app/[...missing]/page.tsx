import { notFound, redirect } from "next/navigation";

/** Only URLs no route matches land here; `notFound()` from real pages keeps its own 404. */
export default async function MissingPage({ params }: { params: Promise<{ missing: string[] }> }) {
  const { missing } = await params;
  const last = missing[missing.length - 1] ?? "";
  if (missing[0] === "api" || last.includes(".")) notFound();
  redirect("/");
}
