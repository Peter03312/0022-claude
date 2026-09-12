import { useMemo, useState } from 'react';
import {
  MAX_LINE_WIDTH,
  MAX_TEXT_LENGTH,
  MIN_LINE_WIDTH,
  describeManualFailure,
  layoutText,
  toChars,
  validateText,
  validateWidth,
  type ConstrainedLayoutResult,
  type LayoutLine,
  type LayoutResult,
  type ManualBreakFailure,
} from './lib/wrap';
import './styles.css';

function describeRules(line: LayoutLine): string {
  if (line.breakKind === '行满') return '无（行满）';
  if (line.breakKind === '文末') return '无（文末）';
  if (line.breakKind === '人工断点') {
    return `人工断点：移入下一行「${line.movedChar}」（索引 ${line.movedCharIndex}）`;
  }
  return line.triggeredRules
    .map((r) => `${r.rule}：「${r.char}」（索引 ${r.index}）`)
    .join('；');
}

interface LayoutTableProps {
  lines: LayoutLine[];
  width: number;
  /** 选中的人工断点间隙索引；null 表示无选择。 */
  breakpoint: number | null;
  /** 点击某个字符间隙请求人工断点（再次点已选间隙即取消）。 */
  onGapClick: (index: number) => void;
  /** 人工断点重排成功时，断点对应的行（前段最后一行）的行号。 */
  selectedLineNo: number | null;
}

function LayoutTable({
  lines,
  width,
  breakpoint,
  onGapClick,
  selectedLineNo,
}: LayoutTableProps) {
  const lastLineNo = lines[lines.length - 1].lineNo;
  return (
    <table className="layout-table" data-testid="layout-table">
      <thead>
        <tr>
          <th>行</th>
          <th>起止索引</th>
          <th>字数</th>
          <th>行文（每字一格，点击字格间隙设人工断点）</th>
          <th>移入下一行</th>
          <th>触发禁则</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr
            key={line.lineNo}
            data-testid="line-row"
            data-selected-line={
              selectedLineNo === line.lineNo ? 'true' : undefined
            }
          >
            <td data-testid="line-no">{line.lineNo}</td>
            <td data-testid="line-range">
              {line.start}–{line.end}
            </td>
            <td data-testid="line-length">{line.length}</td>
            <td data-testid="line-text">
              <span className="cells">
                {toChars(line.text).map((ch, i) => {
                  const gapIndex = line.start + i;
                  // 每个字符前渲染一个间隙（行内间隙与行首交界间隙不重复）；
                  // 最后一行末尾再补文末间隙（索引 = 正文长度）。
                  const isLastCell = i === line.length - 1;
                  const showEndGap = isLastCell && line.lineNo === lastLineNo;
                  return (
                    <span key={i} className="cell-wrap">
                      <button
                        type="button"
                        className={
                          breakpoint === gapIndex
                            ? 'cell-gap cell-gap-selected'
                            : 'cell-gap'
                        }
                        data-testid="cell-gap"
                        data-gap-index={gapIndex}
                        aria-label={`在索引 ${gapIndex} 处设置人工断点`}
                        aria-pressed={breakpoint === gapIndex}
                        onClick={() => onGapClick(gapIndex)}
                      />
                      <span className="cell">{ch}</span>
                      {showEndGap && (
                        <button
                          type="button"
                          className={
                            breakpoint === gapIndex + 1
                              ? 'cell-gap cell-gap-selected'
                              : 'cell-gap'
                          }
                          data-testid="cell-gap"
                          data-gap-index={gapIndex + 1}
                          aria-label={`在索引 ${gapIndex + 1} 处设置人工断点`}
                          aria-pressed={breakpoint === gapIndex + 1}
                          onClick={() => onGapClick(gapIndex + 1)}
                        />
                      )}
                    </span>
                  );
                })}
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
  // 人工断点间隙索引（chars[k] 之前）；null 为无选择。
  const [breakIndex, setBreakIndex] = useState<number | null>(null);
  // 人工断点重排结果；失败时保留原排样（result）并给出原因。
  const [constrained, setConstrained] = useState<ConstrainedLayoutResult | null>(
    null,
  );

  const textCheck = useMemo(() => validateText(text), [text]);
  const widthCheck = useMemo(() => validateWidth(widthRaw), [widthRaw]);
  const invalidIndexSet = useMemo(
    () => new Set(textCheck.invalidChars.map((c) => c.index)),
    [textCheck],
  );
  const canTypeset = textCheck.valid && widthCheck.valid;

  // 输入一经修改，旧排样、人工断点与重排结果立即撤销，避免索引漂移。
  const revoke = () => {
    setResult(null);
    setUsedWidth(null);
    setBreakIndex(null);
    setConstrained(null);
  };

  const handleTypeset = () => {
    if (!canTypeset || widthCheck.value === null) return;
    setResult(layoutText(text, widthCheck.value));
    setUsedWidth(widthCheck.value);
    setBreakIndex(null);
    setConstrained(null);
  };

  const handleGapClick = (gapIndex: number) => {
    if (!result || !result.ok || usedWidth === null) return;
    // 再次点击已选断点 → 取消，恢复原排样。
    if (breakIndex === gapIndex) {
      setBreakIndex(null);
      setConstrained(null);
      return;
    }
    setBreakIndex(gapIndex);
    setConstrained(layoutText(text, usedWidth, gapIndex));
  };

  const manualFailure: ManualBreakFailure | null =
    constrained && !constrained.ok ? constrained : null;

  const displayedLines: LayoutLine[] | null =
    result?.ok
      ? constrained?.ok
        ? constrained.lines
        : result.lines
      : null;

  const selectedLineNo =
    constrained?.ok && result?.ok
      ? (() => {
          const line = constrained.lines.find(
            (l) => l.movedCharIndex === constrained.breakpoint,
          );
          return line ? line.lineNo : null;
        })()
      : null;

  return (
    <main className="app">
      <h1>铅字校样折行器</h1>
      <p className="hint">
        仅接受常用汉字及「，。！？、；：“”（）《》」，每字一格；禁行首「，。！？、；：）》”」，禁行尾「（《“」。索引自
        0 计。生成排样后，可点击相邻字格之间的间隙指定人工断点强制折行，再次点击该间隙取消。
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
          {!result.ok ? (
            <div className="failure" data-testid="layout-failure">
              无可行断点：起始索引 {result.failAt}（字符「{result.failChar}
              」）。整段排样失败，不输出部分排样。
            </div>
          ) : (
            <>
              {constrained?.ok && (
                <p className="manual-info" data-testid="manual-info">
                  已在索引 {constrained.breakpoint}（「
                  {toChars(text)[constrained.breakpoint]}」之前）按原字格宽度
                  {usedWidth} 重排；再次点击该间隙可取消人工断点、恢复原排样。
                </p>
              )}
              {manualFailure && (
                <p className="failure" data-testid="manual-failure">
                  {describeManualFailure(manualFailure)}
                  。人工断点未生效，未展示部分排样；再次点击该间隙可取消选择。
                </p>
              )}
              {displayedLines && (
                <LayoutTable
                  lines={displayedLines}
                  width={usedWidth}
                  breakpoint={breakIndex}
                  onGapClick={handleGapClick}
                  selectedLineNo={selectedLineNo}
                />
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
