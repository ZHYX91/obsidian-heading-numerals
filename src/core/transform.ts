import { parseAtxHeadings } from "./heading-parser";
import { hasMalformedPluginMarker, wrapPluginNumber } from "./markers";
import {
  isSuspiciousNumericPrefix,
  isExpectedUnmarkedNumber,
  meetsCleanupThreshold,
  parseHeadingNumberPrefixes,
} from "./number-parser";
import { numberHeadings } from "./numbering-engine";
import type {
  CleanupThreshold,
  NumberingOptions,
  PlannedChange,
  PlanWarning,
  TransformOperation,
  TransformPlan,
} from "./types";

export interface TransformOptions {
  numbering: NumberingOptions;
  writeMarkers: boolean;
  cleanupThreshold: CleanupThreshold;
  removeMultiplePrefixes: boolean;
  normalizeManualOnRenumber: boolean;
}

function replacementPrefix(label: string, writeMarkers: boolean): string {
  return `${writeMarkers ? wrapPluginNumber(label) : label} `;
}

export function applyTextChanges(source: string, changes: readonly PlannedChange[]): string {
  const descending = [...changes].sort((left, right) => right.from - left.from);
  let result = source;
  let lastFrom = source.length + 1;
  for (const change of descending) {
    if (change.from < 0 || change.to < change.from || change.to > source.length) {
      throw new RangeError(`Invalid heading change range ${change.from}:${change.to}`);
    }
    if (change.to > lastFrom) {
      throw new RangeError("Heading changes overlap");
    }
    result = result.slice(0, change.from) + change.insert + result.slice(change.to);
    lastFrom = change.from;
  }
  return result;
}

function previewAfter(content: string, from: number, to: number, insert: string): string {
  return content.slice(0, from) + insert + content.slice(to);
}

export function planHeadingTransform(
  source: string,
  operation: TransformOperation,
  options: TransformOptions,
): TransformPlan {
  const headings = parseAtxHeadings(source);
  const numbered = numberHeadings(headings, options.numbering);
  const changes: PlannedChange[] = [];
  const warnings: PlanWarning[] = [];

  for (const item of numbered) {
    const { heading } = item;
    const content = heading.content;
    if (content.trim().length === 0) {
      warnings.push({
        line: heading.line,
        heading: content,
        code: "empty-heading",
        detail: "The heading has no title text.",
      });
      continue;
    }
    if (item.warning != null) {
      warnings.push({
        line: heading.line,
        heading: content,
        code: "missing-parent",
        detail: "The selected missing-level strategy skipped this heading.",
      });
      continue;
    }

    const matches = parseHeadingNumberPrefixes(content);
    const first = matches[0] ?? null;
    const expectedUnmarked = isExpectedUnmarkedNumber(first, item.label);
    const malformedMarker = hasMalformedPluginMarker(content);

    if (operation === "strip-markers") {
      if (first?.provenance !== "plugin") {
        if (malformedMarker) {
          warnings.push({
            line: heading.line,
            heading: content,
            code: "ambiguous-prefix",
            detail: "A one-sided source marker was left unchanged.",
          });
        }
        continue;
      }
      const insert = `${first.numberCore}${first.separator}`;
      changes.push({
        from: heading.contentFrom,
        to: heading.contentFrom + first.to,
        insert,
        line: heading.line,
        level: heading.level,
        before: content,
        after: previewAfter(content, 0, first.to, insert),
        ruleId: "strip-plugin-marker",
        confidence: "certain",
        provenance: "plugin",
      });
      continue;
    }

    if (operation === "remove") {
      if (first == null) {
        if (malformedMarker || isSuspiciousNumericPrefix(content)) {
          warnings.push({
            line: heading.line,
            heading: content,
            code: "ambiguous-prefix",
            detail: "A suspicious prefix did not meet the configured cleanup threshold.",
          });
        }
        continue;
      }
      const removable = matches.filter((match, index) => {
        if (!options.removeMultiplePrefixes && index > 0) {
          return false;
        }
        return meetsCleanupThreshold(match, options.cleanupThreshold)
          || (index === 0 && expectedUnmarked);
      });
      if (removable.length === 0 || removable[0]?.from !== 0) {
        warnings.push({
          line: heading.line,
          heading: content,
          code: "ambiguous-prefix",
          detail: `Matched ${first.ruleId} at ${first.confidence} confidence; no text was removed.`,
        });
        continue;
      }
      let contiguousTo = 0;
      let last = removable[0];
      for (const match of removable) {
        if (match.from !== contiguousTo) {
          break;
        }
        contiguousTo = match.to;
        last = match;
      }
      changes.push({
        from: heading.contentFrom,
        to: heading.contentFrom + contiguousTo,
        insert: "",
        line: heading.line,
        level: heading.level,
        before: content,
        after: previewAfter(content, 0, contiguousTo, ""),
        ruleId: matches.length > 1
          ? "remove-multiple-prefixes"
          : expectedUnmarked ? "remove-computed-unmarked" : last.ruleId,
        confidence: expectedUnmarked ? "high" : last.confidence,
        provenance: first.provenance === "plugin" ? "plugin" : "manual",
      });
      continue;
    }

    if (item.label == null) {
      continue;
    }
    const insert = replacementPrefix(item.label, options.writeMarkers);

    if (first == null) {
      if (malformedMarker || isSuspiciousNumericPrefix(content)) {
        warnings.push({
          line: heading.line,
          heading: content,
          code: "ambiguous-prefix",
          detail: "A suspicious existing prefix was preserved to prevent double numbering.",
        });
        continue;
      }
      changes.push({
        from: heading.contentFrom,
        to: heading.contentFrom,
        insert,
        line: heading.line,
        level: heading.level,
        before: content,
        after: `${insert}${content}`,
        ruleId: "insert-number",
        confidence: null,
        provenance: "none",
      });
      continue;
    }

    if (matches.length > 1) {
      warnings.push({
        line: heading.line,
        heading: content,
        code: "ambiguous-prefix",
        detail: "Multiple consecutive number prefixes require cleanup before numbering.",
      });
      continue;
    }


    if (expectedUnmarked) {
      continue;
    }

    if (first.provenance === "plugin") {
      if (content.slice(0, first.to) === insert) {
        continue;
      }
      changes.push({
        from: heading.contentFrom,
        to: heading.contentFrom + first.to,
        insert,
        line: heading.line,
        level: heading.level,
        before: content,
        after: previewAfter(content, 0, first.to, insert),
        ruleId: "replace-plugin-number",
        confidence: "certain",
        provenance: "plugin",
      });
      continue;
    }

    if (
      operation === "renumber"
      && options.normalizeManualOnRenumber
      && meetsCleanupThreshold(first, "high")
    ) {
      if (content.slice(0, first.to) === insert) {
        continue;
      }
      changes.push({
        from: heading.contentFrom,
        to: heading.contentFrom + first.to,
        insert,
        line: heading.line,
        level: heading.level,
        before: content,
        after: previewAfter(content, 0, first.to, insert),
        ruleId: "normalize-manual-number",
        confidence: first.confidence,
        provenance: "manual",
      });
      continue;
    }

    warnings.push({
      line: heading.line,
      heading: content,
      code: "unsupported-prefix",
      detail: `Existing ${first.ruleId} prefix was preserved; use previewed renumbering to normalize it.`,
    });
  }

  return {
    operation,
    source,
    changes,
    warnings,
    result: applyTextChanges(source, changes),
  };
}
