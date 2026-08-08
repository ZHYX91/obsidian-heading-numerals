# Architecture

Heading Numerals has one pure numbering core and thin Obsidian adapters. File operations and display modes must never implement separate numbering semantics.

## Data flow

```text
Markdown source
  -> context-aware ATX scanner
  -> shared number-prefix parser
  -> numbering engine and scheme templates
  -> immutable transform plan OR display decoration plan
  -> Editor/Vault adapter OR Live Preview/Reading View adapter
```

## Core boundaries

- `src/core/heading-parser.ts` scans ATX headings while excluding YAML, fenced code, HTML comments, and HTML blocks. It returns source offsets and never imports Obsidian.
- `src/core/number-parser.ts` classifies plugin and manual prefixes with provenance, style, rule ID, and confidence. Decimal/version/year/measurement-like text is downgraded or rejected.
- `src/core/numbering-engine.ts` owns H1-H6 counters, resets, starts, maximum level, and skipped-level strategy.
- `src/core/schemes.ts` formats all built-in and custom template styles.
- `src/core/transform.ts` creates immutable changes and warnings before any write happens.

## Live Preview

One CodeMirror `ViewPlugin` owns both virtual and conceal modes for each `EditorView`. It:

- confirms scanner candidates against the CodeMirror syntax tree;
- reads the file from `editorInfoField`, not global active-file state;
- distinguishes Live Preview and Source Mode through `editorLivePreviewField`;
- uses a zero-width widget for virtual numbers;
- uses `Decoration.replace` for concealed source ranges;
- removes concealment when any selection touches the heading line or during IME composition; and
- receives a targeted refresh effect when settings change.

Each editor view owns its own cached Properties override. Invalid YAML retains the last valid display configuration for that view, while file-changing commands fail closed.

## Reading View

The Markdown postprocessor reads and numbers the full source document, then maps the current `MarkdownSectionInformation` line range to rendered headings. It applies nothing unless source and rendered heading counts and levels agree exactly.

Virtual numbers are prepended using DOM node APIs. Concealment validates the exact leading text before wrapping it. No heading content is passed to `innerHTML`.

## File writes

Current-note changes are applied to the live editor in one `Editor.transaction`. The preview captures the source, file, and view; any mismatch at confirmation cancels the write.

Batch operations:

1. save open Markdown views;
2. read and plan every target file;
3. show an aggregate preview;
4. verify every source again;
5. persist a bounded before/after recovery snapshot;
6. modify files sequentially; and
7. roll back all completed writes after an error.

Recovery accepts files that still match either the before or after state, so it can repair a process interrupted halfway through a batch. Any independently edited file cancels recovery before writes begin.

## Settings storage

Plugin settings and the most recent batch snapshot share Obsidian's plugin data storage. Settings reset never deletes the recovery snapshot. A configurable size limit prevents an unbounded `data.json`.

## Release contract

The build externalizes Obsidian and CodeMirror host modules and emits exactly:

```text
dist/main.js
dist/manifest.json
dist/styles.css
```

The release checker verifies versions, manifest identity, static asset freshness, bundle size, runtime externals, desktop-only status, and absence of production source maps.
