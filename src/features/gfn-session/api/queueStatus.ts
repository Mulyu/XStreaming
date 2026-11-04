// How many people are waiting for a GeForce NOW server, before any session is
// started. NVIDIA exposes the queue position only once a session exists, so
// this reads the community-run PrintedWaste tracker instead: one entry per
// data-centre zone (the same id as the account's server, e.g. "NP-TYO-01"),
// with the queue length seen there. Unofficial, so it can disappear or go
// stale; every failure reads as "no figure" rather than an error.
const QUEUE_URL = 'https://api.printedwaste.com/gfn/queue/';
const QUEUE_TIMEOUT_MS = 8000;

// A zone nobody has sampled for this long is not showing the present queue
// (the tracker keeps entries from long-dead zones around).
const MAX_AGE_SECONDS = 60 * 60;

// The tracker's own estimate is 6 seconds per person plus a fixed 2 minutes.
const SECONDS_PER_PERSON = 6;
const BASE_WAIT_SECONDS = 120;

export type GfnQueueStatus = {
  /** People ahead in this zone's queue. */
  waiting: number;
  /** Estimated wait in minutes, rounded up. */
  etaMinutes: number;
};

type QueueEntry = {
  QueuePosition?: number;
  'Last Updated'?: number;
  eta?: number;
};

// Pure part, for tests: pick the zone's entry out of the tracker's response
// and turn it into a figure, or null when it is missing, malformed or old.
export const parseQueueStatus = (
  payload: any,
  zoneId: string,
  nowSeconds: number,
): GfnQueueStatus | null => {
  const entry: QueueEntry | undefined = payload?.data?.[zoneId];
  const waiting = entry?.QueuePosition;
  const updated = entry?.['Last Updated'];
  if (
    typeof waiting !== 'number' ||
    !Number.isFinite(waiting) ||
    waiting < 0 ||
    typeof updated !== 'number' ||
    nowSeconds - updated > MAX_AGE_SECONDS
  ) {
    return null;
  }
  const etaSeconds =
    typeof entry?.eta === 'number' && entry.eta > 0
      ? entry.eta / 1000
      : waiting * SECONDS_PER_PERSON + BASE_WAIT_SECONDS;
  return {waiting, etaMinutes: Math.max(1, Math.ceil(etaSeconds / 60))};
};

export const fetchGfnQueueStatus = async (
  zoneId: string,
): Promise<GfnQueueStatus | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUEUE_TIMEOUT_MS);
  try {
    const res = await fetch(QUEUE_URL, {
      signal: controller.signal,
      headers: {Accept: 'application/json'},
    });
    if (!res.ok) {
      return null;
    }
    return parseQueueStatus(
      await res.json(),
      zoneId,
      Math.floor(Date.now() / 1000),
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
