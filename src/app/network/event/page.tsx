import { redirect } from "next/navigation";
import { EventEntryScreen } from "@main/components/event-entry-screen";
import { eventsDeskOpen } from "@/shared/services/desk-access";

export default function EventPage() {
  if (!eventsDeskOpen()) redirect("/network");
  return <EventEntryScreen />;
}
