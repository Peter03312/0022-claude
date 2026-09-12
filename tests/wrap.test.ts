import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_LINE_END,
  FORBIDDEN_LINE_START,
  MAX_TEXT_LENGTH,
  layoutText,
  validateText,
  validateWidth,
  type LayoutResult,
} from '../src/lib/wrap';

describe('validateText', () => {
  it('接受常用汉字与全部允许标点', () => {
    const r = validateText('天地玄黄，。！？、；：“”（）《》');
    expect(r.valid).toBe(true);
    expect(r.invalidChars).toEqual([]);
  });

  it('拒绝空正文', () => {
    const r = validateText('');
    expect(r.valid).toBe(false);
    expect(r.empty).toBe(true);
  });

  it('按索引标出拉丁字母', () => {
    const r = validateText('Hello世界');
    expect(r.valid).toBe(false);
    expect(r.invalidChars).toEqual([
      { index: 0, char: 'H' },
      { index: 1, char: 'e' },
      { index: 2, char: 'l' },
      { index: 3, char: 'l' },
      { index: 4, char: 'o' },
    ]);
  });

  it('按索引标出数字', () => {
    const r = validateText('天地1玄9');
    expect(r.invalidChars).toEqual([
      { index: 2, char: '1' },
      { index: 4, char: '9' },
    ]);
  });

  it('按索引标出空白字符', () => {
    const r = validateText('天地 玄\n黄　宇');
    expect(r.invalidChars.map((c) => c.index)).toEqual([2, 4, 6]);
  });

  it('拒绝集合外标点与符号', () => {
    const r = validateText('天,地.玄;黄"');
    expect(r.valid).toBe(false);
    expect(r.invalidChars.map((c) => c.index)).toEqual([1, 3, 5, 7]);
  });

  it(`长度 ${MAX_TEXT_LENGTH} 合法、${MAX_TEXT_LENGTH + 1} 超长`, () => {
    expect(validateText('天'.repeat(MAX_TEXT_LENGTH)).valid).toBe(true);
    const r = validateText('天'.repeat(MAX_TEXT_LENGTH + 1));
    expect(r.valid).toBe(false);
    expect(r.tooLong).toBe(true);
  });
});

describe('validateWidth', () => {
  it('接受 8–20 的整数', () => {
    expect(validateWidth('8')).toEqual({ valid: true, value: 8 });
    expect(validateWidth('20')).toEqual({ valid: true, value: 20 });
    expect(validateWidth('12')).toEqual({ valid: true, value: 12 });
  });

  it('拒绝越界、非整数与非数字', () => {
    for (const raw of ['7', '21', '8.5', 'abc', '', '  ', '1e2']) {
      expect(validateWidth(raw).valid).toBe(false);
    }
  });
});

describe('layoutText 断点选择', () => {
  it('下一字符属禁行首时逐字回退', () => {
    const r = layoutText('天地玄黄宇宙洪荒，日月盈昃辰宿列张。', 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines).toHaveLength(3);

    expect(r.lines[0]).toMatchObject({
      lineNo: 1,
      start: 0,
      end: 6,
      length: 7,
      text: '天地玄黄宇宙洪',
      breakKind: '禁则',
      movedChar: '荒',
      movedCharIndex: 7,
    });
    expect(r.lines[0].triggeredRules).toEqual([
      { rule: '禁行首', char: '，', index: 8 },
    ]);

    expect(r.lines[1]).toMatchObject({
      lineNo: 2,
      start: 7,
      end: 14,
      length: 8,
      text: '荒，日月盈昃辰宿',
      breakKind: '行满',
      movedChar: '列',
      movedCharIndex: 15,
      triggeredRules: [],
    });

    expect(r.lines[2]).toMatchObject({
      lineNo: 3,
      start: 15,
      end: 17,
      length: 3,
      text: '列张。',
      breakKind: '文末',
      movedChar: null,
      movedCharIndex: null,
      triggeredRules: [],
    });
  });

  it('末字符属禁行尾时逐字回退', () => {
    const r = layoutText('子曰学而时习之（孔子）曰', 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({
      start: 0,
      end: 6,
      length: 7,
      text: '子曰学而时习之',
      breakKind: '禁则',
      movedChar: '（',
      movedCharIndex: 7,
    });
    expect(r.lines[0].triggeredRules).toEqual([
      { rule: '禁行尾', char: '（', index: 7 },
    ]);
    expect(r.lines[1]).toMatchObject({
      start: 7,
      end: 11,
      length: 5,
      text: '（孔子）曰',
      breakKind: '文末',
    });
  });

  it('最长候选不合法时逐字符向前寻找（多步回退）', () => {
    const r = layoutText('一二三四（（六七', 6);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]).toMatchObject({
      start: 0,
      end: 3,
      length: 4,
      text: '一二三四',
      breakKind: '禁则',
      movedChar: '（',
      movedCharIndex: 4,
    });
    expect(r.lines[1]).toMatchObject({ start: 4, end: 7, text: '（（六七' });
  });

  it('同一断点可同时触发禁行尾与禁行首', () => {
    const r = layoutText('一二三四（，五六', 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]).toMatchObject({
      start: 0,
      end: 3,
      length: 4,
      breakKind: '禁则',
      movedChar: '（',
      movedCharIndex: 4,
    });
    expect(r.lines[0].triggeredRules).toEqual([
      { rule: '禁行尾', char: '（', index: 4 },
      { rule: '禁行首', char: '，', index: 5 },
    ]);
  });

  it('恰好行满不触发禁则', () => {
    const r = layoutText('天地玄黄宇宙洪荒日月盈昃辰宿列张', 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({
      start: 0,
      end: 7,
      length: 8,
      breakKind: '行满',
      movedChar: '日',
      movedCharIndex: 8,
      triggeredRules: [],
    });
    expect(r.lines[1]).toMatchObject({
      start: 8,
      end: 15,
      length: 8,
      breakKind: '文末',
      movedChar: null,
    });
  });

  it('禁行首集合仅约束断点，不约束全文首字符', () => {
    const r = layoutText('，天地玄黄宇宙洪荒', 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]).toMatchObject({
      start: 0,
      end: 7,
      text: '，天地玄黄宇宙洪',
      breakKind: '行满',
    });
    expect(r.lines[1]).toMatchObject({ start: 8, end: 8, text: '荒' });
  });

  it('找不到任何候选时整段失败并标出起始位置', () => {
    const r = layoutText('天地玄黄宇宙（', 8);
    expect(r).toEqual({ ok: false, failAt: 6, failChar: '（' });
  });

  it('首字符即无可行断点时失败位置为 0', () => {
    expect(layoutText('（', 8)).toEqual({ ok: false, failAt: 0, failChar: '（' });
    expect(layoutText('（《“', 12)).toEqual({ ok: false, failAt: 0, failChar: '（' });
  });
});

describe('layoutText 唯一性与逐字可追溯性', () => {
  const POOL = '天地玄黄宇宙洪荒日月盈昃辰宿列张，。！？、；：“”（）《》';

  // 确定性伪随机（LCG），覆盖多种长度与行宽。
  function makeText(seed: number, length: number): string {
    let s = seed >>> 0 || 1;
    let out = '';
    for (let i = 0; i < length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      out += POOL[s % POOL.length];
    }
    return out;
  }

  function expectTraceable(text: string, width: number) {
    const r1 = layoutText(text, width);
    const r2 = layoutText(text, width);
    // 唯一性：同一输入必得同一排样。
    expect(r2).toEqual(r1);

    if (!r1.ok) {
      // 失败：只给出起始位置，不输出部分排样。
      expect(r1.failAt).toBeGreaterThanOrEqual(0);
      expect(r1.failAt).toBeLessThan(text.length);
      expect(r1).not.toHaveProperty('lines');
      return;
    }

    // 逐字可追溯：各行首尾相接、不重不漏，拼接即原文。
    expect(r1.lines.map((l) => l.text).join('')).toBe(text);
    r1.lines.forEach((line, i) => {
      expect(line.length).toBeGreaterThanOrEqual(1);
      expect(line.length).toBeLessThanOrEqual(width);
      expect(line.end - line.start + 1).toBe(line.length);
      expect(line.text).toBe(text.slice(line.start, line.end + 1));
      if (i > 0) expect(line.start).toBe(r1.lines[i - 1].end + 1);
      // 行末字符不属于禁行尾。
      expect(FORBIDDEN_LINE_END.has(line.text[line.text.length - 1])).toBe(false);
      // 断点后移入下一行的字符不属于禁行首。
      if (line.movedChar !== null) {
        expect(FORBIDDEN_LINE_START.has(line.movedChar)).toBe(false);
        expect(line.movedCharIndex).toBe(line.end + 1);
        expect(line.movedChar).toBe(text[line.end + 1]);
      } else {
        expect(line.end).toBe(text.length - 1);
      }
      // 因禁则提前断行时必记录触发的禁则。
      if (line.breakKind === '禁则') {
        expect(line.triggeredRules.length).toBeGreaterThan(0);
      } else {
        expect(line.triggeredRules).toEqual([]);
      }
    });
  }

  it('随机样例均满足不变式', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const length = 1 + (seed * 37) % 200;
      const width = 8 + (seed % 13);
      expectTraceable(makeText(seed, length), width);
    }
  });

  it('边界：单字符正文与最大行宽', () => {
    expectTraceable('天', 8);
    expectTraceable('天', 20);
    expectTraceable('，', 8);
    expectTraceable(makeText(7, 200), 20);
  });
});

describe('layoutText 结果类型', () => {
  it('成功与失败互斥', () => {
    const ok: LayoutResult = layoutText('天地玄黄', 8);
    expect(ok.ok).toBe(true);
    const fail: LayoutResult = layoutText('（', 8);
    expect(fail.ok).toBe(false);
  });
});
