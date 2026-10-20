import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ publicToken: string }> };

/** Old email links opened this path. The card itself is the door now. */
export default async function FormerAddByEmailPage({ params }: PageProps) {
  const { publicToken } = await params;
  redirect(`/c/${encodeURIComponent(publicToken)}`);
}
