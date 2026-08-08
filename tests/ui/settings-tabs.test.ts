// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { createSettingsTabs } from "../../src/ui/settings/tabs";

describe("settings tabs", () => {
  it("uses an accessible tablist and supports keyboard navigation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const select = vi.fn();
    const result = createSettingsTabs(container, [
      { id: "general", label: "General" },
      { id: "schemes", label: "Schemes" },
      { id: "cleanup", label: "Cleanup" },
      { id: "views", label: "Views" },
    ], "general", "Sections", select);
    const tabs = container.querySelectorAll<HTMLElement>("[role=tab]");
    expect(container.querySelector("[role=tablist]")?.getAttribute("aria-label")).toBe("Sections");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(select).toHaveBeenCalledWith("schemes");
    expect(result.panel.getAttribute("aria-labelledby")).toBe("heading-numerals-settings-tab-general");
    result.cleanup();
  });
});
