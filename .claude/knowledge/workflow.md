# Development workflow conventions

- Merge policy: always merge a PR immediately once it passes the standard
  validation sequence (`detect-divergence.js` at 0 items, `tsc --noEmit`,
  `eslint`, `jest` -- all at or better than the existing baseline) and GitHub
  reports it mergeable/clean. Don't hold a PR open pending the user's own
  on-device testing first, even for changes touching higher-risk areas like
  live gameplay input handling -- merge, then let any issues surface as
  follow-up feedback rather than gating the merge on manual verification.
