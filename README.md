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
tests/wrap.test.ts  Vitest：断点选择与不变式
e2e/wrap.spec.ts    Playwright：输入到排样全流程
Dockerfile          web 镜像（构建 + nginx）
Dockerfile.verify   验收镜像（Playwright 官方镜像）
docker-compose.yml  web 与 verify 编排，WEB_PORT 可覆盖宿主端口
```
