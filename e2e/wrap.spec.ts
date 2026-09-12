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
