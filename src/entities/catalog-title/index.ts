// Public API for the catalog-title entity (the merged xCloud+GFN title
// shape the Library/Store screens render). Consumers outside this slice
// import from here, not from model/unifiedCatalog directly.
export type {CatalogTitle} from './model/unifiedCatalog';
export {
  buildUnifiedCatalog,
  isCatalogTitleOwned,
  buildXcloudCatalogTitle,
  buildGfnCatalogTitle,
} from './model/unifiedCatalog';
