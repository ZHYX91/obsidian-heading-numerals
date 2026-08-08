# Changelog

All notable changes will be documented in this file.

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
