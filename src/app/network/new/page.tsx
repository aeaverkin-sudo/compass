import { NewContactForm } from "@/features/contact-collect/new-contact-form";
import { suggestedEventTag } from "@/features/contact-collect/event-tag";
import { requireOwnerId } from "@/shared/services/attachment-api";

export default async function NewContactPage() {
  const owner = await requireOwnerId();
  const eventTag = owner.ok ? await suggestedEventTag(owner.id) : "";
  return <NewContactForm suggestedEvent={eventTag} />;
}
