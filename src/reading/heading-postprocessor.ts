import { App, normalizePath, TFile, type MarkdownPostProcessorContext } from "obsidian";

import { parseNoteOverrides, resolveNoteSettings } from "../config/frontmatter";
import {
  cleanupTemplateSources,
  toNumberingOptions,
  type HeadingNumeralsSettings,
} from "../config/settings";
import { parseAtxHeadings } from "../core/heading-parser";
import { WORD_JOINER } from "../core/markers";
import { createDisplayPlan } from "../application/display-plan";
import type { DisplayDecorationPlan } from "../application/display-plan";
import type { ParsedHeading } from "../core/types";

interface CachedReadingPlan {
  readonly headings: readonly ParsedHeading[];
  readonly displayPlan: readonly DisplayDecorationPlan[];
}

interface ReadingPlanCacheEntry {
  readonly fingerprint: string;
  readonly promise: Promise<CachedReadingPlan>;
}

function headingElements(container: HTMLElement): HTMLHeadingElement[] {
  const output: HTMLHeadingElement[] = [];
  if (/^H[1-6]$/u.test(container.tagName)) {
    output.push(container as HTMLHeadingElement);
  }
  output.push(...container.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"));
  return output;
}

function cleanupHeading(element: HTMLHeadingElement): void {
  for (const virtual of element.querySelectorAll<HTMLElement>(".heading-numerals-virtual")) {
    virtual.remove();
  }
  for (const concealed of element.querySelectorAll<HTMLElement>(".heading-numerals-concealed")) {
    concealed.replaceWith(...concealed.childNodes);
  }
  element.normalize();
  element.removeAttribute("data-heading-numerals-mode");
}

function prependVirtualNumber(element: HTMLHeadingElement, label: string): void {
  const span = element.ownerDocument.createElement("span");
  span.className = "heading-numerals-virtual";
  span.textContent = `${label} `;
  span.setAttribute("aria-hidden", "true");
  span.setAttribute("contenteditable", "false");
  element.prepend(span);
}

function leadingTextNodes(element: HTMLHeadingElement): Text[] {
  const view = element.ownerDocument.defaultView;
  const showText = view?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = element.ownerDocument.createTreeWalker(element, showText);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current != null) {
    const parent = current.parentElement;
    if (
      parent == null
      || (!parent.classList.contains("heading-numerals-virtual")
        && !parent.classList.contains("heading-numerals-concealed"))
    ) {
      nodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  return nodes;
}

function concealPrefix(element: HTMLHeadingElement, sourcePrefix: string): boolean {
  const nodes = leadingTextNodes(element);
  const fullText = nodes.map((node) => node.data).join("");
  const withoutMarkers = sourcePrefix.replace(new RegExp(WORD_JOINER, "gu"), "");
  const expected = fullText.startsWith(sourcePrefix)
    ? sourcePrefix
    : fullText.startsWith(withoutMarkers) ? withoutMarkers : null;
  if (expected == null || expected.length === 0) {
    return false;
  }
  let remaining = expected.length;
  for (const node of nodes) {
    if (remaining <= 0) {
      break;
    }
    if (node.data.length === 0) {
      continue;
    }
    const take = Math.min(remaining, node.data.length);
    if (take < node.data.length) {
      node.splitText(take);
    }
    const parent = node.parentNode;
    if (parent == null) {
      return false;
    }
    const span = element.ownerDocument.createElement("span");
    span.className = "heading-numerals-concealed";
    span.setAttribute("aria-hidden", "true");
    parent.insertBefore(span, node);
    span.appendChild(node);
    remaining -= take;
  }
  return remaining === 0;
}

export class HeadingReadingProcessor {
  private readonly cache = new Map<string, ReadingPlanCacheEntry>();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => HeadingNumeralsSettings,
  ) {}

  invalidate(): void {
    this.cache.clear();
  }

  async process(container: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    const settings = this.getSettings();
    if (!settings.enableReadingView) {
      return;
    }
    const effective = resolveNoteSettings(settings, parseNoteOverrides(context.frontmatter));
    if (effective.disabled || effective.displayMode === "normal") {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(normalizePath(context.sourcePath));
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      return;
    }
    const fingerprint = JSON.stringify({
      mtime: file.stat?.mtime ?? 0,
      size: file.stat?.size ?? 0,
      settings,
      effective,
    });
    let cached = this.cache.get(file.path);
    if (cached == null || cached.fingerprint !== fingerprint) {
      const promise = this.buildPlan(file, settings, effective);
      cached = { fingerprint, promise };
      this.cache.set(file.path, cached);
      void promise.catch(() => {
        if (this.cache.get(file.path)?.promise === promise) this.cache.delete(file.path);
      });
    }
    const { headings, displayPlan } = await cached.promise;
    const section = context.getSectionInfo(container);
    if (section == null || !container.isConnected) {
      return;
    }
    const sectionHeadings = headings.filter((heading) => (
      heading.line >= section.lineStart && heading.line <= section.lineEnd
    ));
    const rendered = headingElements(container);
    if (
      rendered.length !== sectionHeadings.length
      || rendered.some((element, index) => {
        const sourceHeading = sectionHeadings[index];
        return sourceHeading == null || Number(element.tagName.slice(1)) !== sourceHeading.level;
      })
    ) {
      return;
    }
    const planByLine = new Map(displayPlan.map((item) => [item.line, item]));
    for (let index = 0; index < rendered.length; index += 1) {
      const element = rendered[index];
      const sourceHeading = sectionHeadings[index];
      if (element == null || sourceHeading == null) {
        continue;
      }
      cleanupHeading(element);
      const item = planByLine.get(sourceHeading.line);
      if (item?.kind === "virtual") {
        prependVirtualNumber(element, item.label);
        element.setAttribute("data-heading-numerals-mode", "show");
      } else if (item?.kind === "conceal") {
        const prefixLength = item.to - item.from;
        const prefix = sourceHeading.content.slice(0, prefixLength);
        if (concealPrefix(element, prefix)) {
          element.setAttribute("data-heading-numerals-mode", "conceal");
        }
      }
    }
  }

  private async buildPlan(
    file: TFile,
    settings: HeadingNumeralsSettings,
    effective: ReturnType<typeof resolveNoteSettings>,
  ): Promise<CachedReadingPlan> {
    const source = await this.app.vault.cachedRead(file);
    const headings = parseAtxHeadings(source);
    return {
      headings,
      displayPlan: createDisplayPlan(headings, {
        mode: effective.displayMode,
        numbering: toNumberingOptions(settings, {
          schemeId: effective.schemeId,
          starts: effective.starts,
        }),
        cleanupScope: effective.cleanupScope,
        templateSources: cleanupTemplateSources(settings),
        revealOnActiveLine: false,
        selections: [],
        composing: false,
      }),
    };
  }
}
