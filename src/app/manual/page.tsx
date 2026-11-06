import { permanentRedirect } from "next/navigation";

/** Old address. The page lives at /info. */
export default function ManualRedirect() {
  permanentRedirect("/info");
}
