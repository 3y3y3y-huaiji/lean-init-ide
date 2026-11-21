**何时读我**：需要理解「为什么当前系统这样设计」或准备替换底层分发、缓存、CI 与运行时架构方案前阅读。
**单一事实来源**：架构约束总图见 [AGENTS.md](../AGENTS.md)，具体配置以 `config/`、`.github/workflows/` 为准。
**维护边界**：每条 ADR 只用三句话写清「决定 / 原因 / 禁止回退的替代方案」；新增重大决策追加编号，不随意删除旧 ADR。

# 架构决策记录（ADR）

## ADR-01：浏览器侧绝不直接请求 GitHub Release {#adr-01}

- **决定**：前端、Service Worker 与 browser-facing 文档只允许通过同源 `/cdn/` 网关或魔搭镜像拉取运行时资产，GitHub Release 仅服务构建期（`pnpm run fetch:assets`）与版本归档。
- **原因**：GitHub Release 的下载 302 重定向链不返回 CORS 响应头，在站点强制开启的 `COOP + COEP (require-corp)` 跨源隔离下必然被浏览器拦截。
- **禁止回退的方案**：禁止在前端源选择器、`sw.ts` 回退链或 CSP `connect-src` 中恢复 `github` / `raw.githubusercontent.com` 浏览器直连路径。

## ADR-02：魔搭镜像统一采用扁平目录结构 {#adr-02}

- **决定**：ModelScope 数据集镜像（[scripts/upload-modelscope.mjs](../scripts/upload-modelscope.mjs) 与 [src/asset-sources.mjs](../src/asset-sources.mjs)）对基础资产与扩展包统一使用 `<prefix>/<asset.name>` 扁平布局，而非 R2 的子目录树。
- **原因**：魔搭数据集仓库以单一路径拉取为主，`src/asset-sources.mjs` 的 `addMirror` 基于 `${prefix}/${asset.name}` 构造直链；混入 `extensions/<id>/` 子目录会导致上传与下载路径错位 404。
- **禁止回退的方案**：禁止上传脚本按 `asset.key` 原样落盘到带多级 `extensions/<id>/` 的魔搭子目录而前端仍拼扁平 URL。

## ADR-03：wasm64 打补丁后必须使用同源源码自洽构建 `.olean` {#adr-03}

- **决定**：只要 [scripts/patches/](../scripts/patches/) 对 `.lean` 内核或策略源码做了签名/导出改动（如 `WHNF.lean`、`Simp/Main.lean`），就必须用同一份打过补丁的源码（保持相同 `LEAN_GITHASH` 与 `USE_GMP=ON`）自洽编译 `.olean`。
- **原因**：实测已证明如 `simpLoop.visitPreContinue` 等参数签名变更后，混用官方未打补丁 `.olean` 会触发链接符号或运行时结构错位。
- **禁止回退的方案**：禁止为了省去编译步骤而用 `continue-on-error: true` 掩盖 `lake exe cache get` 等失败后把未打补丁 `.olean` 直接塞进扩展包。

## ADR-04：用自动刷新 + 新鲜度校验替代 GitHub `strict: true` {#adr-04}

- **决定**：`main` 分支保护保持 `strict: false`，同时通过 [ci-refresh-open-prs.yml](../.github/workflows/ci-refresh-open-prs.yml) 在 CI/门禁升级时自动把 `main` 合入所有同仓在途 PR 并重跑新版 CI，并由 [ci.yml](../.github/workflows/ci.yml) 内置门禁新鲜度硬校验拦截未同步提交。
- **原因**：高频并发开发下 `strict: true` 会让毫不相关的 PR 连环重跑 10 分钟 E2E；而纯靠 `strict: false` 又无法阻止旧 PR 带着过时门禁的绿灯合入。
- **禁止回退的方案**：禁止在关闭 `strict: true` 的同时移除 `ci-refresh-open-prs.yml` 或 `changes` 内的最新门禁祖先检查。

## ADR-05：所有逻辑文件受 `max-lines` 与 Vitest 覆盖率白名单约束 {#adr-05}

- **决定**：业务、视图、运行时逻辑文件一律保持模块化上限受控并纳入 `vitest.config.ts` 覆盖率统计；`coverage.exclude` 仅允许保留无法单测的纯入口/工具配置白名单，不能成为规避测试的垃圾桶。
- **原因**：千行级大文件（如未拆解前的装配组件）一旦被长期排除出覆盖率，后续 AI 改动极易把核心内存/状态逻辑堆进免检区，导致无测试保护的回归。
- **禁止回退的方案**：禁止通过放宽或扩大 `vitest.config.ts` 的 `coverage.exclude` 来让覆盖率阈值过关。
