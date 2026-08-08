import { describe, expect, it, vi } from "vitest";

import {
  populateRibbonMenu,
  type RibbonMenuHost,
  type RibbonMenuItem,
} from "../../src/app/ribbon-menu";

interface ItemState {
  title: string;
  checked: boolean | null;
  click: () => void;
}

function menuHarness() {
  const entries: Array<ItemState | "separator"> = [];
  const menu: RibbonMenuHost = {
    addItem(configure) {
      const state: ItemState = { title: "", checked: null, click: () => undefined };
      const item: RibbonMenuItem = {
        setTitle(title) { state.title = title; return this; },
        setChecked(checked) { state.checked = checked; return this; },
        onClick(callback) { state.click = callback; return this; },
      };
      configure(item);
      entries.push(state);
      return this;
    },
    addSeparator() { entries.push("separator"); return this; },
  };
  return { entries, menu };
}

describe("ribbon menu", () => {
  it("shows two independent unchecked effects without a redundant restore action", () => {
    const test = menuHarness();
    populateRibbonMenu(test.menu, {
      showVirtualNumbers: false,
      concealStoredNumbers: false,
    }, (key) => key, {
      updateDisplay: vi.fn(),
      runCurrent: vi.fn(),
      openBatch: vi.fn(),
    });

    expect(test.entries.slice(0, 3)).toMatchObject([
      { title: "mode.show", checked: false },
      { title: "mode.conceal", checked: false },
      "separator",
    ]);
    expect(test.entries).not.toContainEqual(expect.objectContaining({ title: "menu.restoreNormal" }));
  });

  it("checks both effects and exposes one plain restore action", () => {
    const test = menuHarness();
    const updateDisplay = vi.fn();
    populateRibbonMenu(test.menu, {
      showVirtualNumbers: true,
      concealStoredNumbers: true,
    }, (key) => key, {
      updateDisplay,
      runCurrent: vi.fn(),
      openBatch: vi.fn(),
    });

    expect(test.entries.slice(0, 4)).toMatchObject([
      { title: "mode.show", checked: true },
      { title: "mode.conceal", checked: true },
      "separator",
      { title: "menu.restoreNormal", checked: null },
    ]);
    const restore = test.entries.find((entry) => entry !== "separator" && entry.title === "menu.restoreNormal");
    if (restore === "separator" || restore == null) throw new Error("Restore action is missing");
    restore.click();
    expect(updateDisplay).toHaveBeenCalledWith("normal");
  });
});
