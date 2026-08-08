# Heading Numerals

[中文](#中文) · [English](#english)

Heading Numerals separates two decisions that Markdown tools often mix together:

- whether heading numbers are stored in the Markdown file; and
- whether heading numbers are visible in Obsidian.

It can write, remove, virtually display, or visually conceal heading numbers without network access or telemetry.

> Current release: `0.2.0`. Automated checks and release-asset verification are built in; real Obsidian behavior is still tracked separately in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). The plugin is not yet listed in Obsidian Community Plugins.

## 中文

### 核心能力

| 源文件状态 | 你想看到的效果 | 使用方式 | 是否修改 Markdown |
|---|---|---|---|
| 没有序号 | 只在界面看到序号 | 显示虚拟序号 | 否 |
| 没有序号 | 把序号保存到文件 | 写入标题序号 | 是 |
| 已有序号 | 保留文件但不在界面显示 | 隐藏已有序号 | 否 |
| 已有序号 | 从文件删除序号 | 清理标题序号 | 是 |

显示与隐藏使用 CodeMirror 6 Decoration 和 Reading View 后处理器，不改文件内容；写入、清理和重新编号会先显示逐项预览。

### 安全设计

- 只处理标准 ATX 标题（`#` 至 `######`），跳过 YAML、围栏代码块、HTML/Obsidian `%%` 注释与块、blockquote、列表和普通文本。
- 默认不删除 `3.14`、`2.0`、`2026`、日期、单位数量等有歧义的数字文本。
- 写入命令不会静默覆盖人工序号；重新编号只会在预览后规范化高置信度人工序号。
- 当前笔记的全部变更通过一次 Editor transaction 应用，可单步撤销。
- 文件夹/全库处理必须预览；应用前重新校验每个文件，先保存可恢复快照，失败时回滚。
- 显示功能无网络请求、遥测或远程资源。
- 不可见 U+2060 来源标记是实验选项，默认关闭；随时可以执行“移除来源标记”而保留可见序号。

实体操作会改变标题文本，因此可能使 `[[笔记#标题]]`、标题嵌入或外部锚点失效。预览窗口会明确提醒，但插件不会猜测并重写你的链接。

### 序号方案

- 层级数字（H1 起始）：`1`、`1.1`、`1.1.1`
- 层级数字（H2 起始）：H1 作为文档标题，H2 从 `1` 开始
- 中文公文：`一、`、`（一）`、`1.`、`（1）`、`①`
- 法律条文：`第一编`、`第一章`、`第一节`、`第一条`
- 自定义方案：可添加多个、修改、删除；内置方案可展开查看并复制成自定义方案

占位符写法是 `{标题层级.数字格式}`。例如 `{1.arabic}` 表示“把 H1 的计数显示为阿拉伯数字”，`{2.chinese_lower}` 表示“把 H2 的计数显示为中文小写数字”。设置页会直接列出并预览所有格式：

| 数字格式 | 示例 |
|---|---|
| `arabic` / `arabic_full` | `1` / `１` |
| `chinese_lower` / `chinese_upper` | `一` / `壹` |
| `circled` | `①` |
| `letter_upper` / `letter_lower` | `A` / `a` |
| `roman_upper` / `roman_lower` | `I` / `i` |

清理范围默认选择“当前及历史模板”：它会识别来源标记、全部内置方案、全部自定义方案以及自定义方案保存或删除前的历史版本。较宽的“常见人工序号”范围需要用户主动选择，并始终通过变更预览；人工输入的数字不会因为看起来相似就被静默删除。

### 命令

- 切换为原样显示 / 显示虚拟标题序号 / 隐藏已有标题序号
- 向当前笔记写入标题序号
- 清理当前笔记的标题序号
- 重新编号当前笔记
- 移除当前笔记中的来源标记
- 处理文件夹或整个库
- 撤销最近一次批量处理
- 循环切换当前笔记显示模式

### Properties 覆盖

```yaml
---
heading-numerals: show
heading-numerals-scheme: hierarchical-h2
heading-numerals-clean-scope: templates
heading-numerals-start:
  h2: 3
---
```

`heading-numerals` 可设为 `inherit`、`normal`、`show`、`conceal` 或 `off`。`heading-numerals-clean-scope` 可设为 `plugin`、`templates` 或 `common`。也可以使用 `heading-numerals-ignore: true` 让当前笔记完全退出显示和文件操作。0.1 的 `heading-numerals-clean-confidence` 仍会自动迁移。

### 安装与开发

当前版本尚未加入 Obsidian Community Plugins。可以从 GitHub Release 手动安装，或开发安装：

1. 运行 `npm ci && npm run build`。
2. 将 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 复制到测试 Vault 的 `.obsidian/plugins/heading-numerals/`。
3. 在 Obsidian 设置中启用插件。

要求：Obsidian 1.12.7 或更高版本，桌面端。移动端尚未完成真实验收，因此 manifest 明确设置为 desktop-only。

## English

### Features

- Write calculated numbers into the current Markdown note.
- Remove recognized stored numbers through an explainable preview.
- Show virtual numbers in Live Preview and Reading View without changing the file.
- Conceal stored numbers visually while preserving the source.
- Renumber a note using the same engine as virtual display.
- Process a folder or the whole vault with stale-content checks, a persisted recovery snapshot, and rollback.
- Override view mode, scheme, cleanup confidence, and starting counters per note through Properties.
- Add, edit, and delete multiple custom schemes while retaining retired template revisions for cleanup.
- Use English or Simplified Chinese UI text.

### Safety and source control

Ambiguous decimal, version, year, date, and measurement-like prefixes are preserved. Manual numbers are never silently removed by the write command. Every file-changing command has a preview, and a stale current-note preview is rejected.

Optional U+2060 source markers make plugin-written numbers exact to identify, but they are disabled by default because invisible characters can affect interoperability and heading links. A dedicated command strips the markers while keeping visible numbers.

Writing or removing numbers changes heading text. Existing links to headings may need manual repair; Heading Numerals does not rewrite links automatically.

### Template placeholders and cleanup

A placeholder uses `{heading-level.number-format}`. For example, `{1.arabic}` renders the H1 counter as `1`, while `{2.chinese_lower}` renders the H2 counter as `一`. The settings page lists every supported format with examples and exposes each built-in template in an expandable card.

The default cleanup scope recognizes plugin markers plus all current and retired built-in/custom templates. The broader common-manual-number scope is opt-in and always previewed. Similar-looking user-authored numbers are never silently removed.

### Compatibility and limitations

- Requires Obsidian 1.12.7+ on desktop.
- Supports top-level ATX H1-H6 headings.
- Setext headings, Canvas, embedded-note special handling, Outline, Backlinks, Search Results, and PDF export integration are not included in 0.2.0.
- Source Mode decorations are disabled by default.
- Reading View concealment changes visible text, not the heading DOM `id`; anchors continue to follow the stored heading.
- Third-party renderers that change heading count or levels cause the Reading View processor to fail closed for that section.
- Automated tests do not replace the manual runtime checks in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

### Development

```bash
npm ci
npm run check
```

`npm run check` verifies the pinned runtime, lint rules, strict TypeScript, unit tests, production bundle, manifest/version alignment, offline-only runtime contract, and the exact three-file release layout.

Numeric `x.y.z` tags trigger the same pinned GitHub Actions release flow used by the sibling plugins: the full gate runs again, a deterministic manual-install ZIP is produced, public assets receive build-provenance attestations, and downloaded Release bytes are compared with the verified candidate. See [docs/RELEASING.md](docs/RELEASING.md).

Architecture details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Contributions are welcome under [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy

Heading Numerals runs locally. It contains no networking, telemetry, analytics, advertisements, remote fonts, or remote assets.

## License

[MIT](LICENSE)
