import type { Metadata } from "next";
import { EntryPage } from "./entry-page";

export const metadata: Metadata = { title: "Create a portfolio", robots: { index: false } };

type PageProps = { searchParams: Promise<{ name?: string | string[]; email?: string | string[] }> };

function one(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = raw?.trim();
  return text || undefined;
}

export default async function CreatePage({ searchParams }: PageProps) {
  const query = await searchParams;
  return <EntryPage input={{ name: one(query.name), email: one(query.email) }} />;
}
