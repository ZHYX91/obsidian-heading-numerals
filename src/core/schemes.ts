import type { Counters, NumberFormat, NumberingScheme, SchemeId } from "./types";

const HIERARCHICAL_TEMPLATES = [
  "{1.arabic}",
  "{1.arabic}.{2.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}.{6.arabic}",
] as const;

export const BUILT_IN_SCHEMES: Readonly<Record<Exclude<SchemeId, "custom">, NumberingScheme>> = {
  hierarchical: {
    id: "hierarchical",
    baseLevel: 1,
    templates: HIERARCHICAL_TEMPLATES,
  },
  "hierarchical-h2": {
    id: "hierarchical-h2",
    baseLevel: 2,
    templates: [
      "",
      "{2.arabic}",
      "{2.arabic}.{3.arabic}",
      "{2.arabic}.{3.arabic}.{4.arabic}",
      "{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}",
      "{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}.{6.arabic}",
    ],
  },
  "chinese-official": {
    id: "chinese-official",
    baseLevel: 1,
    templates: [
      "{1.chinese_lower}、",
      "（{2.chinese_lower}）",
      "{3.arabic}.",
      "（{4.arabic}）",
      "{5.circled}",
      "{6.letter_lower}.",
    ],
  },
  legal: {
    id: "legal",
    baseLevel: 1,
    templates: [
      "第{1.chinese_lower}编",
      "第{2.chinese_lower}章",
      "第{3.chinese_lower}节",
      "第{4.chinese_lower}条",
      "（{5.chinese_lower}）",
      "{6.arabic}.",
    ],
  },
};

const LOWER_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const UPPER_DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"] as const;
const CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
] as const;

function chineseGroup(value: number, upper: boolean): string {
  const digits = upper ? UPPER_DIGITS : LOWER_DIGITS;
  const units = upper ? ["", "拾", "佰", "仟"] : ["", "十", "百", "千"];
  let result = "";
  let zeroPending = false;
  for (let place = 3; place >= 0; place -= 1) {
    const divisor = 10 ** place;
    const digit = Math.floor(value / divisor) % 10;
    if (digit === 0) {
      if (result.length > 0 && value % divisor !== 0) {
        zeroPending = true;
      }
      continue;
    }
    if (zeroPending) {
      result += digits[0];
      zeroPending = false;
    }
    const omitLeadingOne = !upper && digit === 1 && place === 1 && result.length === 0;
    if (!omitLeadingOne) {
      result += digits[digit];
    }
    result += units[place];
  }
  return result;
}

function toChinese(value: number, upper: boolean): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    return String(value);
  }
  if (value === 0) {
    return "零";
  }
  if (value > 999_999_999_999) {
    return String(value);
  }
  const groupUnits = ["", "万", "亿"] as const;
  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 10_000);
    remaining = Math.floor(remaining / 10_000);
  }
  let output = "";
  let needsZero = false;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index] ?? 0;
    if (group === 0) {
      if (output.length > 0) {
        needsZero = true;
      }
      continue;
    }
    if (output.length > 0 && (needsZero || group < 1000)) {
      output += "零";
    }
    output += chineseGroup(group, upper) + (groupUnits[index] ?? "");
    needsZero = false;
  }
  return output;
}

function toRoman(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 3999) {
    return String(value);
  }
  const symbols: ReadonlyArray<readonly [number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"],
    [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"],
    [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = value;
  let output = "";
  for (const [amount, symbol] of symbols) {
    while (remaining >= amount) {
      output += symbol;
      remaining -= amount;
    }
  }
  return output;
}

function toLetters(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    return String(value);
  }
  let remaining = value;
  let output = "";
  while (remaining > 0) {
    remaining -= 1;
    output = String.fromCharCode(65 + (remaining % 26)) + output;
    remaining = Math.floor(remaining / 26);
  }
  return output;
}

export function formatCounter(value: number, format: NumberFormat): string {
  switch (format) {
    case "arabic":
      return String(value);
    case "arabic_full":
      return String(value).replace(/\d/gu, (digit) => String.fromCharCode(0xFF10 + Number(digit)));
    case "chinese_lower":
      return toChinese(value, false);
    case "chinese_upper":
      return toChinese(value, true);
    case "circled":
      return CIRCLED[value - 1] ?? `(${value})`;
    case "letter_upper":
      return toLetters(value);
    case "letter_lower":
      return toLetters(value).toLowerCase();
    case "roman_upper":
      return toRoman(value);
    case "roman_lower":
      return toRoman(value).toLowerCase();
  }
}

const TEMPLATE_TOKEN = /\{([1-6])\.(arabic|arabic_full|chinese_lower|chinese_upper|circled|letter_upper|letter_lower|roman_upper|roman_lower)\}/gu;

export function renderTemplate(template: string, counters: Counters): string {
  return template.replace(TEMPLATE_TOKEN, (_token, rawLevel: string, rawFormat: string) => {
    const level = Number(rawLevel);
    const value = counters[level - 1] ?? 0;
    return formatCounter(value, rawFormat as NumberFormat);
  });
}

export function renderCurrentLevel(template: string, level: number, counters: Counters): string {
  const tokens = [...template.matchAll(TEMPLATE_TOKEN)];
  const current = tokens.find((match) => Number(match[1]) === level);
  if (current == null) {
    return String(counters[level - 1] ?? 0);
  }
  if (tokens.length === 1) {
    return renderTemplate(template, counters);
  }
  return formatCounter(counters[level - 1] ?? 0, current[2] as NumberFormat);
}

export function createScheme(
  id: SchemeId,
  customTemplates: readonly string[],
  customBaseLevel: number,
): NumberingScheme {
  if (id !== "custom") {
    return BUILT_IN_SCHEMES[id];
  }
  return {
    id,
    baseLevel: Math.min(6, Math.max(1, Math.trunc(customBaseLevel))),
    templates: Array.from({ length: 6 }, (_unused, index) => customTemplates[index] ?? ""),
  };
}
