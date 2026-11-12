# Test suite audit / 测试价值审计

2026-11-12，基于 606 项开发检查点；此后功能分支新增的测试单独计数。
Based on the 606-test development checkpoint; subsequent feature tests are separate.

## 调整范围 / Changes

删除两个重复的整包测试入口，将其独有断言并入现有标签单元测试：
Two duplicate bundle-level cases were consolidated into existing semantic-tag tests:

| Removed from `reading.test.cjs` | Retained in `semantic-tags.test.cjs` |
| --- | --- |
| `native tag suggestions share stable colors with new values while preserving selection and callbacks` | 建议框与新标签同色、选中样式、点击回调、输入焦点、失焦清理，以及切换到普通属性时去色。 Matching colors, selection, click callback, focus, blur cleanup and non-tag field isolation. |
| `new tag names cannot collide with JavaScript object prototype properties` | `constructor`、`toString`、`__proto__` 仍逐项经过真实 DOM 装饰路径，检查合法颜色。 All three names still pass through the actual DOM decorator. |

没有删除功能分支。`reading` 中原生节点/事件/焦点保留、整包接线及不写 Markdown 的集成测试继续保留。
No behavior branch was removed. Bundle integration, native node/event/focus preservation and no-automatic-Markdown-write checks remain.

- `reading.test.cjs`：整份 `main.js` 只读取、解析为 `vm.Script` 一次；每个 fixture 仍创建独立 VM、module、DOM 和插件实例。
- `idea-header.test.cjs`：每个 TS 依赖只转译、编译一次；仅缓存不可变脚本，不缓存 fixture 的 exports 或状态。
- No persistent build cache was added: reused bytecode is local to one test process, so later runs cannot reuse stale source.
- 未修改侧栏、页面树、归档测试；未修改插件源码或样式。 No sidebar/tree/archive tests or plugin source/styles were changed by this audit.

## 保留依据 / Coverage retained

数据写入、撤销/重做、跨标签页历史、并发保存、失败恢复、文件冲突、恶意路径/链接、移动端输入法/触摸/弹窗和卸载恢复等测试不因数量多而合并删除。
Mutation, undo/redo, cross-tab history, concurrent persistence, recovery, file conflicts, unsafe paths/links, mobile IME/touch/popovers and unload restoration remain intact.

财务计算的纯函数测试与实际查询/显示集成测试检查不同边界，不能相互替代。审查范围内没有找到可安全删除的“只搜索源码字符串就判断功能正确”的独立测试。CSS 计算值检查仍保留，但不把 JSDOM 的样式断言当作真实手机排版证明。
Finance model tests and query/render integration cover different boundaries. No standalone source-string-only correctness check was identified for safe removal in the audited files. Computed-style checks remain, without treating JSDOM as proof of physical-phone layout.

## 执行方式 / Running tests

```sh
npm run build             # Refresh main.js for bundle integration tests.
npm test                  # Every *.test.cjs, including newly added files.
npm test -- mobile        # Focused mobile-related regressions.
npm test -- finance history
npm test -- idea-header   # One test file, by basename or tests/...test.cjs.
npm test -- --list        # List selected files without running them.
npm run test:verbose      # Full per-test output.
```

可选领域：`appearance`、`tables`、`history`、`mobile`、`finance`、`home`、`data`、`sidebar`、`archive`、`packaging`。多个领域取去重并集；未知名称直接以状态码 2 退出，避免拼错名称后误以为验证成功。局部运行明确显示“非全量验证”。
Areas combine as a deduplicated union. Unknown selections exit with code 2. Focused runs are explicitly labelled as partial validation. With no selection, discovery remains exhaustive; `npm test` does not silently become a smoke suite.

摘要只省略通过项的逐条日志；失败名称、位置、错误详情、测试自身输出，以及失败/跳过/取消数量仍保留。子测试进程的非零状态码原样传递。
The summary hides individual successes, while retaining failure details, test output and failed/skipped/cancelled counts. Nonzero child exit codes are propagated.

## 证据与限制 / Evidence and limits

同机、相同 TAP reporter，对 `reading`、`idea-header`、`semantic-tags` 三个文件的前后样本；后测两次保留运行波动：
Same-machine samples using the same TAP reporter for those three files; two after-runs retain the observed variation:

| | Before | After |
| --- | ---: | ---: |
| Cases | 71 | 69 |
| Passed / skipped | 71 / 0 | 69 / 0 |
| Wall time | 2.744 s | 1.371–2.042 s |
| TAP output | 18,239 bytes | 17,810–17,814 bytes |

这不是稳定性能基准，也不是全量测试结果。实际运行时收益来自减少重复编译和选择相关领域；默认摘要主要减少日志阅读与 token 消耗，并不减少执行覆盖。完整测试由功能合并后的统一验证负责。
This is neither a stable benchmark nor a full-suite result. Bytecode reuse and focused selection reduce runtime; the summary primarily reduces log-reading/token cost without reducing default execution coverage. Full validation follows feature integration.

已验证运行器的全量文件发现、领域并集去重、无效参数退出；另用临时 pass/fail/skip 样例确认失败状态码 1、断言详情及跳过计数均保留。临时样例不加入产品测试数量。
Runner checks verified exhaustive discovery, union deduplication and invalid-selection rejection. A temporary pass/fail/skip fixture confirmed exit code 1, assertion details and skip reporting; it is not counted as a product regression test.
