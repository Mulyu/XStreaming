---
name: design
description: This project's architecture and file-placement principles (Feature-Sliced Design / FSD), summarized in architecture.md. Load before any task that changes code in this repo -- adding, moving, renaming, or refactoring a file, or deciding where new code belongs -- so file placement and import direction follow FSD rather than whatever felt convenient. Also load when discussing or planning a refactor/directory reorganization.
---

# Design principles

Read `architecture.md` (same directory as this file) for the full FSD layer/slice/segment/import-direction summary before placing, moving, or importing anything.

## How to apply it here

- `src/` does not yet follow FSD -- it's organized by technical type (`pages/`, `components/`, `store/`, ...), not by layer/slice. FSD is the **target** structure, adopted incrementally.
- **New code**: place it and structure its imports per FSD's rules from the start, even though the surrounding directory doesn't fully follow FSD yet.
- **A small fix in existing code**: leave the file where it is; don't drag file-placement or import restructuring into an unrelated bug fix.
- **An explicit refactor/reorg task**: apply FSD's layer order and slice isolation rules to the target structure you propose.
- Never mass-migrate the existing tree to FSD on your own initiative. That's a large, explicit decision made and sequenced with the user (as with this repo's ongoing directory refactor), not something to start opportunistically mid-task.
