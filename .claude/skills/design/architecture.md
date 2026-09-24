# Feature-Sliced Design (FSD) reference

Layers, strictly one-way (higher imports lower only):
app → pages → widgets → features → entities → shared

- app: global setup/providers/routing. No slices.
- pages: full screens; compose widgets/features/entities.
- widgets: large, self-contained composite UI blocks.
- features: one user-facing action (e.g. add-to-favorites).
- entities: business domain data + its own display (e.g. title, gfn-game).
- shared: generic, domain-agnostic code (ui kit, api client, utils, config). No slices.

Slices: one per domain/feature within a layer. Same-layer slices never import each other directly.

Segments: inside a slice, split by purpose — ui / model / api / lib / config.

Public API: only import a slice/segment's index (barrel) file, never its internals directly.

Goal: predictable placement, low coupling, high cohesion as features grow.
