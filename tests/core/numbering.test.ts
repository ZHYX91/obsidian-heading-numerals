import { describe, expect, it } from "vitest";

import { parseAtxHeadings } from "../../src/core/heading-parser";
import { numberHeadings } from "../../src/core/numbering-engine";
import { formatCounter } from "../../src/core/schemes";
import type { NumberingOptions } from "../../src/core/types";

function options(overrides: Partial<NumberingOptions> = {}): NumberingOptions {
  return {
    scheme: "hierarchical",
    customTemplates: [],
    customBaseLevel: 1,
    maxLevel: 6,
    missingLevelStrategy: "fill-one",
    starts: {},
    ...overrides,
  };
}

describe("numberHeadings", () => {
  it("increments and resets hierarchical counters", () => {
    const source = "# A\n## B\n## C\n### D\n# E\n## F";
    const labels = numberHeadings(parseAtxHeadings(source), options()).map((item) => item.label);
    expect(labels).toEqual(["1", "1.1", "1.2", "1.2.1", "2", "2.1"]);
  });

  it("supports H2 as the numbering root", () => {
    const source = "# Document\n## Part\n### Detail\n## Next";
    const labels = numberHeadings(parseAtxHeadings(source), options({ scheme: "hierarchical-h2" }))
      .map((item) => item.label);
    expect(labels).toEqual([null, "1", "1.1", "2"]);
  });

  it("implements all skipped-level strategies", () => {
    const headings = parseAtxHeadings("### Deep");
    expect(numberHeadings(headings, options({ missingLevelStrategy: "fill-one" }))[0]?.label).toBe("1.1.1");
    expect(numberHeadings(headings, options({ missingLevelStrategy: "current-only" }))[0]?.label).toBe("1");
    expect(numberHeadings(headings, options({ missingLevelStrategy: "skip" }))[0]).toMatchObject({
      label: null,
      warning: "missing-parent",
    });
  });

  it("honors custom starts and maximum levels", () => {
    const result = numberHeadings(
      parseAtxHeadings("# A\n## B\n### C"),
      options({ starts: { 1: 2, 2: 3 }, maxLevel: 2 }),
    );
    expect(result.map((item) => item.label)).toEqual(["2", "2.3", null]);
  });

  it("formats built-in numeral styles", () => {
    expect(formatCounter(12, "arabic_full")).toBe("１２");
    expect(formatCounter(12, "chinese_lower")).toBe("十二");
    expect(formatCounter(12, "chinese_upper")).toBe("壹拾贰");
    expect(formatCounter(20, "circled")).toBe("⑳");
    expect(formatCounter(27, "letter_upper")).toBe("AA");
    expect(formatCounter(14, "roman_lower")).toBe("xiv");
  });
});
