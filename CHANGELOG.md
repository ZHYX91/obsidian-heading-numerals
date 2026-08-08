# Changelog

All notable changes will be documented in this file.

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
