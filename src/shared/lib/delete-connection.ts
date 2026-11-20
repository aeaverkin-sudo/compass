/** Server delete for a Network connection. Retries once; cleans Notes copies. */
export async function deleteConnectionRemote(id: string): Promise<boolean> {
  const drop = async () => {
    const response = await fetch(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE" });
    return response.ok;
  };
  try {
    if (await drop()) return true;
  } catch {
    // try again below
  }
  await new Promise((resolve) => window.setTimeout(resolve, 1500));
  try {
    return await drop();
  } catch {
    return false;
  }
}
