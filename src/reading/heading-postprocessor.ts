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
import {
  createSemanticDisplayPlan,
  type SemanticDisplayDecoration,
} from "../application/semantic-display-plan";
import type { DisplayDecorationPlan } from "../application/display-plan";
import type { ParsedHeading } from "../core/types";
import {
  createVirtualNumeralElement,
  createVirtualSemanticElement,
  VIRTUAL_NUMERAL_SELECTOR,
} from "../ui/virtual-numeral";

interface CachedReadingPlan {
  readonly headings: readonly ParsedHeading[];
  readonly displayPlan: readonly DisplayDecorationPlan[];
  readonly semanticPlan: readonly SemanticDisplayDecoration[];
}

interface ReadingPlanCacheEntry extends CachedReadingPlan {
  readonly source: string;
  readonly fingerprint: string;
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
  for (const virtual of element.querySelectorAll<HTMLElement>(VIRTUAL_NUMERAL_SELECTOR)) {
    const original = virtual.dataset.headingNumeralsOriginal;
    if (original != null) virtual.replaceWith(original);
    else virtual.remove();
  }
  for (const concealed of element.querySelectorAll<HTMLElement>(".heading-numerals-concealed")) {
    concealed.replaceWith(...concealed.childNodes);
  }
  element.normalize();
  element.removeAttribute("data-heading-numerals-mode");
}

function cleanupSemantic(container: HTMLElement): void {
  for (const virtual of container.querySelectorAll<HTMLElement>(
    ".heading-numerals-caption-number, .heading-numerals-reference-number",
  )) {
    const original = virtual.dataset.headingNumeralsOriginal;
    if (original != null) virtual.replaceWith(original);
    else virtual.remove();
  }
  for (const anchor of container.querySelectorAll<HTMLElement>("[data-heading-numerals-reference]")) {
    delete anchor.dataset.headingNumeralsReference;
  }
  container.normalize();
}

function captionRoots(container: HTMLElement): HTMLElement[] {
  const roots: HTMLElement[] = [];
  if (container.matches("p")) roots.push(container);
  roots.push(...container.querySelectorAll<HTMLElement>("p"));
  return roots;
}

function insertCaptionNumber(element: HTMLElement, kind: string, label: string): boolean {
  const view = element.ownerDocument.defaultView;
  const walker = element.ownerDocument.createTreeWalker(element, view?.NodeFilter.SHOW_TEXT ?? 4);
  let leading = "";
  let node = walker.nextNode() as Text | null;
  while (node != null && leading.length <= kind.length + 4) {
    const combined = leading + node.data;
    const trimmed = combined.trimStart();
    if (trimmed.startsWith(`${kind}:`)) {
      const absoluteColon = combined.indexOf(`${kind}:`) + kind.length;
      const localOffset = absoluteColon - leading.length;
      if (localOffset >= 0 && localOffset <= node.data.length) {
        const span = createVirtualSemanticElement(element.ownerDocument, label, "caption");
        const suffix = node.splitText(localOffset);
        suffix.parentNode?.insertBefore(span, suffix);
        return true;
      }
    }
    leading = combined;
    node = walker.nextNode() as Text | null;
  }
  return false;
}

function precedingAtText(anchor: HTMLElement): Text | null {
  let node: Node | null = anchor.previousSibling;
  while (node != null) {
    if (node.nodeType === 3 && (node as Text).data.endsWith("@")) return node as Text;
    if ((node.textContent ?? "").length > 0) return null;
    node = node.previousSibling;
  }
  return null;
}

function enhanceReference(container: HTMLElement, target: string, label: string): boolean {
  const expected = `#${target}`;
  const anchors = container.querySelectorAll<HTMLElement>("a.internal-link");
  for (const anchor of anchors) {
    if (anchor.dataset.headingNumeralsReference === "true") continue;
    const dataHref = anchor.getAttribute("data-href");
    const href = anchor.getAttribute("href");
    if ((dataHref != null && dataHref !== expected) || (dataHref == null && href !== expected)) continue;
    const text = precedingAtText(anchor);
    if (text == null) continue;
    text.deleteData(text.length - 1, 1);
    const span = createVirtualSemanticElement(container.ownerDocument, label, "reference");
    span.dataset.headingNumeralsOriginal = "@";
    text.parentNode?.insertBefore(span, anchor);
    anchor.dataset.headingNumeralsReference = "true";
    return true;
  }
  return false;
}

function prependVirtualNumber(element: HTMLHeadingElement, label: string): void {
  element.prepend(createVirtualNumeralElement(element.ownerDocument, label));
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
    cleanupSemantic(container);
    const rendered = headingElements(container);
    for (const heading of rendered) cleanupHeading(heading);

    const settings = this.getSettings();
    if (!settings.enableReadingView) {
      return;
    }
    const effective = resolveNoteSettings(settings, parseNoteOverrides(context.frontmatter));
    if (
      effective.disabled
      || (!effective.showVirtualNumbers
        && !effective.concealStoredNumbers
        && !settings.showCaptionNumbers
        && !settings.showCrossReferences)
    ) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(normalizePath(context.sourcePath));
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      return;
    }
    const source = await this.app.vault.cachedRead(file);
    const fingerprint = JSON.stringify({ settings, effective });
    let cached = this.cache.get(file.path);
    if (cached == null || cached.fingerprint !== fingerprint || cached.source !== source) {
      cached = {
        source,
        fingerprint,
        ...this.buildPlan(source, settings, effective),
      };
      this.cache.set(file.path, cached);
    }
    const { headings, displayPlan, semanticPlan } = cached;
    const section = context.getSectionInfo(container);
    if (section == null || !container.isConnected) {
      return;
    }
    const sectionHeadings = headings.filter((heading) => (
      heading.line >= section.lineStart && heading.line <= section.lineEnd
    ));
    if (
      rendered.length > 0
      && (
      rendered.length !== sectionHeadings.length
      || rendered.some((element, index) => {
        const sourceHeading = sectionHeadings[index];
        return sourceHeading == null || Number(element.tagName.slice(1)) !== sourceHeading.level;
      })
      )
    ) {
      return;
    }
    const planByLine = new Map<number, DisplayDecorationPlan[]>();
    for (const item of displayPlan) {
      const items = planByLine.get(item.line) ?? [];
      items.push(item);
      planByLine.set(item.line, items);
    }
    for (let index = 0; index < rendered.length; index += 1) {
      const element = rendered[index];
      const sourceHeading = sectionHeadings[index];
      if (element == null || sourceHeading == null) {
        continue;
      }
      const items = planByLine.get(sourceHeading.line) ?? [];
      const conceal = items.find((item) => item.kind === "conceal");
      const virtual = items.find((item) => item.kind === "virtual");
      let concealed = false;
      if (conceal != null) {
        const prefixLength = conceal.to - conceal.from;
        const prefix = sourceHeading.content.slice(0, prefixLength);
        if (concealPrefix(element, prefix)) {
          concealed = true;
        }
      }
      if (virtual != null && (conceal == null || concealed)) {
        prependVirtualNumber(element, virtual.label);
      }
      if (virtual != null && concealed) {
        element.setAttribute("data-heading-numerals-mode", "show-conceal");
      } else if (virtual != null) {
        element.setAttribute("data-heading-numerals-mode", "show");
      } else if (concealed) {
        element.setAttribute("data-heading-numerals-mode", "conceal");
      }
    }
    const sectionSemantic = semanticPlan.filter((item) => (
      item.line >= section.lineStart && item.line <= section.lineEnd
    ));
    const roots = captionRoots(container);
    let rootIndex = 0;
    for (const item of sectionSemantic) {
      if (item.kind !== "caption" || item.captionKind == null) continue;
      for (; rootIndex < roots.length; rootIndex += 1) {
        const root = roots[rootIndex];
        if (root != null && insertCaptionNumber(root, item.captionKind, item.label)) {
          rootIndex += 1;
          break;
        }
      }
    }
    for (const item of sectionSemantic) {
      if (item.kind === "reference" && item.target != null) {
        enhanceReference(container, item.target, item.label);
      }
    }
  }

  private buildPlan(
    source: string,
    settings: HeadingNumeralsSettings,
    effective: ReturnType<typeof resolveNoteSettings>,
  ): CachedReadingPlan {
    const headings = parseAtxHeadings(source);
    const displayPlan = createDisplayPlan(headings, {
      showVirtualNumbers: effective.showVirtualNumbers,
      concealStoredNumbers: effective.concealStoredNumbers,
      numbering: toNumberingOptions(settings, {
        schemeId: effective.schemeId,
        starts: effective.starts,
      }),
      cleanupScope: effective.cleanupScope,
      templateSources: cleanupTemplateSources(settings),
      revealOnActiveLine: false,
      selections: [],
      composing: false,
    });
    const numbering = toNumberingOptions(settings, {
      schemeId: effective.schemeId,
      starts: effective.starts,
    });
    const templateSources = cleanupTemplateSources(settings);
    return {
      headings,
      displayPlan,
      semanticPlan: createSemanticDisplayPlan(source, headings, {
        showCaptionNumbers: settings.showCaptionNumbers,
        showCrossReferences: settings.showCrossReferences,
        numbering,
        templateSources,
        headingDisplayPlan: displayPlan,
        composing: false,
      }),
    };
  }
}
