import { meetsCleanupScope } from "../core/number-parser";
import { numberHeadings } from "../core/numbering-engine";
import { analyzeHeadingPrefix } from "../core/prefix-analysis";
import type {
  CleanupScope,
  CleanupTemplateSource,
  DisplayMode,
  NumberingOptions,
  ParsedHeading,
} from "../core/types";

export interface SelectionSpan {
  from: number;
  to: number;
}

export interface DisplayDecorationPlan {
  kind: "virtual" | "conceal";
  from: number;
  to: number;
  label: string;
  line: number;
}

export interface DisplayPlanOptions {
  mode: DisplayMode;
  numbering: NumberingOptions;
  cleanupScope: CleanupScope;
  templateSources: readonly CleanupTemplateSource[];
  revealOnActiveLine: boolean;
  selections: readonly SelectionSpan[];
  composing: boolean;
}

function selectionTouchesHeading(
  heading: ParsedHeading,
  selections: readonly SelectionSpan[],
): boolean {
  return selections.some((selection) => {
    if (selection.from === selection.to) {
      return selection.from >= heading.lineFrom && selection.from <= heading.lineTo;
    }
    return selection.from <= heading.lineTo && selection.to >= heading.lineFrom;
  });
}

export function createDisplayPlan(
  headings: readonly ParsedHeading[],
  options: DisplayPlanOptions,
): DisplayDecorationPlan[] {
  if (options.mode === "normal" || options.composing) {
    return [];
  }
  const numbered = numberHeadings(headings, options.numbering);
  const decorations: DisplayDecorationPlan[] = [];
  for (const item of numbered) {
    const { heading } = item;
    if (item.label == null || heading.content.trim().length === 0) {
      continue;
    }
    const analysis = analyzeHeadingPrefix(heading, item.label, options.templateSources);
    const { matches, expectedUnmarked } = analysis;
    if (options.mode === "show") {
      if (matches.length === 0 && !analysis.suspicious) {
        decorations.push({
          kind: "virtual",
          from: heading.contentFrom,
          to: heading.contentFrom,
          label: item.label,
          line: heading.line,
        });
      }
      continue;
    }
    if (
      options.revealOnActiveLine
      && selectionTouchesHeading(heading, options.selections)
    ) {
      continue;
    }
    let concealTo = 0;
    for (const match of matches) {
      if (
        match.from !== concealTo
        || (!meetsCleanupScope(match, options.cleanupScope)
          && !(concealTo === 0 && expectedUnmarked))
      ) {
        break;
      }
      concealTo = match.to;
    }
    if (concealTo > 0) {
      decorations.push({
        kind: "conceal",
        from: heading.contentFrom,
        to: heading.contentFrom + concealTo,
        label: "",
        line: heading.line,
      });
    }
  }
  return decorations;
}
