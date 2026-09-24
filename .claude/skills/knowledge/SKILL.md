---
name: knowledge
description: Record user review feedback, corrections, or stated rules/preferences as durable, generalized knowledge under .claude/knowledge/. Use whenever the user reviews your work and points out a mistake, corrects an approach, or states a rule/preference that should apply beyond this one instance -- not for a one-off clarification with no lasting rule.
---

# Recording feedback as knowledge

When the user reviews your work and gives feedback -- a correction, a stated preference, a rule to follow going forward -- capture it here so it survives past this conversation instead of evaporating once the session ends.

## Procedure

1. **List what's there.** Look at every document under `.claude/knowledge/` (e.g. `architecture.md`) and skim each one's scope/title.
2. **Find or propose a home.**
   - An existing document's scope already covers this feedback -> use it.
   - Nothing fits -> propose a new file (name + one-line scope) to the user and confirm before creating it. Don't invent a new document silently.
3. **Generalize before writing.** Don't transcribe the specific instance ("in Store.tsx, X was wrong"). Write the rule or principle it implies, in the same voice and format as the rest of that document, so it reads as durable guidance a future task can act on without having seen this conversation -- not a log entry about this one.
4. **Append it**, matching the document's existing style (heading level, list format, terseness).
5. **Re-read the whole document** after writing. If the new entry contradicts or confusingly overlaps something already there, don't resolve it yourself -- point out the conflict to the user and propose how to reconcile it (merge, replace the old entry, or keep both with a distinguishing note), and wait for their call before editing further.

Never record something that isn't durable guidance -- a one-off "use X here because Y specific reason" that doesn't generalize belongs in that change's PR description, not here.
