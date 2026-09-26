# Feature-Sliced Design (FSD) reference

Layers, strictly one-way (higher imports lower only):
app → pages → widgets → features → entities → shared

- app: global setup/providers/routing. No slices.
- pages: full screens; compose widgets/features/entities.
- widgets: large, self-contained composite UI blocks.
- features: one user-facing action (e.g. add-to-favorites).
- entities: business domain data + its own display (e.g. title, gfn-game).
- shared: generic, domain-agnostic code (ui kit, api client, utils, config). No slices.

Slices: one per domain/feature within a layer, and always a folder --
`<layer>/<slice>/...`, never a loose file directly under a sliced layer
(pages/widgets/features/entities; app and shared have no slices, so this
doesn't apply to them). Same-layer slices never import each other directly.

Segments: inside a slice, split by purpose — ui / model / api / lib / config.

Page slices specifically: `pages/<name>/index.tsx` is the slice's entry
point. `ui/` holds pure components only -- they render
whatever they're given as props and call no hooks (including presentational
ones like a theme/translation hook), full stop. `model/` holds the custom
hook(s) that own all of that page's state, data-fetching, and handlers, and
never returns JSX. `index.tsx` composes the two -- call the model hook, pass
its result to the ui component -- and stays thin; it's the only file in the
slice allowed to do both.

Public API: only import a slice/segment's index (barrel) file, never its internals directly.

Goal: predictable placement, low coupling, high cohesion as features grow.
