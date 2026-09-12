import { expect, test } from '@playwright/test';

const SAMPLE = '天地玄黄宇宙洪荒，日月盈昃辰宿列张。';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('输入合法正文后生成唯一且逐字可追溯的排样', async ({ page }) => {
  await page.getByTestId('text-input').fill(SAMPLE);
  await page.getByTestId('width-input').fill('8');
  await page.getByTestId('typeset-button').click();

  const rows = page.getByTestId('line-row');
  await expect(rows).toHaveCount(3);

  // 第 1 行：「，」禁行首，断点回退一字。
  await expect(rows.nth(0).getByTestId('line-no')).toHaveText('1');
  await expect(rows.nth(0).getByTestId('line-range')).toHaveText('0–6');
  await expect(rows.nth(0).getByTestId('line-length')).toHaveText('7');
  await expect(rows.nth(0).getByTestId('line-text')).toHaveText('天地玄黄宇宙洪');
  await expect(rows.nth(0).getByTestId('line-moved')).toContainText('「荒」（索引 7）');
  await expect(rows.nth(0).getByTestId('line-rule')).toContainText('禁行首：「，」（索引 8）');

  // 第 2 行：行满，无禁则。
  await expect(rows.nth(1).getByTestId('line-range')).toHaveText('7–14');
  await expect(rows.nth(1).getByTestId('line-length')).toHaveText('8');
  await expect(rows.nth(1).getByTestId('line-text')).toHaveText('荒，日月盈昃辰宿');
  await expect(rows.nth(1).getByTestId('line-moved')).toContainText('「列」（索引 15）');
  await expect(rows.nth(1).getByTestId('line-rule')).toContainText('行满');

  // 第 3 行：文末。
  await expect(rows.nth(2).getByTestId('line-range')).toHaveText('15–17');
  await expect(rows.nth(2).getByTestId('line-length')).toHaveText('3');
  await expect(rows.nth(2).getByTestId('line-text')).toHaveText('列张。');
  await expect(rows.nth(2).getByTestId('line-moved')).toHaveText('—');
  await expect(rows.nth(2).getByTestId('line-rule')).toContainText('文末');
});

test('禁行尾触发时标出移入下一行的字符', async ({ page }) => {
  await page.getByTestId('text-input').fill('子曰学而时习之（孔子）曰');
  await page.getByTestId('width-input').fill('8');
  await page.getByTestId('typeset-button').click();

  const rows = page.getByTestId('line-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByTestId('line-range')).toHaveText('0–6');
  await expect(rows.nth(0).getByTestId('line-moved')).toContainText('「（」（索引 7）');
  await expect(rows.nth(0).getByTestId('line-rule')).toContainText('禁行尾：「（」（索引 7）');
  await expect(rows.nth(1).getByTestId('line-text')).toHaveText('（孔子）曰');
});

test('输入一经修改，旧排样立即撤销', async ({ page }) => {
  await page.getByTestId('text-input').fill(SAMPLE);
  await page.getByTestId('typeset-button').click();
  await expect(page.getByTestId('layout-result')).toBeVisible();

  // 修改正文 → 撤销。
  await page.getByTestId('text-input').fill(`${SAMPLE}天`);
  await expect(page.getByTestId('layout-result')).toHaveCount(0);

  // 重新排样后修改行宽 → 同样撤销。
  await page.getByTestId('typeset-button').click();
  await expect(page.getByTestId('layout-result')).toBeVisible();
  await page.getByTestId('width-input').fill('10');
  await expect(page.getByTestId('layout-result')).toHaveCount(0);
});

test('非法字符按索引标出并阻止排样', async ({ page }) => {
  await page.getByTestId('text-input').fill('天地a1 玄黄');

  const invalid = page.getByTestId('invalid-char');
  await expect(invalid).toHaveCount(3);
  await expect(invalid.nth(0)).toContainText('索引 2');
  await expect(invalid.nth(1)).toContainText('索引 3');
  await expect(invalid.nth(2)).toContainText('索引 4');

  // 字符索引条同步高亮非法字符。
  await expect(page.getByTestId('char-strip').locator('.char-invalid')).toHaveCount(3);

  await expect(page.getByTestId('typeset-button')).toBeDisabled();
  await expect(page.getByTestId('layout-result')).toHaveCount(0);
});

test('空白、拉丁字母与数字均被拒绝', async ({ page }) => {
  await page.getByTestId('text-input').fill('天地 abc 123');
  // a b c 1 2 3 与两个空格，共 8 个非法字符。
  await expect(page.getByTestId('invalid-char')).toHaveCount(8);
  await expect(page.getByTestId('typeset-button')).toBeDisabled();
});

test('行宽超出 8–20 时提示并阻止排样', async ({ page }) => {
  await page.getByTestId('text-input').fill(SAMPLE);
  await page.getByTestId('width-input').fill('7');
  await expect(page.getByTestId('width-error')).toBeVisible();
  await expect(page.getByTestId('typeset-button')).toBeDisabled();

  await page.getByTestId('width-input').fill('21');
  await expect(page.getByTestId('width-error')).toBeVisible();
  await expect(page.getByTestId('typeset-button')).toBeDisabled();
});

test('无可行断点时标出起始位置且不输出部分排样', async ({ page }) => {
  await page.getByTestId('text-input').fill('天地玄黄宇宙（');
  await page.getByTestId('width-input').fill('8');
  await page.getByTestId('typeset-button').click();

  const failure = page.getByTestId('layout-failure');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText('起始索引 6');
  await expect(failure).toContainText('「（」');
  await expect(page.getByTestId('line-row')).toHaveCount(0);
});

test('正文超过 200 字时提示并阻止排样', async ({ page }) => {
  await page.getByTestId('text-input').fill('天'.repeat(201));
  await expect(page.getByTestId('char-count')).toHaveText('201 / 200 字');
  await expect(page.getByTestId('text-errors')).toContainText('超过 200 字');
  await expect(page.getByTestId('typeset-button')).toBeDisabled();
});

test.describe('人工断点', () => {
  const gap = (page: import('@playwright/test').Page, index: number) =>
    page.locator(`.cell-gap[data-gap-index="${index}"]`);

  test('选定断点按原字格宽度重排，取消后恢复原排样', async ({ page }) => {
    await page.getByTestId('text-input').fill(SAMPLE);
    await page.getByTestId('width-input').fill('8');
    await page.getByTestId('typeset-button').click();

    const rows = page.getByTestId('line-row');
    await expect(rows).toHaveCount(3);

    // 原排样：第 1 行 0–6（7 字），因「，」禁行首回退。
    await expect(rows.nth(0).getByTestId('line-range')).toHaveText('0–6');
    await expect(rows.nth(0).getByTestId('line-text')).toHaveText(
      '天地玄黄宇宙洪',
    );
    await expect(page.getByTestId('manual-info')).toHaveCount(0);

    // 在「黄」「宇」之间（间隙 4）选定人工断点。
    await gap(page, 4).click();

    await expect(page.getByTestId('manual-info')).toBeVisible();
    await expect(page.getByTestId('manual-info')).toContainText('索引 4');

    // 单一选中态：间隙 4 高亮，且对应行（前段最后一行，行号 1）标记。
    await expect(gap(page, 4)).toHaveClass(/cell-gap-selected/);
    await expect(gap(page, 4)).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('tr[data-selected-line="true"]'),
    ).toHaveCount(1);
    await expect(
      rows.nth(0).locator('tr[data-selected-line="true"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('tr[data-selected-line="true"]').getByTestId('line-no'),
    ).toHaveText('1');

    // 重排结果：仍 3 行，按原字格宽度折行，第 1 行变为「天地玄黄」。
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByTestId('line-range')).toHaveText('0–3');
    await expect(rows.nth(0).getByTestId('line-length')).toHaveText('4');
    await expect(rows.nth(0).getByTestId('line-text')).toHaveText('天地玄黄');
    await expect(rows.nth(0).getByTestId('line-moved')).toContainText(
      '「宇」（索引 4）',
    );
    await expect(rows.nth(0).getByTestId('line-rule')).toContainText('人工断点');
    await expect(rows.nth(1).getByTestId('line-text')).toHaveText(
      '宇宙洪荒，日月盈',
    );
    await expect(rows.nth(1).getByTestId('line-range')).toHaveText('4–11');
    await expect(rows.nth(2).getByTestId('line-text')).toHaveText('昃辰宿列张。');

    // 再次点击同一间隙取消，恢复原排样。
    await gap(page, 4).click();
    await expect(page.getByTestId('manual-info')).toHaveCount(0);
    await expect(
      page.locator('tr[data-selected-line="true"]'),
    ).toHaveCount(0);
    await expect(gap(page, 4)).not.toHaveClass(/cell-gap-selected/);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByTestId('line-range')).toHaveText('0–6');
    await expect(rows.nth(0).getByTestId('line-text')).toHaveText(
      '天地玄黄宇宙洪',
    );
  });

  test('修改正文会撤销人工断点与重排结果', async ({ page }) => {
    await page.getByTestId('text-input').fill(SAMPLE);
    await page.getByTestId('width-input').fill('8');
    await page.getByTestId('typeset-button').click();
    await gap(page, 4).click();
    await expect(page.getByTestId('manual-info')).toBeVisible();

    // 修改正文 → 结果与人工断点一并清除。
    await page.getByTestId('text-input').fill(`${SAMPLE}天`);
    await expect(page.getByTestId('layout-result')).toHaveCount(0);

    // 重新生成排样：应回到无人工断点的原排样，无选中态。
    await page.getByTestId('typeset-button').click();
    await expect(page.getByTestId('manual-info')).toHaveCount(0);
    await expect(
      page.locator('tr[data-selected-line="true"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId('line-row').nth(0).getByTestId('line-range')).toHaveText(
      '0–6',
    );
  });

  test('修改行宽会清除人工断点与旧结果', async ({ page }) => {
    await page.getByTestId('text-input').fill(SAMPLE);
    await page.getByTestId('typeset-button').click();
    await gap(page, 4).click();
    await expect(page.getByTestId('manual-info')).toBeVisible();

    await page.getByTestId('width-input').fill('10');
    await expect(page.getByTestId('layout-result')).toHaveCount(0);

    await page.getByTestId('typeset-button').click();
    await expect(page.getByTestId('manual-info')).toHaveCount(0);
    await expect(
      page.locator('tr[data-selected-line="true"]'),
    ).toHaveCount(0);
  });

  test('禁行首间隙给出索引与原因且不展示部分排样（原排样保留）', async ({ page }) => {
    await page.getByTestId('text-input').fill(SAMPLE);
    await page.getByTestId('width-input').fill('8');
    await page.getByTestId('typeset-button').click();
    const rows = page.getByTestId('line-row');
    await expect(rows).toHaveCount(3);

    // 间隙 8 之后是「，」（禁行首）。
    await gap(page, 8).click();

    const failure = page.getByTestId('manual-failure');
    await expect(failure).toBeVisible();
    await expect(failure).toContainText('断点索引 8');
    await expect(failure).toContainText('禁行首');

    // 单一选中态只落在间隙上；无成功重排，故没有行被标为对应行。
    await expect(gap(page, 8)).toHaveClass(/cell-gap-selected/);
    await expect(
      page.locator('tr[data-selected-line="true"]'),
    ).toHaveCount(0);
    // 原排样仍在（并非部分排样）。
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByTestId('line-range')).toHaveText('0–6');
    await expect(page.getByTestId('manual-info')).toHaveCount(0);

    // 再次点击取消选择，错误消失。
    await gap(page, 8).click();
    await expect(failure).toHaveCount(0);
    await expect(gap(page, 8)).not.toHaveClass(/cell-gap-selected/);
  });

  test('正文两端与禁行尾间隙同样被拒绝并指出索引', async ({ page }) => {
    await page.getByTestId('text-input').fill('天地玄黄（宇宙洪荒日月');
    await page.getByTestId('width-input').fill('8');
    await page.getByTestId('typeset-button').click();

    // 间隙 0：正文起始端。
    await gap(page, 0).click();
    const failure = page.getByTestId('manual-failure');
    await expect(failure).toBeVisible();
    await expect(failure).toContainText('断点索引 0');
    await expect(failure).toContainText('正文两端');

    // 改选间隙 5（其后是「宇」，其前是「（」禁行尾）。
    await gap(page, 5).click();
    await expect(failure).toContainText('断点索引 5');
    await expect(failure).toContainText('禁行尾');
    await expect(failure).toContainText('索引 4');
  });
});
