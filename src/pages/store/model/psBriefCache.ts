import {PsStoreBrief} from '../../../entities/catalog-title';
import {storage} from '../../../shared/lib/mmkv';

// A product's genres and average rating change slowly, and the chart lists the
// same bestsellers day after day -- keep what was fetched for a week.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const keyOf = (locale: string, productId: string): string =>
  `store.psBrief.${locale}.${productId}`;

export const readPsBrief = (
  locale: string,
  productId: string,
  now = Date.now(),
): PsStoreBrief | null => {
  const raw = storage.getString(keyOf(locale, productId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.ts === 'number' &&
      now - parsed.ts < TTL_MS &&
      parsed.brief &&
      Array.isArray(parsed.brief.genres)
    ) {
      return parsed.brief as PsStoreBrief;
    }
  } catch {}
  return null;
};

export const writePsBrief = (
  locale: string,
  productId: string,
  brief: PsStoreBrief,
  now = Date.now(),
): void => {
  try {
    storage.set(keyOf(locale, productId), JSON.stringify({ts: now, brief}));
  } catch {}
};
