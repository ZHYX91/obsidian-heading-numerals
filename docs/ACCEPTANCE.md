# Runtime acceptance checklist

Automated checks are necessary but do not prove Obsidian runtime behavior. Complete this checklist in a disposable acceptance Vault before publishing a release. Do not use a production Vault for first acceptance.

## Test setup

- [ ] Build with `npm ci && npm run check`.
- [ ] Copy only `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` into `.obsidian/plugins/heading-numerals/`.
- [ ] Hash-verify the copied files.
- [ ] Ensure no other heading-number plugin or CSS counter snippet is active.
- [ ] Record Obsidian version, OS, theme, and plugin version.

## Highest-value loop

- [ ] In Live Preview, show virtual numbers for an unnumbered note and confirm the file hash and mtime do not change.
- [ ] Switch to Reading View and confirm numbering continues correctly across rendered sections.
- [ ] Write numbers to the current note, inspect the preview, apply, then undo and redo once.
- [ ] Conceal the stored numbers, move the cursor into each heading, select across a prefix, copy, and use a Chinese IME.
- [ ] Reload and disable the plugin; confirm source text remains accessible and Reading View DOM decoration disappears.

## Multi-pane and lifecycle

- [ ] Open different notes in two panes with different Properties view modes.
- [ ] Open a pop-out window and verify styling and independent view state.
- [ ] Edit a heading to another heading of the same character length; decorations must update.
- [ ] Edit Properties from `show` to `conceal` without changing file length; the mode must update.
- [ ] Scroll a note with at least 2,000 headings and record editing latency.

## Parser safety

- [ ] YAML, backtick/tilde code fences, HTML comments/blocks, blockquotes, lists, and Setext headings remain unchanged.
- [ ] `3.14`, `2.0`, `2026`, dates, and unit quantities remain visible and are not removed by high-confidence cleanup.
- [ ] Wiki links, aliases, bold text, inline code, Emoji, CRLF, trailing hashes, BOM, and final newline are preserved.
- [ ] Multi-prefix headings appear clearly in preview.

## Source markers

Source markers are disabled by default. Before enabling them for a release claim:

- [ ] Verify Outline and Search display.
- [ ] Copy heading text and inspect it in an external editor.
- [ ] Copy a heading link, reload Obsidian, and navigate it.
- [ ] Test Unicode normalization and a formatter round-trip.
- [ ] Test malformed and one-sided markers; they must fail closed.
- [ ] Run the strip-marker command and verify visible numbers remain.

## Batch recovery

- [ ] Use a temporary folder with at least ten notes and preview write, remove, and renumber.
- [ ] Change one file after preview; the entire batch must cancel.
- [ ] Apply a batch, then restore it; every file must be byte-identical to its original.
- [ ] Independently edit one applied file; restore must cancel without changing any file.
- [ ] Simulate a mid-batch error and confirm completed files roll back or remain recoverable from the pending snapshot.
- [ ] Excluded folders are not read into the preview and are not modified.

## Themes and platform

- [ ] Test the default theme and at least one third-party theme.
- [ ] Test Windows desktop and one additional desktop platform before claiming cross-platform support.
- [ ] Keep `isDesktopOnly: true` until mobile device acceptance is complete.

## Acceptance record

Record evidence here or in a release issue:

```text
Plugin commit:
Artifact SHA-256:
Obsidian version:
Operating system:
Vault path/type:
Automated gate:
Manual cases passed:
Known limitations:
Accepted by/date:
```
