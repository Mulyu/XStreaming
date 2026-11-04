import React from 'react';
import {
  CatalogTitle,
  fetchPsScreenshots,
  fetchPsStarRating,
  fetchPsStoreBrief,
  PsId,
  PsStarRating,
  PsStoreBrief,
} from '../../../entities/catalog-title';

export type PsStoreDetails = {
  brief: PsStoreBrief | null;
  rating: PsStarRating | null;
  screenshots: string[];
};

// The store id to ask PlayStation about: the concept when the catalog knows
// it (its rating pools every edition), else the product.
export const psIdOf = (title: CatalogTitle | undefined): PsId | null => {
  const raw = title?.psplus?.raw;
  const conceptId = raw?.conceptId;
  if (conceptId) {
    return {conceptId: String(conceptId)};
  }
  const productId = raw?.productId || title?.store?.refs.ps;
  return productId ? {productId: String(productId)} : null;
};

// What the PlayStation Store knows about a title that its catalog entry does
// not: genres, age rating and edition, the star rating with its count, and
// screenshots. None of it needs a sign-in; any part the store cannot answer
// is simply left out.
export const usePsStoreDetails = (
  title: CatalogTitle | undefined,
): PsStoreDetails | null => {
  const [details, setDetails] = React.useState<PsStoreDetails | null>(null);
  const id = psIdOf(title);
  const key = id ? `${id.conceptId ?? ''}|${id.productId ?? ''}` : '';
  const name = title?.title ?? '';

  React.useEffect(() => {
    setDetails(null);
    if (!id) {
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchPsStoreBrief(id),
      fetchPsStarRating(id),
      fetchPsScreenshots({title: name, productId: id.productId}),
    ]).then(([brief, rating, screenshots]) => {
      if (!cancelled) {
        setDetails({brief, rating, screenshots});
      }
    });
    return () => {
      cancelled = true;
    };
    // `id` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, name]);

  return details;
};
