import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateEffect, type EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  editorInfoField,
  editorLivePreviewField,
  getFrontMatterInfo,
  parseYaml,
} from "obsidian";

import { parseNoteOverrides, resolveNoteSettings, type NoteOverrides } from "../config/frontmatter";
import {
  cleanupTemplateSources,
  toNumberingOptions,
  type HeadingNumeralsSettings,
} from "../config/settings";
import { parseAtxHeadings } from "../core/heading-parser";
import type { ParsedHeading } from "../core/types";
import { createDisplayPlan } from "../application/display-plan";

export const refreshHeadingDisplay = StateEffect.define<void>();

class NumeralWidget extends WidgetType {
  constructor(private readonly label: string) {
    super();
  }

  override eq(other: NumeralWidget): boolean {
    return this.label === other.label;
  }

  override toDOM(view: EditorView): HTMLElement {
    const element = view.dom.ownerDocument.createElement("span");
    element.className = "heading-numerals-virtual";
    element.textContent = `${this.label} `;
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("contenteditable", "false");
    return element;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function syntaxConfirmsHeading(state: EditorState, heading: ParsedHeading): boolean {
  let node: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(
    heading.markerFrom,
    1,
  );
  for (let depth = 0; node != null && depth < 8; depth += 1) {
    if (/^(?:ATXHeading[1-6]?|HeaderMark|HyperMD-header(?:_H[1-6])?)$/u.test(node.name)) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function parseOverrides(source: string): NoteOverrides | null {
  try {
    const info = getFrontMatterInfo(source);
    if (!info.exists) {
      return parseNoteOverrides(null);
    }
    return parseNoteOverrides(parseYaml(info.frontmatter));
  } catch {
    return null;
  }
}

export class HeadingDisplayController {
  private readonly views = new Set<EditorView>();

  constructor(private readonly getSettings: () => HeadingNumeralsSettings) {}

  createExtension(): Extension {
    const views = this.views;
    const settingsProvider = this.getSettings;
    const displayPlugin = ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      private overrides: NoteOverrides;

      constructor(private readonly view: EditorView) {
        this.overrides = parseOverrides(view.state.doc.toString()) ?? parseNoteOverrides(null);
        views.add(view);
        this.decorations = this.buildDecorations();
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) {
          const nextOverrides = parseOverrides(update.state.doc.toString());
          if (nextOverrides != null) {
            this.overrides = nextOverrides;
          }
        }
        const livePreviewChanged = update.startState.field(editorLivePreviewField, false)
          !== update.state.field(editorLivePreviewField, false);
        const previousFile = update.startState.field(editorInfoField, false)?.file ?? null;
        const currentFile = update.state.field(editorInfoField, false)?.file ?? null;
        const explicitlyRefreshed = update.transactions.some((transaction) => (
          transaction.effects.some((effect) => effect.is(refreshHeadingDisplay))
        ));
        if (
          update.docChanged
          || update.selectionSet
          || livePreviewChanged
          || previousFile !== currentFile
          || explicitlyRefreshed
        ) {
          this.decorations = this.buildDecorations();
        }
      }

      destroy(): void {
        views.delete(this.view);
      }

      private buildDecorations(): DecorationSet {
        const settings = settingsProvider();
        const livePreview = this.view.state.field(editorLivePreviewField, false) ?? false;
        if ((livePreview && !settings.enableLivePreview) || (!livePreview && !settings.enableSourceMode)) {
          return Decoration.none;
        }
        const effective = resolveNoteSettings(settings, this.overrides);
        if (effective.disabled) {
          return Decoration.none;
        }
        const source = this.view.state.doc.toString();
        const headings = parseAtxHeadings(source).filter((heading) => (
          syntaxConfirmsHeading(this.view.state, heading)
        ));
        const selections = this.view.state.selection.ranges.map((range) => ({
          from: range.from,
          to: range.to,
        }));
        const plan = createDisplayPlan(headings, {
          mode: effective.displayMode,
          numbering: toNumberingOptions(settings, {
            schemeId: effective.schemeId,
            starts: effective.starts,
          }),
          cleanupScope: effective.cleanupScope,
          templateSources: cleanupTemplateSources(settings),
          revealOnActiveLine: settings.revealOnActiveLine,
          selections,
          composing: this.view.composing,
        });
        const builder = new RangeSetBuilder<Decoration>();
        for (const item of plan) {
          if (item.kind === "virtual") {
            builder.add(item.from, item.to, Decoration.widget({
              widget: new NumeralWidget(item.label),
              side: -1,
            }));
          } else {
            builder.add(item.from, item.to, Decoration.replace({ inclusive: false }));
          }
        }
        return builder.finish();
      }
    }, {
      decorations: (instance) => instance.decorations,
    });

    const compositionHandlers = EditorView.domEventHandlers({
      compositionstart: (_event, view) => {
        view.dispatch({ effects: refreshHeadingDisplay.of(undefined) });
        return false;
      },
      compositionend: (_event, view) => {
        const timerWindow = view.dom.ownerDocument.defaultView;
        timerWindow?.setTimeout(() => {
          if (view.dom.isConnected) {
            view.dispatch({ effects: refreshHeadingDisplay.of(undefined) });
          }
        }, 0);
        return false;
      },
    });

    return [displayPlugin, compositionHandlers];
  }

  refreshAll(): void {
    for (const view of this.views) {
      view.dispatch({ effects: refreshHeadingDisplay.of(undefined) });
    }
  }
}
