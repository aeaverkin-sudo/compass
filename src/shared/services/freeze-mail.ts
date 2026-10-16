/**
 * Cold entry no longer makes a pass that expires. The reminder for the event itself still goes.
 * The cron still calls this; it sends nothing.
 */
export async function sendFreezeMails(origin: string): Promise<number> {
  void origin;
  return 0;
}
