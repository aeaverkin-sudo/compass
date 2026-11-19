import { notFound } from "next/navigation";
import { PushbackScreen } from "@/features/contact-collect/pushback-screen";
import { readExternalContact } from "@/features/contact-collect/store";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";

export default async function PushbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const owner = await requireOwnerId();
  if (!owner.ok) return null;
  if (!isUuid(id)) notFound();
  const loaded = await readExternalContact(owner.id, id);
  if (!loaded.ok) notFound();
  return <PushbackScreen contact={loaded.contact} fresh={query.new === "1"} />;
}
