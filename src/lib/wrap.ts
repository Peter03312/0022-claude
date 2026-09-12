/**
 * 铅字校样折行核心逻辑（纯函数，无 DOM 依赖）。
 *
 * 允许字符：常用汉字（CJK 统一表意文字 U+4E00–U+9FFF）及以下标点：
 *   ， 。 ！ ？ 、 ； ： “ ” （ ） 《 》
 * 不接受空白、拉丁字母、数字及任何其他字符。每个字符恰占一格。
 *
 * 禁行首集合：， 。 ！ ？ 、 ； ： ） 》 ”
 * 禁行尾集合：（ 《 “
 *
 * 折行算法（确定性贪心，输出唯一）：
 *   从尚未排入的首字符开始，在不超过行宽的候选前缀中选择最长者，
 *   但其末字符不得属于禁行尾，且若仍有余文，下一字符不得属于禁行首；
 *   若最长候选不合法便逐字符向前寻找；找不到任何候选时整段失败。
 */

export const MIN_TEXT_LENGTH = 1;
export const MAX_TEXT_LENGTH = 200;
export const MIN_LINE_WIDTH = 8;
export const MAX_LINE_WIDTH = 20;

/** 允许出现的标点（13 个）。 */
export const ALLOWED_PUNCTUATION: ReadonlySet<string> = new Set([
  '，', '。', '！', '？', '、', '；', '：', '“', '”', '（', '）', '《', '》',
]);

/** 禁行首集合（固定的 10 个字符）。 */
export const FORBIDDEN_LINE_START: ReadonlySet<string> = new Set([
  '，', '。', '！', '？', '、', '；', '：', '）', '》', '”',
]);

/** 禁行尾集合（固定的 3 个字符）。 */
export const FORBIDDEN_LINE_END: ReadonlySet<string> = new Set([
  '（', '《', '“',
]);

const HANZI_PATTERN = /[\u4e00-\u9fff]/;
export function isAllowedChar(ch: string): boolean {
  return HANZI_PATTERN.test(ch) || ALLOWED_PUNCTUATION.has(ch);
}

/** 按码位切分字符（所有合法字符均位于 BMP，索引与码位一致）。 */
export function toChars(text: string): string[] {
  return Array.from(text);
}

export interface InvalidChar {
  index: number;
  char: string;
}

export interface TextValidation {
  valid: boolean;
  empty: boolean;
  tooLong: boolean;
  length: number;
  invalidChars: InvalidChar[];
}

export function validateText(text: string): TextValidation {
  const chars = toChars(text);
  const invalidChars: InvalidChar[] = [];
  chars.forEach((char, index) => {
    if (!isAllowedChar(char)) {
      invalidChars.push({ index, char });
    }
  });
  const empty = chars.length < MIN_TEXT_LENGTH;
  const tooLong = chars.length > MAX_TEXT_LENGTH;
  return {
    valid: !empty && !tooLong && invalidChars.length === 0,
    empty,
    tooLong,
    length: chars.length,
    invalidChars,
  };
}

export interface WidthValidation {
  valid: boolean;
  value: number | null;
}

export function validateWidth(raw: string): WidthValidation {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, value: null };
  }
  const value = Number(trimmed);
  const valid = value >= MIN_LINE_WIDTH && value <= MAX_LINE_WIDTH;
  return { valid, value: valid ? value : null };
}

/** 触发禁则的记录：哪条禁则、由哪个字符（及其索引）触发。 */
export interface TriggeredRule {
  rule: '禁行首' | '禁行尾';
  char: string;
  index: number;
}

/** 断行方式：行满（占满字格）、禁则（因禁则提前断行）、文末（正文结束）。 */
export type BreakKind = '行满' | '禁则' | '文末';

export interface LayoutLine {
  lineNo: number;
  /** 起始索引（含，自 0 计）。 */
  start: number;
  /** 终止索引（含，自 0 计）。 */
  end: number;
  /** 实际字数。 */
  length: number;
  text: string;
  breakKind: BreakKind;
  /** 断点后移入下一行的字符（下一行首字符）；文末为 null。 */
  movedChar: string | null;
  movedCharIndex: number | null;
  /** 使本行未能排满字格的禁则（可能同时触发两条）。 */
  triggeredRules: TriggeredRule[];
}

export type LayoutResult =
  | { ok: true; lines: LayoutLine[] }
  | { ok: false; failAt: number; failChar: string };

/**
 * 对合法正文执行折行。
 * 成功时返回覆盖全部字符的唯一行序列；失败时返回卡住的起始位置，不输出部分排样。
 */
export function layoutText(text: string, width: number): LayoutResult {
  const chars = toChars(text);
  const lines: LayoutLine[] = [];
  let pos = 0;

  while (pos < chars.length) {
    const maxLen = Math.min(width, chars.length - pos);
    let chosen = -1;

    for (let len = maxLen; len >= 1; len--) {
      const last = chars[pos + len - 1];
      if (FORBIDDEN_LINE_END.has(last)) continue;
      const next = pos + len < chars.length ? chars[pos + len] : undefined;
      if (next !== undefined && FORBIDDEN_LINE_START.has(next)) continue;
      chosen = len;
      break;
    }

    if (chosen === -1) {
      return { ok: false, failAt: pos, failChar: chars[pos] };
    }

    const start = pos;
    const nextPos = pos + chosen;
    let breakKind: BreakKind;
    let movedChar: string | null = null;
    let movedCharIndex: number | null = null;
    const triggeredRules: TriggeredRule[] = [];

    if (nextPos >= chars.length) {
      breakKind = '文末';
    } else {
      movedChar = chars[nextPos];
      movedCharIndex = nextPos;
      if (chosen === maxLen) {
        breakKind = '行满';
      } else {
        // 更长的候选（chosen + 1）被否决的原因，即本行提前断行触发的禁则。
        breakKind = '禁则';
        const blocked = chars[nextPos];
        if (FORBIDDEN_LINE_END.has(blocked)) {
          triggeredRules.push({ rule: '禁行尾', char: blocked, index: nextPos });
        }
        const after = nextPos + 1 < chars.length ? chars[nextPos + 1] : undefined;
        if (after !== undefined && FORBIDDEN_LINE_START.has(after)) {
          triggeredRules.push({ rule: '禁行首', char: after, index: nextPos + 1 });
        }
      }
    }

    lines.push({
      lineNo: lines.length + 1,
      start,
      end: nextPos - 1,
      length: chosen,
      text: chars.slice(start, nextPos).join(''),
      breakKind,
      movedChar,
      movedCharIndex,
      triggeredRules,
    });
    pos = nextPos;
  }

  return { ok: true, lines };
}
