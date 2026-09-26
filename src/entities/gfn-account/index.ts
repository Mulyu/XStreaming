// Public API for the gfn-account entity (GeForce NOW device-code sign-in,
// OAuth/client-token persistence and refresh, and the JWT/user-id derived
// from the stored tokens). Kept at the entities layer since both
// features/gfn-auth (the sign-in UI hook) and the future features/gfn-session
// (streamAdapter's token lookup for launching a stream) need it, and two
// features can't import each other directly. Consumers outside this slice
// import from here, not from model/auth directly.
export * from './model/auth';
