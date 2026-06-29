# Grill handoff

Two copy-paste blocks. **Part A** is generic (my working prefs — reuse for any grilling
session). **Part B** is the task specific. Paste both together into a fresh session,
or keep Part A around as a reusable preamble.

---

## Part A — Generic grilling prefs (reusable)

```
/grill-with-docs

Working preferences for this grilling session:

- Use context7 BEFORE asserting any library / framework / CLI behavior — never design on
  memory for a dependency.
- Never run git commit or stage anything. I commit myself. "Save the progress" just means
  write the files to disk.
- Record decisions inline as they crystallize:
  - CONTEXT.md is the glossary / ubiquitous language ONLY — no implementation or
    architecture. Preserve my original wording; only fix factual bugs or add missing parts.
  - Write an ADR (docs/adr/, sequential number) only when a decision is hard-to-reverse
    AND surprising-without-context AND a real trade-off. Otherwise record it as a note in
    the target PRD doc.
  - Keep the docs/PRD.md backlog + dependency graph in step (flip status, add links).
- Challenge my words against the glossary, sharpen fuzzy/overloaded terms into precise
  canonical ones, and stress-test domain relationships with concrete edge-case scenarios.
  Cross-reference claims against the actual code; surface contradictions.
- Naming: "Achordeon" for display, "achordeon" for code/paths/identifiers — never mix.
- Architecture grammar: vertical = feature (an Nx `scope`); horizontal = layer (Nx `type`:
  feature/ui/data-access/domain/util); "module" is informal UX-speak only.
```

## Part B - Task specific
