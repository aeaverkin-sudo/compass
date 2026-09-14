import { nanoid } from "nanoid";
import type { ContentSlot, Person } from "@/shared/types";

function demoSlot(label: string, value: string, type: ContentSlot["type"] = "link"): ContentSlot {
  return { id: nanoid(), label, type, value, order: 0 };
}

export function seedDemoPerson(direction: "received" | "sent"): Omit<Person, "id" | "createdAt"> {
  const slots: ContentSlot[] = [
    { ...demoSlot("Website", "https://example.com"), order: 0 },
    { ...demoSlot("LinkedIn", "https://linkedin.com/in/james"), order: 1 },
    { ...demoSlot("Pitch Deck", "", "pdf"), order: 2 },
  ];

  return {
    direction,
    name: "James Morrison",
    headline: "Founder · Consumer Marketplace",
    description: "Building sustainable consumer marketplace. Seed stage.",
    photo: undefined,
    selfiePhoto: undefined,
    showSelfie: false,
    slots,
    context: {
      eventName: "Web Summit",
      location: "Lisbon, Portugal",
      date: new Date().toISOString(),
      metAt: "Networking lounge, Day 2",
    },
    notes: [],
    privateSave: false,
    positiveOutcome: "none",
  };
}
