import { useMemo, useState } from 'react';
import {
  MAX_LINE_WIDTH,
  MAX_TEXT_LENGTH,
  MIN_LINE_WIDTH,
  layoutText,
  toChars,
  validateText,
  validateWidth,
  type LayoutLine,
  type LayoutResult,
} from './lib/wrap';
import './styles.css';

function describeRules(line: LayoutLine): string {
  if (line.breakKind === '行满') return '无（行满）';
  if (line.breakKind === '文末') return '无（文末）';
  return line.triggeredRules
    .map((r) => `${r.rule}：「${r.char}」（索引 ${r.index}）`)
    .join('；');
}

function LayoutTable({ lines, width }: { lines: LayoutLine[]; width: number }) {
  return (
    <table className="layout-table" data-testid="layout-table">
      <thead>
        <tr>
          <th>行</th>
          <th>起止索引</th>
          <th>字数</th>
          <th>行文（每字一格）</th>
          <th>移入下一行</th>
          <th>触发禁则</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.lineNo} data-testid="line-row">
            <td data-testid="line-no">{line.lineNo}</td>
            <td data-testid="line-range">
              {line.start}–{line.end}
            </td>
            <td data-testid="line-length">{line.length}</td>
            <td data-testid="line-text">
              <span className="cells">
                {toChars(line.text).map((ch, i) => (
                  <span key={i} className="cell">
                    {ch}
                  </span>
                ))}
                {Array.from({ length: width - line.length }, (_, i) => (
                  <span key={`pad-${i}`} className="cell cell-empty" />
                ))}
              </span>
            </td>
            <td data-testid="line-moved">
              {line.movedChar === null
                ? '—'
                : `「${line.movedChar}」（索引 ${line.movedCharIndex}）`}
            </td>
            <td data-testid="line-rule">{describeRules(line)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function App() {
  const [text, setText] = useState('');
  const [widthRaw, setWidthRaw] = useState('12');
  const [result, setResult] = useState<LayoutResult | null>(null);
  const [usedWidth, setUsedWidth] = useState<number | null>(null);

  const textCheck = useMemo(() => validateText(text), [text]);
  const widthCheck = useMemo(() => validateWidth(widthRaw), [widthRaw]);
  const invalidIndexSet = useMemo(
    () => new Set(textCheck.invalidChars.map((c) => c.index)),
    [textCheck],
  );
  const canTypeset = textCheck.valid && widthCheck.valid;

  // 输入一经修改，旧排样立即撤销。
  const revoke = () => {
    setResult(null);
    setUsedWidth(null);
  };

  const handleTypeset = () => {
    if (!canTypeset || widthCheck.value === null) return;
    setResult(layoutText(text, widthCheck.value));
    setUsedWidth(widthCheck.value);
  };

  return (
    <main className="app">
      <h1>铅字校样折行器</h1>
      <p className="hint">
        仅接受常用汉字及「，。！？、；：“”（）《》」，每字一格；禁行首「，。！？、；：）》”」，禁行尾「（《“」。索引自
        0 计。
      </p>

      <section className="panel">
        <label htmlFor="text-input">正文（1–{MAX_TEXT_LENGTH} 字）</label>
        <textarea
          id="text-input"
          data-testid="text-input"
          rows={4}
          value={text}
          placeholder="请输入正文…"
          onChange={(e) => {
            setText(e.target.value);
            revoke();
          }}
        />
        <div className="meta" data-testid="char-count">
          {textCheck.length} / {MAX_TEXT_LENGTH} 字
        </div>

        {textCheck.length > 0 && (
          <div className="char-strip" data-testid="char-strip">
            {toChars(text).map((ch, i) => (
              <span
                key={i}
                className={invalidIndexSet.has(i) ? 'char char-invalid' : 'char'}
              >
                <span className="char-glyph">{ch}</span>
                <span className="char-index">{i}</span>
              </span>
            ))}
          </div>
        )}

        {!textCheck.valid && (
          <ul className="errors" data-testid="text-errors">
            {textCheck.empty && <li>正文不能为空（至少 1 字）。</li>}
            {textCheck.tooLong && <li>正文超过 {MAX_TEXT_LENGTH} 字。</li>}
            {textCheck.invalidChars.map((c) => (
              <li key={c.index} data-testid="invalid-char">
                非法字符「{c.char}」，索引 {c.index}
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="width-input">
          每行字格（{MIN_LINE_WIDTH}–{MAX_LINE_WIDTH}）
        </label>
        <input
          id="width-input"
          data-testid="width-input"
          type="number"
          min={MIN_LINE_WIDTH}
          max={MAX_LINE_WIDTH}
          value={widthRaw}
          onChange={(e) => {
            setWidthRaw(e.target.value);
            revoke();
          }}
        />
        {!widthCheck.valid && (
          <p className="errors" data-testid="width-error">
            行宽须为 {MIN_LINE_WIDTH}–{MAX_LINE_WIDTH} 的整数。
          </p>
        )}

        <button
          type="button"
          data-testid="typeset-button"
          disabled={!canTypeset}
          onClick={handleTypeset}
        >
          生成排样
        </button>
      </section>

      {result && usedWidth !== null && (
        <section className="panel" data-testid="layout-result">
          {result.ok ? (
            <LayoutTable lines={result.lines} width={usedWidth} />
          ) : (
            <div className="failure" data-testid="layout-failure">
              无可行断点：起始索引 {result.failAt}（字符「{result.failChar}
              」）。整段排样失败，不输出部分排样。
            </div>
          )}
        </section>
      )}
    </main>
  );
}
