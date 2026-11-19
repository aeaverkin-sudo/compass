import { notFound } from "next/navigation";
import { suggestedEventTag } from "@/features/contact-collect/event-tag";
import { NewContactForm } from "@/features/contact-collect/new-contact-form";
import { readExternalContact } from "@/features/contact-collect/store";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";

export default async function EditCollectedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await requireOwnerId();
  if (!owner.ok) return null;
  if (!isUuid(id)) notFound();
  const [loaded, eventTag] = await Promise.all([readExternalContact(owner.id, id), suggestedEventTag(owner.id)]);
  if (!loaded.ok) notFound();
  return <NewContactForm suggestedEvent={eventTag} initial={loaded.contact} />;
}
