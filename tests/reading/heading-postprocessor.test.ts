// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { TFile, type App, type MarkdownPostProcessorContext } from "obsidian";

import { DEFAULT_SETTINGS, type HeadingNumeralsSettings } from "../../src/config/settings";
import { HeadingReadingProcessor } from "../../src/reading/heading-postprocessor";

function settings(overrides: Partial<HeadingNumeralsSettings>): HeadingNumeralsSettings {
  return {
    ...DEFAULT_SETTINGS,
    customTemplates: [...DEFAULT_SETTINGS.customTemplates],
    excludedFolders: [],
    ...overrides,
  };
}

function harness(source: string, configured: HeadingNumeralsSettings) {
  const FileConstructor = TFile as unknown as new (path: string) => TFile;
  const file = new FileConstructor("note.md");
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      cachedRead: async () => source,
    },
  } as unknown as App;
  const processor = new HeadingReadingProcessor(app, () => configured);
  const context = {
    sourcePath: "note.md",
    frontmatter: null,
    getSectionInfo: () => ({ text: source, lineStart: 0, lineEnd: source.split("\n").length - 1 }),
  } as unknown as MarkdownPostProcessorContext;
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { processor, context, container };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("HeadingReadingProcessor", () => {
  it("adds virtual numbers using the full document counter plan", async () => {
    const { processor, context, container } = harness(
      "# First\n## Second",
      settings({ displayMode: "show", scheme: "hierarchical" }),
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
      settings({ displayMode: "conceal", scheme: "hierarchical" }),
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
      settings({ displayMode: "show", scheme: "hierarchical" }),
    );
    const wrongLevel = document.createElement("h2");
    wrongLevel.textContent = "First";
    container.appendChild(wrongLevel);

    await processor.process(container, context);

    expect(container.querySelector(".heading-numerals-virtual")).toBeNull();
  });
});
