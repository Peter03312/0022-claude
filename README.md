# 铅字校样折行器

纯前端折行工具：按铅字排版禁则（禁行首／禁行尾）将正文折入固定字格的行，
帮助校样员判断正文是否需要重排。React + TypeScript + Vite 实现，无后端依赖。

## 规则

- 正文 1–200 字；每行 8–20 字格；每个字符恰占一格。
- 仅接受常用汉字（U+4E00–U+9FFF）及 `，。！？、；：“”（）《》`；
  空白、拉丁字母、数字及其他字符一律按索引标出并阻止排样。
- 禁行首：`，。！？、；：）》”`；禁行尾：`（《“`。
- 折行算法（确定性，输出唯一）：从尚未排入的首字符开始，在不超过行宽的
  候选前缀中取最长者——其末字符不得属禁行尾，且若仍有余文，下一字符不得
  属禁行首；最长候选不合法则逐字符向前寻找；找不到任何候选时整段失败，
  不输出部分排样。
- 每行展示：起止索引（自 0 计）、实际字数、行文（字格可视化）、断点后
  移入下一行的字符、触发的禁则；输入一经修改，旧排样立即撤销。

## 人工断点

- 排样生成后，校样员可在相邻字格之间的间隙上点击，指定一个字符间隙索引
  k（切在 chars[k] 之前）作为人工断点，再按原字格宽度重新排样。
- 折行核心 `layoutText(text, width, k?)` 接收可选断点：正文切成 [0,k)、
  [k,n) 两个连续区段，分别复用既有最长合法前缀算法；两段都完整排出才返回
  结果，交界行按「人工断点」标注（前段恰好占满一整行时仍记「行满」）。
- 界面以单一选中态标出断点间隙及其对应行（前段最后一行）；再次点击该
  间隙取消选择并恢复原排样；正文或行宽变化时清除选择与旧结果，避免
  索引漂移。
- 以下断点非法，页面指出该索引与具体原因，且不展示部分排样：
  - 位于正文两端（k ≤ 0 或 k ≥ 正文长度）；
  - 把禁行首字符留在后段开头；
  - 把禁行尾字符留在前段末尾；
  - 前段或后段无可行断点。
- 不传第三参数时，`layoutText` 的输入、输出结构与确定性行为保持不变。

## 运行（Docker Compose）

```bash
docker compose up --build web          # 默认 http://localhost:8080
WEB_PORT=9000 docker compose up web    # 覆盖宿主端口
```

## 一次性验收（verify 服务）

```bash
docker compose run --rm verify
# 或
docker compose up --build --exit-code-from verify --abort-on-container-exit verify
```

`verify` 等待 `web` 健康后，依次执行 `tsc --noEmit`、`vitest run`（断点逻辑）
与 `playwright test`（输入到排样的端到端流程，指向 `http://web:80`），
完成后退出，退出码即验收结果。

## 本地开发

```bash
npm install
npm run dev          # 开发服务器
npm run test         # Vitest 单元测试
npm run test:e2e     # Playwright（自动构建并启动 preview）
npm run verify       # 类型检查 + 全部测试
```

## 目录

```
src/lib/wrap.ts     折行与校验核心（纯函数）
src/App.tsx         界面：输入、校验提示、排样表
tests/wrap.test.ts  Vitest：自然/人工断点选择与不变式
e2e/wrap.spec.ts    Playwright：输入到排样、人工断点重排与取消全流程
Dockerfile          web 镜像（构建 + nginx）
Dockerfile.verify   验收镜像（Playwright 官方镜像）
docker-compose.yml  web 与 verify 编排，WEB_PORT 可覆盖宿主端口
```
