# Heading Numerals

[简体中文](docs/i18n/README.zh-CN.md)

Heading Numerals separates two decisions that Markdown tools often mix together: whether heading
numbers are stored in a Markdown file and whether those numbers are visible in Obsidian. It can
write, remove, virtually display, or visually conceal heading numbers without network access or
telemetry.

Current release: `0.6.0`. The plugin is available from Obsidian Community Plugins. Automated gates,
packaged-candidate checks, and dated Obsidian acceptance records are separate forms of evidence.

<!-- section: features -->
## Features

- Show calculated heading numbers in Live Preview and Reading View without changing Markdown.
- Conceal recognized stored numbers while keeping the source unchanged and accessible.
- Combine virtual display and concealment to replace one recognized stored prefix visually.
- Preview and then write, remove, or renumber headings in the current note.
- Process a folder or vault with stale-content guards, bounded recovery data, and conflict-safe
  rollback.
- Use built-in hierarchical, Chinese official-document, and legal-document schemes.
- Create multiple custom schemes with validated H1-H6 templates and retained cleanup history.
- Exclude an exact heading or its whole subtree without consuming a number.
- Override display, concealment, scheme, cleanup scope, starting counters, or full opt-out per note.
- Use English or Simplified Chinese interface text.

<!-- section: requirements-and-compatibility -->
## Requirements and compatibility

- Obsidian `1.12.7` or later.
- The manifest permits desktop and mobile loading.
- Dated runtime records exist for Windows desktop and an Android 15 / API 35 emulator.
- Emulator evidence is not physical-device evidence. Physical Android devices, macOS, and Linux
  remain separate, unaccepted targets until dated records exist for them.
- Automated tests do not prove host behavior. See the
  [testing strategy](docs/testing-strategy.en.md) and the non-authoritative
  [runtime checklist](docs/ACCEPTANCE.md).

<!-- section: installation -->
## Installation

### Community Plugins

In Obsidian, open **Settings → Community plugins → Browse**, search for **Heading Numerals**, install
it, and enable it.

### Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from one matching GitHub Release. Place those
three files in `.obsidian/plugins/heading-numerals/`, then reload Obsidian and enable the plugin.
Do not mix files from different versions.

<!-- section: usage -->
## Usage

| Source state | Desired result | Action | Changes Markdown |
|---|---|---|---|
| No stored number | Show a number only in Obsidian | Enable virtual numbers | No |
| No stored number | Save calculated numbers | Write heading numbers | Yes |
| Stored number | Hide it visually | Enable concealment | No |
| Stored number | Replace it with a calculated display number | Enable virtual numbers and concealment | No |
| Stored number | Remove it from the file | Remove heading numbers | Yes |

Use the ribbon icon or **Open current note controls** command for note-level display and scheme
choices. File-changing commands always show a preview. Writing or removing a number changes the
heading text and can invalidate `[[Note#Heading]]` links, heading embeds, or external anchors; the
plugin does not guess and rewrite those links.

<!-- section: settings -->
## Settings

### Numbering schemes

Templates use `{heading-level.number-format}` placeholders, such as `{1.arabic}` or
`{2.chinese_lower}`. Supported formats are Arabic, full-width Arabic, lower/upper Chinese, circled,
upper/lower Latin letters, and upper/lower Roman numerals.

An empty Hn template does not output a number, but that heading remains structural: it increments
its counter, resets deeper counters, and can be referenced by descendant templates. A non-empty Hn
template must include an Hn placeholder and must not reference a deeper heading level. The maximum
numbered heading level remains available as a compatibility control; scheme templates are the
per-level rule used by the numbering core.

Custom schemes may exclude exact logical heading titles. A whole-subtree exclusion skips the
heading and all descendants; a heading-only exclusion leaves descendants to the selected
skipped-level strategy. Exclusions do not use fuzzy matching or regular expressions.

### Cleanup and source markers

The default cleanup scope recognizes source markers plus current and retired built-in/custom
templates. The broader common-manual-number scope is opt-in and previewed. Ambiguous decimals,
versions, years, dates, and measurement-like prefixes are preserved by default.

Optional U+2060 source markers make plugin-written numbers exact to identify. They are experimental
and disabled by default because invisible characters can affect interoperability, copied text, and
heading links. A dedicated command removes markers while retaining visible numbers.

### Per-note Properties

The current-note panel exposes global, override, and effective values. Untouched notes receive no
plugin Properties. Returning a control to **Follow global** deletes that property; **Restore all**
removes every Heading Numerals override and preserves unrelated Properties.

```yaml
---
heading-numerals-show-virtual: true
heading-numerals-conceal-stored: true
heading-numerals-scheme: hierarchical-h2
heading-numerals-clean-scope: templates
heading-numerals-start:
  h2: 3
---
```

`heading-numerals-ignore: true` opts the note out of display and file operations. Legacy combined
display and cleanup-confidence properties are read for backward compatibility.

<!-- section: limitations -->
## Limitations

- One Markdown file has one effective numbering scheme; section-local scheme switching is not
  supported.
- Only top-level ATX H1-H6 headings are handled. Setext headings, blockquotes, lists, comments,
  frontmatter, fenced code, and HTML blocks are not numbering targets.
- Canvas, embedded-note special handling, Outline, Backlinks, Search Results, and PDF export
  integration are not included in `0.6.0`.
- Source Mode decorations are disabled by default so stored Markdown remains directly visible.
- Reading View concealment changes visible text, not the heading DOM `id`; anchors still follow the
  stored heading.
- If a third-party renderer changes heading count or levels, Reading View fails closed for that
  section.

<!-- section: privacy-and-security -->
## Privacy and security

Heading Numerals runs locally and contains no networking, telemetry, analytics, advertisements,
remote fonts, or remote assets. Virtual display and concealment never call file-write APIs.

Current-note changes use one editor transaction. Batch operations preview all targets, revalidate
their exact content, persist bounded recovery data, and avoid overwriting concurrent edits. These
safeguards reduce risk but do not make first-run testing in an ordinary or production vault
appropriate. Use an isolated test vault for acceptance.

Report security or data-loss concerns through [GitHub Security Advisories](SECURITY.md) without
including private vault content.

<!-- section: development -->
## Development

Use Node.js `24.18.0` and npm `11.16.0`.

```bash
npm ci
npm run check
```

`npm run check` verifies the pinned runtime, formatting, bilingual README and canonical-document
contracts, lint, strict TypeScript, coverage thresholds, the production bundle, and the exact
release layout. It is source/package evidence, not Obsidian runtime acceptance.

Stable project documents:

- [Product requirements](docs/product-requirements.en.md)
- [UX specification](docs/ux-spec.en.md)
- [Architecture](docs/architecture.en.md)
- [Testing strategy](docs/testing-strategy.en.md)
- [Release policy](docs/release.en.md)

Governance and project history:

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

<!-- section: support -->
## Support

Use [GitHub Issues](https://github.com/ZHYX91/obsidian-heading-numerals/issues) for reproducible bugs
and feature requests. Include plugin and Obsidian versions, operating system, minimal synthetic
Markdown, the selected scheme, and the exact action taken. Do not attach private vault content.

<!-- section: license -->
## License

[MIT](LICENSE)
