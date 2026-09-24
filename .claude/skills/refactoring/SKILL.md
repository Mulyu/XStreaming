---
name: refactoring
description: Procedure for bringing this repo's existing directory structure in line with its target architecture (Feature-Sliced Design, in .claude/knowledge/architecture.md). Use when asked to refactor, reorganize, or restructure the codebase (or a specific directory/screen within it) toward the architecture -- not for a single unrelated bug fix or new feature, where the `design` skill's lighter "follow it for new code" guidance applies instead.
---

# Refactoring toward the target architecture

This is the procedure for closing the gap between the current `src/` layout and this repo's target architecture. It doesn't own the architecture itself -- that's `.claude/knowledge/architecture.md`, shared with the `design` skill so both stay in sync with one reference instead of two copies drifting apart.

## Procedure

1. **Load the architecture.** Read `.claude/knowledge/architecture.md` in full before evaluating anything against it.
2. **Load the current structure.** Survey the real directory tree (`src/` and its subdirectories) -- what's in each directory, roughly how large each file/area is, and what organizing principle (if any) it currently follows.
3. **Detect divergence.** For each area, name concretely how it diverges from the architecture: wrong layer, no slice/segment boundaries, cross-slice imports, a missing public API (barrel/index), a god-file mixing more than one slice's concerns, etc. Verify with the actual code (grep imports, check what references what) rather than assuming from directory names alone.
4. **Order by size, smallest first.** Rank the divergences by how much has to move or change to fix each one. Start with the smallest. This surfaces a working pattern early, and gives cheap, independently reviewable and revertible steps instead of one large diff.
5. **Propose before acting.** Present the ordered list with a one-line reason per item, and confirm scope with the user -- which item(s), how many in this pass -- before touching files. A directory-level restructure is exactly the kind of architecturally-significant change that's cheaper to agree on scope for up front than to unwind after the fact.
6. **Execute one item at a time.** Move/split/rename per the architecture's layer -> slice -> segment structure, fix every import the move breaks, and add or update the slice's public API (index) where the architecture calls for one. Validate before calling an item done, and before starting the next one.

Do not attempt the whole migration in one pass, and do not reorganize unrelated code just because you're passing through it -- each item lands as its own reviewable, revertible step, not a detour inside a bigger one.
