// Public API for the gfn-auth feature (the shared device-code sign-in flow
// used by the Library title detail screen and the Settings account row, so
// they don't each keep their own copy of the polling/cancellation state
// machine). Consumers outside this slice import from here, not from
// lib/useGfnSignIn directly.
export {useGfnSignIn} from './lib/useGfnSignIn';
