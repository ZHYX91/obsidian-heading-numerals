# Changelog

All notable changes will be documented in this file.

## Unreleased

### Changed

- Renamed the product from Heading Numerals to Document Numbering to reflect its broader support
  for heading numbers, captions, and same-file references.
- Changed the plugin ID, installation directory, Properties namespace, CSS namespace, package name,
  release archive name, and repository references from `heading-numerals` to `document-numbering`.

### Breaking

- Obsidian treats `document-numbering` as a different plugin from `heading-numerals`. Existing
  installations and note-level `heading-numerals-*` Properties are not migrated automatically.

## 0.7.0 - 2026-08-21

### Added

- Added display-only numbering for top-level `Figure:`, `Table:`, `Equation:`, and `Code:` captions, with independent per-file counters and no ID requirement.
- Added explicit same-file `@[[#Heading]]` and `@[[#^block-id]]` number enhancement, including Obsidian aliases and fail-closed target resolution.
- Added dedicated Caption and Cross references settings pages in the six-page Obsidian 1.13 and fallback settings experience.

### Changed

- Persisted settings migrate to schema 5 with independent caption and cross-reference display controls.
- The interface language description now explicitly states that Follow Obsidian uses Obsidian's interface language.
- Canonical bilingual product, UX, architecture, testing, README, and acceptance contracts now define one Markdown file as the caption and semantic-reference scope.
- Updated the transitive development-only `nanoid` package to the patched 3.3.18 release.

### Safety

- Caption and reference display never writes Markdown or creates, validates, migrates, repairs, or manages IDs.
- `Listing:`, ordinary wiki links, cross-file targets, missing or duplicate anchors, protected Markdown regions, and targets without a visible valid number remain unchanged.

## 0.6.0 - 2026-08-09

### Added

- Added exact-title exclusions to custom schemes, with separate heading-only and whole-section behavior.
- Added live current-note match feedback while editing exclusion rules.

### Changed

- Excluded headings do not consume counters; whole-section exclusions also skip every descendant until the section ends.
- Heading-only descendants use the existing skipped-level strategy instead of inheriting the previous numbered section.
- Virtual numbers now use a clearer default opacity and one CSS-controlled visual gap in both Live Preview and Reading View.
- Live Preview and Reading View share one virtual-number DOM factory and accessibility contract.
- Persisted settings migrate to schema 4; the old default virtual appearance migrates to the new defaults while custom values are preserved.

### Safety

- Renumbering removes an old prefix from an excluded title only when it is confirmed by a source marker or known template; ambiguous manual prefixes remain unchanged and appear in the preview warnings.

## 0.5.0 - 2026-08-09

### Added

- Added a compact current-note control panel to the ribbon and command palette.
- Added independent tri-state note overrides for virtual numbering and stored-number concealment.
- Added a note-level scheme picker, ignore control, restore-all action, quick file operations, and links to batch processing and global settings.

### Changed

- Note overrides are written only after an explicit choice through Obsidian's public Properties API; Follow global deletes the corresponding property.
- The control panel shows global, note override, and effective values, with a responsive mobile summary.
- Legacy combined display overrides migrate to independent Properties without changing the unedited effect.

### Fixed

- The current-note panel now leaves its loading state after a successful Properties write, so consecutive changes and scrolling remain interactive.

## 0.4.1 - 2026-08-09

### Changed

- Adopted Obsidian DOM helpers in the settings surfaces where they preserve the host document.
- Marked the change-preview modal directly instead of relying on the CSS `:has()` selector.
- Updated installation text now that Heading Numerals is available in Community Plugins.

### Fixed

- Non-browser settings saves now fail explicitly instead of depending on ambient global timers.
- The fallback tab styling no longer requires an unnecessary `!important` override.

## 0.4.0 - 2026-08-09

### Added

- Independent virtual-number and stored-number concealment controls, including the combined display state.
- Android 15 emulator evidence, mobile CodeMirror syntax coverage, and Chinese IME composition acceptance.
- Guarded replacement tests for batch writes and rollback conflicts.

### Changed

- The ribbon menu now presents two independent checkable display effects and a conditional restore-source action.
- Built-in scheme cards use compact one-column template previews, and legacy custom schemes have explicit explanations.
- Retired custom templates remain available for cleanup until the user explicitly clears the history.
- Reading View caches compare exact source text and always remove stale plugin decorations before reevaluating a section.

### Fixed

- Batch writes and rollbacks no longer overwrite content that changed after the previewed replacement.
- Interrupted recovery promotion prefers the newer pending snapshot and falls back safely when it is invalid.
- Preview truncation text now follows the selected interface language.

## 0.3.0 - 2026-08-08

### Added

- Native Obsidian 1.13 settings pages with searchable declarative controls and page-level navigation.
- Dedicated control contract tests for native settings persistence and invalid-value rejection.
- Actionable save failures that retain and display the underlying error message.

### Changed

- Obsidian 1.12 keeps the imperative settings fallback while 1.13 no longer renders custom top tabs.
- The fallback tab bar now shares the Property Order and Chrono Notes visual, focus, overflow, and touch baseline.
- Placeholder help now explains both parts of `{1.arabic}` in plain language.
- Template cleanup labels explicitly cover built-in, active custom, and retired custom templates.
- Built-in schemes use a clear restorable-delete action.

### Fixed

- Hidden save-status and retry elements can no longer be made visible by competing button or layout styles.

## 0.2.0 - 2026-08-08

### Added

- Multiple user-defined numbering schemes with validated placeholders and live previews.
- Expandable built-in scheme templates, removable built-in list entries, and cleanup history for edited or deleted custom schemes.
- Accessible four-section settings navigation with explicit save, retry, and failure states.
- Template-aware cleanup scopes: plugin markers, all current/historical templates, or opt-in common manual numbering.
- Separate bounded `recovery.json` storage using before-content plus SHA-256 after-state verification.
- Deterministic manual-install ZIPs, GitHub Release provenance attestations, and remote byte verification.

### Changed

- `{1.arabic}` and every supported number format are explained with readable examples in settings and documentation.
- “Automatic” language selection is now labeled “Follow Obsidian” / “跟随 Obsidian”.
- Reading View reuses one full-document numbering plan across rendered sections.
- Shared prefix analysis now drives file operations, Live Preview, and Reading View.
- Obsidian `%%` comments are excluded from heading discovery.
- Existing 0.1 settings and recovery data migrate without discarding user configuration.

## 0.1.0 - 2026-08-06

### Added

- Shared ATX heading scanner, prefix parser, numbering engine, and built-in schemes.
- Previewed write, remove, renumber, and source-marker stripping for the current note.
- Live Preview and Reading View virtual/conceal modes.
- Per-note Properties overrides and bilingual settings.
- Previewed folder/vault processing with recovery snapshots and rollback.
- Strict automated tests, offline runtime checks, and release asset validation.
