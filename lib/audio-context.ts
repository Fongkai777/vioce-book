/** Detach first so overlapping unmount/HMR cleanups cannot close it twice. */
export function releaseAudioContext(holder: { current: { state: string; close: () => Promise<void> } | null }) {
  const context = holder.current;
  holder.current = null;
  if (context && context.state !== "closed") void context.close().catch(() => {});
}
