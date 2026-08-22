// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { createVirtualNumeralElement } from "../../src/ui/virtual-numeral";

describe("virtual numeral element", () => {
  it("shares one accessible DOM contract without a visible trailing text gap", () => {
    window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
      const span = document.createElement("span");
      this.appendChild(span);
      return span;
    };
    Object.defineProperty(document, "win", { configurable: true, value: window });
    Object.assign(window, { createFragment: () => document.createDocumentFragment() });
    const element = createVirtualNumeralElement(document, "1.2");
    expect(element.className).toBe("document-numbering-virtual");
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.getAttribute("contenteditable")).toBe("false");
    expect(element.firstChild?.textContent).toBe("1.2");
    expect(element.lastElementChild).toMatchObject({ hidden: true, textContent: " " });
    expect(element.textContent).toBe("1.2 ");
  });
});
