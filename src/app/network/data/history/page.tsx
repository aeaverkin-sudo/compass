import { redirect } from "next/navigation";
import { dataDeskOpen } from "@/shared/services/desk-access";
import { DataScreen } from "../data-screen";

export default function NetworkDataHistoryPage() {
  if (!dataDeskOpen()) redirect("/network");
  return <DataScreen history />;
}
