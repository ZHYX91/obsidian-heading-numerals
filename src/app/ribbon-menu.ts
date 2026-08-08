import type { DisplayPreferenceAction } from "../application/display-preferences";
import { canRestoreSourceAppearance } from "../application/display-preferences";
import type { DisplayPreferences, TransformOperation } from "../core/types";
import type { Translate } from "../config/i18n";

export interface RibbonMenuItem {
  setTitle(title: string): this;
  setChecked(checked: boolean): this;
  onClick(callback: () => void): this;
}

export interface RibbonMenuHost {
  addItem(configure: (item: RibbonMenuItem) => void): this;
  addSeparator(): this;
}

export interface RibbonMenuActions {
  readonly updateDisplay: (action: DisplayPreferenceAction) => void;
  readonly runCurrent: (operation: TransformOperation) => void;
  readonly openBatch: () => void;
}

export function populateRibbonMenu(
  menu: RibbonMenuHost,
  preferences: DisplayPreferences,
  translate: Translate,
  actions: RibbonMenuActions,
): void {
  for (const mode of ["show", "conceal"] as const) {
    menu.addItem((item) => item
      .setTitle(translate(`mode.${mode}`))
      .setChecked(mode === "show" ? preferences.showVirtualNumbers : preferences.concealStoredNumbers)
      .onClick(() => actions.updateDisplay(mode)));
  }
  if (canRestoreSourceAppearance(preferences)) {
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(translate("menu.restoreNormal"))
      .onClick(() => actions.updateDisplay("normal")));
  }
  menu.addSeparator();
  for (const operation of ["write", "remove", "renumber", "strip-markers"] as const) {
    const key = operation === "strip-markers"
      ? "command.strip.current"
      : `command.${operation}.current` as const;
    menu.addItem((item) => item
      .setTitle(translate(key))
      .onClick(() => actions.runCurrent(operation)));
  }
  menu.addSeparator();
  menu.addItem((item) => item
    .setTitle(translate("command.batch.folder"))
    .onClick(actions.openBatch));
}
