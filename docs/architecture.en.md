---
doc_id: architecture
language: en
source_language: zh-CN
translation_of: architecture.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-13
---

# Architecture

[中文规范源](architecture.zh-CN.md)

<!-- section: authority -->
## Document authority

The Chinese document is the normative architecture source; this file is its synchronized English
translation. Legacy `ARCHITECTURE.md` remains only as migration navigation and is not a second
authority.

<!-- section: system-shape -->
## System shape

```text
Markdown source
  -> context-aware ATX scanner
  -> template compiler + shared prefix analysis
  -> numbering engine and scheme templates
  -> immutable transform plan OR display decoration plan
  -> Editor/Vault adapter OR Live Preview/Reading View adapter
```

The numbering core and plan layers remain pure. Obsidian, CodeMirror, DOM, Editor, and Vault exist
only in adapters. Virtual display and file operations cannot implement separate numbering rules.

<!-- section: core -->
## Core and configuration boundaries

`heading-parser.ts` returns ATX headings and source offsets while skipping frontmatter, fenced code,
HTML/Obsidian comments, and blocks. `template-compiler.ts` compiles placeholders into an AST used for
rendering, validation, and template-prefix recognition. `number-parser.ts` supplies provenance,
style, rule, and confidence for plugin, template, and manual prefixes; `prefix-analysis.ts` is the
shared display/write entry point.

`numbering-engine.ts` owns H1-H6 counters, starts, resets, empty-template structural semantics,
exclusions, and skipped-level strategy. The legacy maximum level is not part of the core interface;
until migration completes, the settings adapter derives affected levels as empty output templates
and retains original templates for recognition. `scheme-template-validation.ts` defines new
semantics, while the migration probe reports risk without silently deleting old data.

<!-- section: display-adapters -->
## Display adapters

Each CodeMirror `EditorView` owns one `ViewPlugin` that confirms scanner candidates against the
syntax tree, distinguishes Live Preview from Source Mode, and uses `Decoration.widget` and
`Decoration.replace` for virtual display and concealment. Concealment is removed when selection
touches a heading or during IME composition. Each view caches its effective Properties. Invalid YAML
may retain the last valid display configuration, but file operations fail closed.

The Reading View postprocessor reads the full source and creates one document numbering plan before
mapping `MarkdownSectionInformation` ranges. DOM changes occur only when source and rendered heading
counts and levels match exactly; concealment also validates exact leading text. Heading content is
never passed to `innerHTML`.

<!-- section: file-mutations -->
## File mutations

Current-note work creates an immutable `TransformPlan`, then revalidates file, view, and source at
confirmation before applying one editor transaction. Batch work saves open editors, plans every
file, shows an aggregate preview, revalidates all sources, persists a bounded recovery snapshot,
then performs exact-content conditional replacements. Failure rolls back only files that still
contain plugin output. Concurrent edits are preserved and recovery remains available.

<!-- section: persistence -->
## Persistence

`data.json` stores schema-versioned settings only. A serialized save coordinator coalesces frequent
updates and exposes pending, failure, and retry state. The latest batch snapshot is stored separately
in `recovery.json`; settings reset cannot delete it. Templates retired by custom-scheme edits or
deletion enter cleanup history until explicitly cleared.

<!-- section: release-boundary -->
## Build and release boundary

The build externalizes Obsidian and CodeMirror host modules and emits only `dist/main.js`,
`dist/manifest.json`, and `dist/styles.css`. Source gates, candidate contracts, and version contracts
do not replace isolated-vault host acceptance. See the [release policy](release.en.md).

<!-- section: change-rules -->
## Change rules

- `src/core` cannot import Obsidian, browser globals, or Node runtime modules.
- File writes consume only immutable plans that passed preview and stale-content validation.
- Broader cleanup recognition requires false-positive tests first.
- New settings need sanitization, cloning, persistence, UI contract, and migration paths.
- Changes to Chinese architecture, product, or UX sources synchronize English and pass docs checks.
