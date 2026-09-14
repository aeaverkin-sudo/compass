import { EventDetail } from "@/features/events/components/event-detail";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetail eventId={id} />;
}
