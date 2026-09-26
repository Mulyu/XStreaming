// Public API for the title-capabilities entity (canonical capability id ->
// icon + label, and a star-rating renderer, for a catalog title's detail
// screen). Split into its own slice rather than folded into
// entities/catalog-title: it pulls react-native-vector-icons, and merging it
// into catalog-title's barrel previously broke pages/store/storeLogic.ts's ability
// to load that barrel standalone in Jest (storeLogic.ts is deliberately kept
// free of native-UI deps so it can be unit tested directly -- see its own
// comment). Consumers outside this slice import from here, not from
// ui/titleCapabilities directly.
export {CAP_META, capLabel, renderStars} from './ui/titleCapabilities';
