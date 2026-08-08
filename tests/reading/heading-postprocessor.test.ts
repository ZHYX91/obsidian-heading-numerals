// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TFile, type App, type MarkdownPostProcessorContext } from "obsidian";

import { DEFAULT_SETTINGS, type HeadingNumeralsSettings } from "../../src/config/settings";
import { HeadingReadingProcessor } from "../../src/reading/heading-postprocessor";

function settings(overrides: Partial<HeadingNumeralsSettings>): HeadingNumeralsSettings {
  return {
    ...DEFAULT_SETTINGS,
    customSchemes: DEFAULT_SETTINGS.customSchemes.map((scheme) => ({
      ...scheme,
      templates: [...scheme.templates],
    })),
    excludedFolders: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
    const span = document.createElement("span");
    this.appendChild(span);
    return span;
  };
  Object.defineProperty(document, "win", { configurable: true, value: window });
  Object.assign(window, { createFragment: () => document.createDocumentFragment() });
});

function harness(source: string, configured: HeadingNumeralsSettings) {
  let currentSource = source;
  const FileConstructor = TFile as unknown as new (path: string) => TFile;
  const file = new FileConstructor("note.md");
  const cachedRead = vi.fn(async () => currentSource);
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      cachedRead,
    },
  } as unknown as App;
  const processor = new HeadingReadingProcessor(app, () => configured);
  const context = {
    sourcePath: "note.md",
    frontmatter: null,
    getSectionInfo: () => ({
      text: currentSource,
      lineStart: 0,
      lineEnd: currentSource.split("\n").length - 1,
    }),
  } as unknown as MarkdownPostProcessorContext;
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    processor,
    context,
    container,
    cachedRead,
    setSource: (next: string) => { currentSource = next; },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("HeadingReadingProcessor", () => {
  it("adds virtual numbers using the full document counter plan", async () => {
    const { processor, context, container } = harness(
      "# First\n## Second",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    container.append(document.createElement("h1"), document.createElement("h2"));
    container.children[0]!.textContent = "First";
    container.children[1]!.textContent = "Second";

    await processor.process(container, context);

    expect(container.querySelectorAll(".heading-numerals-virtual")).toHaveLength(2);
    expect(container.children[0]?.textContent).toBe("1 First");
    expect(container.children[1]?.textContent).toBe("1.1 Second");
  });

  it("conceals only the validated source prefix", async () => {
    const { processor, context, container } = harness(
      "# 1.1 Stored",
      settings({
        concealStoredNumbers: true,
        selectedSchemeId: "hierarchical",
        cleanupScope: "common",
      }),
    );
    const heading = document.createElement("h1");
    heading.textContent = "1.1 Stored";
    container.appendChild(heading);

    await processor.process(container, context);

    const concealed = heading.querySelector(".heading-numerals-concealed");
    expect(concealed?.textContent).toBe("1.1 ");
    expect(heading.textContent).toBe("1.1 Stored");
    expect(heading.getAttribute("data-heading-numerals-mode")).toBe("conceal");
  });

  it("fails closed when rendered heading levels do not match source", async () => {
    const { processor, context, container } = harness(
      "# First",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    const wrongLevel = document.createElement("h2");
    wrongLevel.textContent = "First";
    container.appendChild(wrongLevel);

    await processor.process(container, context);

    expect(container.querySelector(".heading-numerals-virtual")).toBeNull();
  });

  it("reapplies one full-document plan idempotently", async () => {
    const { processor, context, container, cachedRead } = harness(
      "# First\n## Second",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    container.append(document.createElement("h1"), document.createElement("h2"));
    container.children[0]!.textContent = "First";
    container.children[1]!.textContent = "Second";
    await processor.process(container, context);
    await processor.process(container, context);
    expect(cachedRead).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll(".heading-numerals-virtual")).toHaveLength(2);
  });

  it("cleans prior decorations when display is disabled", async () => {
    const configured = settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" });
    const { processor, context, container } = harness("# First", configured);
    const heading = document.createElement("h1");
    heading.textContent = "First";
    container.appendChild(heading);
    await processor.process(container, context);
    expect(heading.querySelector(".heading-numerals-virtual")).not.toBeNull();

    configured.showVirtualNumbers = false;
    await processor.process(container, context);

    expect(heading.querySelector(".heading-numerals-virtual")).toBeNull();
    expect(heading.textContent).toBe("First");
  });

  it("invalidates its plan after an exact same-length source edit", async () => {
    const { processor, context, container, setSource } = harness(
      "## One",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical-h2" }),
    );
    const h2 = document.createElement("h2");
    h2.textContent = "One";
    container.appendChild(h2);
    await processor.process(container, context);
    expect(h2.textContent).toBe("1 One");

    setSource("### XX");
    const h3 = document.createElement("h3");
    h3.textContent = "XX";
    container.replaceChildren(h3);
    await processor.process(container, context);

    expect(h3.textContent).toBe("1.1 XX");
  });

  it("conceals stored text and prepends its virtual replacement in the same heading", async () => {
    const { processor, context, container } = harness(
      "# 1 Stored",
      settings({
        showVirtualNumbers: true,
        concealStoredNumbers: true,
        selectedSchemeId: "hierarchical",
      }),
    );
    const heading = document.createElement("h1");
    heading.textContent = "1 Stored";
    container.appendChild(heading);

    await processor.process(container, context);

    expect(heading.querySelector(".heading-numerals-concealed")?.textContent).toBe("1 ");
    expect(heading.querySelector(".heading-numerals-virtual")?.textContent).toBe("1 ");
    expect(heading.getAttribute("data-heading-numerals-mode")).toBe("show-conceal");
  });

  it("uses the selected custom scheme exclusions in Reading View", async () => {
    const configured = settings({
      showVirtualNumbers: true,
      selectedSchemeId: "custom-exclusions",
      customSchemes: [{
        id: "custom-exclusions",
        name: "Exclusions",
        revision: 1,
        baseLevel: 1,
        templates: [
          "{1.arabic}",
          "{1.arabic}.{2.arabic}",
          "{1.arabic}.{2.arabic}.{3.arabic}",
          "",
          "",
          "",
        ],
        exclusions: [{ title: "References", scope: "subtree" }],
      }],
    });
    const { processor, context, container } = harness(
      "# First\n## References\n### Book\n## Next",
      configured,
    );
    container.append(
      document.createElement("h1"),
      document.createElement("h2"),
      document.createElement("h3"),
      document.createElement("h2"),
    );
    ["First", "References", "Book", "Next"].forEach((title, index) => {
      container.children[index]!.textContent = title;
    });

    await processor.process(container, context);

    expect(Array.from(container.children).map((heading) => (
      heading.querySelector(".heading-numerals-virtual")?.textContent ?? null
    ))).toEqual(["1 ", null, null, "1.1 "]);
  });
});
