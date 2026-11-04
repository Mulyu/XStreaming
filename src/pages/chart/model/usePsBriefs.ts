import React from 'react';
import {
  fetchPsStoreBrief,
  getPsStoreLocale,
  PsStoreBrief,
} from '../../../entities/catalog-title';
import {readPsBrief, writePsBrief} from './psBriefCache';

// The category listing PlayStation's chart comes from carries neither genres
// nor a rating, and the store has no bulk endpoint for them: one small request
// per title. Fetched a few at a time for the rows the list has loaded so far,
// and kept (see psBriefCache) so reopening the list costs nothing.
const CONCURRENCY = 4;

export const usePsBriefs = (
  productIds: string[],
  enabled: boolean,
): Record<string, PsStoreBrief> => {
  const [briefs, setBriefs] = React.useState<Record<string, PsStoreBrief>>({});
  // Ids already answered from cache or queued this session, so a failed
  // lookup is not retried on every render.
  const seenRef = React.useRef(new Set<string>());
  const queueRef = React.useRef<string[]>([]);
  const workersRef = React.useRef(0);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    const locale = getPsStoreLocale();
    const cached: Record<string, PsStoreBrief> = {};
    productIds.forEach(id => {
      if (seenRef.current.has(id)) {
        return;
      }
      seenRef.current.add(id);
      const hit = readPsBrief(locale, id);
      if (hit) {
        cached[id] = hit;
      } else {
        queueRef.current.push(id);
      }
    });
    if (Object.keys(cached).length > 0) {
      setBriefs(prev => ({...prev, ...cached}));
    }
    const worker = async () => {
      workersRef.current += 1;
      try {
        for (let id = queueRef.current.shift(); id; ) {
          const brief = await fetchPsStoreBrief({productId: id});
          if (!aliveRef.current) {
            return;
          }
          if (brief) {
            writePsBrief(locale, id, brief);
            const key = id;
            setBriefs(prev => ({...prev, [key]: brief}));
          }
          id = queueRef.current.shift();
        }
      } finally {
        workersRef.current -= 1;
      }
    };
    while (workersRef.current < CONCURRENCY && queueRef.current.length > 0) {
      worker();
    }
  }, [productIds, enabled]);

  return briefs;
};
