import { notFound } from "next/navigation";
import { ContactScreen } from "@/features/contact-collect/contact-screen";
import { readExternalContact } from "@/features/contact-collect/store";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";

export default async function CollectedContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await requireOwnerId();
  if (!owner.ok) return null;
  if (!isUuid(id)) notFound();
  const loaded = await readExternalContact(owner.id, id);
  if (!loaded.ok) notFound();
  return <ContactScreen contact={loaded.contact} />;
}
