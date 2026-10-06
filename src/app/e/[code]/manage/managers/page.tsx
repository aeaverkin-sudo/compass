import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ code: string }> };

export default async function ManageManagersPage({ params }: PageProps) {
  const { code } = await params;
  redirect(`/e/${encodeURIComponent(code)}/manage`);
}
