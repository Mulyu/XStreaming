// Runs `worker` over `items` with at most `limit` in flight at once. Resolves
// when every item is done; the worker is expected to handle its own errors
// (one failing item must not stop the rest, so a rejection is swallowed here).
export const runPool = async <T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const runners = Array.from(
    {length: Math.max(1, Math.min(limit, items.length))},
    async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await worker(item);
        } catch {}
      }
    },
  );
  await Promise.all(runners);
};
