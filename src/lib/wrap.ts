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
 *
 * 人工断点：layoutText 的第三参数为字符间隙索引 k（切在 chars[k] 之前），
 *   正文被切成 [0,k)、[k,n) 两个连续区段，分别复用上述最长合法前缀算法，
 *   区段交界同样受禁行首、禁行尾约束；两段都完整排出才返回结果。
 *   不传第三参数时，行为与输出结构与原算法完全一致。
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

const HANZI_PATTERN = /[一-鿿]/;
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

/** 断行方式：行满（占满字格）、禁则（因禁则提前断行）、人工断点（校样员指定）、文末（正文结束）。 */
export type BreakKind = '行满' | '禁则' | '人工断点' | '文末';

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

/** 人工断点被拒绝的具体原因。 */
export type ManualBreakReason =
  | '断点位于正文两端'
  | '断点后为禁行首字符'
  | '断点前为禁行尾字符'
  | '前段无可行断点'
  | '后段无可行断点';

/** 人工断点排样失败：指出断点索引与具体原因，不输出部分排样。 */
export interface ManualBreakFailure {
  ok: false;
  /** 区分于无参排样失败。 */
  manual: true;
  /** 用户点选的字符间隙索引。 */
  breakpoint: number;
  reason: ManualBreakReason;
  /** 与原因直接相关的字符全局索引；端点原因不指向字符时为 null。 */
  reasonIndex: number | null;
  reasonChar: string | null;
}

export type ConstrainedLayoutResult =
  | { ok: true; manual: true; breakpoint: number; lines: LayoutLine[] }
  | ManualBreakFailure;

/** 贪心草稿：行内索引相对于区段起点。 */
interface LineDraft {
  start: number;
  end: number;
  length: number;
  text: string;
  breakKind: BreakKind;
  movedChar: string | null;
  movedCharIndex: number | null;
  triggeredRules: TriggeredRule[];
}

type GreedyOutcome =
  | { ok: true; drafts: LineDraft[] }
  | { ok: false; failAt: number; failChar: string };

/**
 * 最长合法前缀贪心：对一个连续区段执行折行（既有算法，确定性输出唯一）。
 * 返回的行索引均为区段内局部索引；失败时给出区段内卡住位置。
 */
function runGreedy(chars: string[], width: number): GreedyOutcome {
  const drafts: LineDraft[] = [];
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

    drafts.push({
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

  return { ok: true, drafts };
}

/** 把区段局部行号、索引平移为正文全局索引。 */
function rebaseLines(
  drafts: LineDraft[],
  offset: number,
  lineNoStart: number,
): LayoutLine[] {
  return drafts.map((draft, i) => ({
    lineNo: lineNoStart + i,
    start: draft.start + offset,
    end: draft.end + offset,
    length: draft.length,
    text: draft.text,
    breakKind: draft.breakKind,
    movedChar: draft.movedChar,
    movedCharIndex:
      draft.movedCharIndex === null ? null : draft.movedCharIndex + offset,
    triggeredRules: draft.triggeredRules.map((rule) => ({
      ...rule,
      index: rule.index + offset,
    })),
  }));
}

/**
 * 对合法正文执行折行（不传人工断点，行为与输出结构保持原样）。
 * 成功时返回覆盖全部字符的唯一行序列；失败时返回卡住的起始位置，不输出部分排样。
 */
export function layoutText(text: string, width: number): LayoutResult;
/**
 * 带人工断点的折行：在字符间隙 breakpoint（chars[breakpoint] 之前）切开，
 * 两个连续区段分别复用最长合法前缀算法；两段都能完整排出才返回重排结果，
 * 否则返回断点索引与具体原因，不输出部分排样。
 */
export function layoutText(
  text: string,
  width: number,
  breakpoint: number,
): ConstrainedLayoutResult;
export function layoutText(
  text: string,
  width: number,
  breakpoint?: number,
): LayoutResult | ConstrainedLayoutResult {
  const chars = toChars(text);

  if (breakpoint === undefined) {
    const outcome = runGreedy(chars, width);
    if (!outcome.ok) {
      return { ok: false, failAt: outcome.failAt, failChar: outcome.failChar };
    }
    return { ok: true, lines: rebaseLines(outcome.drafts, 0, 1) };
  }

  const n = chars.length;
  const fail = (
    reason: ManualBreakReason,
    reasonIndex: number | null,
    reasonChar: string | null,
  ): ManualBreakFailure => ({
    ok: false,
    manual: true,
    breakpoint,
    reason,
    reasonIndex,
    reasonChar,
  });

  // 断点必须落在两个相邻字符之间：0 与 n 是正文两端，不切出任何区段。
  if (!Number.isInteger(breakpoint) || breakpoint <= 0 || breakpoint >= n) {
    return fail('断点位于正文两端', null, null);
  }
  // 交界禁则：后段开头不得是禁行首字符，前段末尾不得是禁行尾字符。
  if (FORBIDDEN_LINE_START.has(chars[breakpoint])) {
    return fail('断点后为禁行首字符', breakpoint, chars[breakpoint]);
  }
  if (FORBIDDEN_LINE_END.has(chars[breakpoint - 1])) {
    return fail('断点前为禁行尾字符', breakpoint - 1, chars[breakpoint - 1]);
  }

  // 两个连续区段分别复用既有最长合法前缀算法。
  const first = runGreedy(chars.slice(0, breakpoint), width);
  if (!first.ok) {
    const index = first.failAt;
    return fail('前段无可行断点', index, chars[index]);
  }
  const second = runGreedy(chars.slice(breakpoint), width);
  if (!second.ok) {
    const index = breakpoint + second.failAt;
    return fail('后段无可行断点', index, chars[index]);
  }

  const firstLines = rebaseLines(first.drafts, 0, 1);
  const lines = firstLines.concat(
    rebaseLines(second.drafts, breakpoint, firstLines.length + 1),
  );

  // 区段交界行：前段在 greedy 中以「文末」结束，按人工断点重新标注。
  const junction = firstLines[firstLines.length - 1];
  junction.breakKind = junction.length === width ? '行满' : '人工断点';
  junction.movedChar = chars[breakpoint];
  junction.movedCharIndex = breakpoint;
  junction.triggeredRules = [];

  return { ok: true, manual: true, breakpoint, lines };
}

/** 人工断点失败原因的界面文案：指出断点索引与具体原因。 */
export function describeManualFailure(failure: ManualBreakFailure): string {
  const { breakpoint, reason, reasonIndex, reasonChar } = failure;
  switch (reason) {
    case '断点位于正文两端':
      return `断点索引 ${breakpoint} 位于正文两端：人工断点必须选在两个相邻字符之间，前段或后段不能为空`;
    case '断点后为禁行首字符':
      return `断点索引 ${breakpoint} 把「${reasonChar}」（索引 ${reasonIndex}）留在后段开头，该字符属禁行首字符，不能置于行首`;
    case '断点前为禁行尾字符':
      return `断点索引 ${breakpoint} 把「${reasonChar}」（索引 ${reasonIndex}）留在前段末尾，该字符属禁行尾字符，不能置于行尾`;
    case '前段无可行断点':
      return `前段在索引 ${reasonIndex}（字符「${reasonChar}」）处无可行断点，无法完整排出`;
    case '后段无可行断点':
      return `后段在索引 ${reasonIndex}（字符「${reasonChar}」）处无可行断点，无法完整排出`;
  }
}
