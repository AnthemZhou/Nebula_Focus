# iPhone 测试与发布 / iPhone testing and release

## 中文

### 1.1.2 更新准备（2026-11-04）

当前源码为 1.1.2 发布候选：本地严格构建与 **308/308** 自动测试通过，同版本官方 ESLint 规则的本地比较从 1,570 项降至 **38 项警告、0 项错误**。本版加强原生结构边界校验并清理样式；保留项见[检查说明](review-warnings.md)。GitHub 发布与官方扫描尚待核对。

这次尚无新增 iPhone 全流程实测结果，不能把类型检查或桌面结果写成手机通过。下方的直接触摸和镜像证据属于 1.1.0 / 1.1.1 及其候选构建。测试继续复用 **Nebula-Focus-iPhone**，原处升级文件、保留数据；没有新建测试库。

### 1.1.1 发布与目录记录（2026-11-04）

1.1.0 的真机对齐检查完成后，已发布到 GitHub 并提交官方目录。2026-11-04 的失败通知明确对应 **1.1.0**：其唯一 Error 是简介不能包含目录语境中重复的“Obsidian”字样。**1.1.1** 已删除该字样并发布到 GitHub，最新复检不再出现这一 Error。两版 `main.js` 与 `styles.css` 逐字节相同，GitHub CI 的构建与 295 项测试通过。唯一测试库已原处更新。

官方条目：[Nebula Focus](https://community.obsidian.md/plugins/nebula-focus)。最新管理页面显示 1.1.1（提交 `9ce1bab`）的扫描为 **Completed**，无 Error；构建复现通过，生成的 `main.js` 与发布附件逐字节相同。公开页面曾显示版本 **1.1.1** 和 **Add to Obsidian** 安装入口。目录最终发布状态仍在核对；扫描 Completed 与出现安装入口不能单独证明已上架。重新打开 macOS 客户端插件市场后搜索 Nebula Focus，结果仍为 0；手机从插件库安装尚未确认，搜索不可用的原因尚未确定。原生内部类型适配与 CSS 检查仍有 Warning，发布附件溯源与附加 ZIP 仍有 Recommendation；这不是零警告结果。


2026-11-04 最终真机镜像检查：同一 iCloud 库更名为 `Nebula-Focus-iPhone` 并重载更新后，单行标题与页面图标在首行触摸区域内居中；点击进入原位编辑后文字高度不跳变，紫色选中轮廓完整。长标题仍自然换行，多标签扩高的行保留顶部对齐。库列表只保留一个测试库；桌面也移除了旧 R9 的入口。13 篇原始虚构 Markdown 完整内容逐字节未变。

### 1.1.0 发布前验证记录（2026-11-04）

本节记录发布前的检查结果：当时 1.1.0 正在准备发布，最低 Obsidian **1.14.5**，已允许移动端加载；构建与 **295/295** 自动测试通过。iPhone 核心流程已有用户直接确认，包括标签字号一致及「新建→加标签→撤销两次→重做两次」正常。手机隐藏撤销/重做额外行已通过 R10 真机镜像检查。

最新的单行标题垂直偏移已修复：原先 32px 链接文字在 44px 点击行内贴顶，现用基于 `1lh` 的平衡内边距居中。本次真机镜像中的显示与原位编辑视觉检查通过。

iCloud 当前只保留 **Nebula-Focus-iPhone** 一个测试库（原 R10），后续原处更新插件文件。9 个旧测试库的数据已保留归档到本地忽略的 `dist`，不再每次创建新的编号库。

此检查时点尚未提交官方目录；用户已确认同意开发者政策和持续维护承诺。当前 1.1.1 扫描记录及尚未确认的目录发布状态见本文顶部。Android、iPad、第三方主题及未测生命周期边界继续明确披露，不把所有历史待测场景作为当前发布阻断。下方 R2–R10 记录保留各轮当时的结果与决定；它们不是当前发布状态。镜像观察、直接触摸和自动测试仍分别记录，不互相替代。

### 历史记录：R2 起始测试（2026-11-01 至 2026-11-04）

- 设备：iPhone 16 Pro Max；Obsidian 1.14.5（387）。User-Agent 显示 iOS 18.7，尚未在系统设置中核对完整补丁版本。
- 测试方式：Mac 的 iPhone 镜像连接真实手机；用户另在手机上直接操作输入、标签、横滑和横屏等手势。镜像观察与用户手指操作分别记录，不能互相代替。
- 测试库：iCloud 中的独立虚构库 `Nebula-Focus-iPhone-R2`，已确认加载对应运行时与样式。旧测试库的 iCloud 文件更新未即时反映，后续验收改用全新 R2 库。
- R2 的 `main.js` SHA-256：`1c76f9cebf45113a3098aa3a271f976493948df0330f752b6faac8a095717960`；ZIP SHA-256：`14503e9b99cbd445dfe7da24c4a6db35327260859985465e7c016e8c085c84bf`。
- 已修复手机原生新建未设置 `newlyCreatedFile`，导致创建操作漏记撤销历史的问题；相关构建和 219 项自动测试通过。R2 真机的新建、撤销与重做复测结果见下表。

R2 阶段用户验收曾报告以下问题：标签可以操作，但长按等待软键盘过久，向右拖动时不弹出键盘；用户找不到撤销、重做入口；手机字号偏小，标签排版需要调整。镜像中按钮可见、操作成功，只证明该入口能执行，不代表入口易于发现。当时标签拖动排序、软键盘交互及组合撤销均未完成验收；组合撤销后来在 R9 获用户直接确认，见 R9 记录。正式元数据仍为 1.0.0 桌面版。

2026-11-02 的后续修复已通过构建与 225 项自动测试：撤销/重做增加可见文字并靠左排列；手机数据库与标签面板跟随正文字号，最低 16px；轻点标签只打开面板，直接点搜索/新增输入才唤起键盘，选项与拖排不再异步抢焦点。标签排版的具体反馈仍待确认，以上修复尚未完成新一轮真机验收。测试后的 13 个原始示例 Markdown 正文与打包前一致。

2026-11-03 已在同一台 iPhone 上载入全新独立库 `Nebula-Focus-iPhone-R4`。镜像确认表格工具栏出现「撤销」「重做」文字按钮，数据库字号放大，点击标签可打开面板。随后用户直接验收仍未通过：单元格标签纵向位置与横向间距、面板纵向间距和删除图标需要调整，拖排需要浮起/移动反馈；新建后不能撤销；新建按钮没有紧跟末行。镜像确认当前 8 条记录、撤销/重做按钮灰显，以及末行与新建按钮之间的留白。搜索框键盘和组合撤销流程未获得通过结论。镜像点击选项出现了点击穿透，不能将该操作算作通过。

R4 的 13 个原始示例 Markdown 正文仍与打包前一致；用户新建的两条测试笔记已保留。当时有三个不同标签页打开同一个独立 Base，需区分历史归属与后台视图卸载的问题。新建按钮留白来自原生手机表格的底部工具栏预留间距；后续 R5 已将该间距移至新增按钮之后。完整修复并复测前不发布。

R4 构建标识：`main.js` SHA-256 为 `fd467c9deadf035384c5273fd45aa775da13f01efc5a461eb1d2bc6c649231c2`，`styles.css` 为 `7a45ae73b876c5328b1adf53c275ca226e39d74aaa3a8bcd27b35a318d954535`，测试库 ZIP 为 `0ec4f9c109d8d1b0951265e5cb772c3443ab30715cd718a4407b389266c6930a`。

### R5 修复与真机反馈（2026-11-03）

- 已复现并修复：手机切换标签页后，仍注册在工作区中的源标签页即使暂时没有 DOM，也保留创建历史；真正关闭的标签页不会因旧 DOM 尚未清理而恢复历史。
- 网格末行的新建按钮之前不再保留原生底部工具栏空隙，该空隙改留在按钮之后。
- 移动端标签仅在自定义面板已确认接管的单元格中去掉原生叉号占位；未知结构、只读和其他字段保留原生控件。实际原生 CSS 隔离测量中，标签可见横向间距从约 20px 收紧到 6px，面板选项行高从 48px 降到 40px；16/20/24px 字号保留，桌面布局未改变。
- 面板删除叉号视觉缩至 12px、降低对比度；拖排增加浮层跟手、其他标签让位和落位动画。取消、关闭和减少动态效果设置均有回归检查。
- 构建及 **234/234** 自动测试通过。全新 `Nebula-Focus-iPhone-R5` 已在真机载入。镜像确认新建按钮紧跟末行，撤销/重做文字按钮可见。
- 已复现跨标签页问题：新建打开笔记后，从左侧文件列表再次打开表格，另一个同名标签页的撤销按钮灰显；返回原标签页可撤销，记录数 7→6。用户确认平时正是通过侧栏返回。该结果证明 R5 保留了源页历史，但没有解决跨标签页撤销。
- 用户后续触摸反馈要求：选中标签后去掉叉号，改为再次点击下面带勾的选项取消；整行均可拖排；表格与 Home 前进/返回时不要明显逐段渲染。未据此判定外观或拖排验收通过。

R5 `main.js` SHA-256：`e6abbd970b0ad7ad4de49fd3f92cd2ea9e8f449a35f5c002824861b27f957a88`；`styles.css`：`3345fa6ac997b1fd74edefac4c39c1f800323e336c6551765438b93df9fdf10e`；ZIP：`af33b4d05024de43b206caf2bb482538b0bc556706156749de9a27781efd3996`。

### R6 修复与真机反馈（2026-11-03 至 2026-11-04）

- 手机同一真实外部 `.base` 的同名、同类型视图，在独立标签页与 Home 嵌入页之间共享按操作顺序排列的历史。共享队列、原生事务栈替换、占位视图就绪和异步操作期间源页关闭均有回归；桌面、内联 Base 和不同数据库/视图保持隔离。
- 已选标签不再显示叉号；点击带勾的候选可取消选择。整行按住约 180 ms 后可以拖排，快速划动仍滚动列表，六点手柄仍可直接拖动。浮起、让位和落位反馈保留，尚待真实触摸验证。
- 表格首批数据到达时同步完成行高和装饰；导航发现提前至微任务。仍加载中的看板暂时离开 DOM 时保留原卡片，相同数据通知不重复重建，以减少可见跳动；不宣称已消除原生 Markdown 的全部分块加载。
- 构建与 **259/259** 自动测试通过。全新 `Nebula-Focus-iPhone-R6` 已在手机打开，启用本次构建并重载配置，侧栏名称核对一致。正式版本仍为 1.0.0 桌面版，没有发布手机版本或提交官方目录。
- iPhone 镜像复测表格通过：6 条记录→末行新建，笔记打开新标签页→Escape 后从侧栏再次打开表格，7 条记录且当前页撤销可用→撤销回 6→重做回 7。第三个从侧栏打开的表格标签页也显示撤销可用。
- iPhone 镜像复测 Home 嵌入看板通过：3 张卡片→分组加号新建，笔记打开新标签页→Escape 后从侧栏返回 Home，4 张卡片且当前页撤销可用→撤销回 3→重做回 4。两个流程均无成功提示。
- 镜像中的标签点击和标题输入仍不可靠：空标签面板点击后关闭但值未变，标题粘贴也未形成可确认修改，因此未计为属性编辑或组合撤销通过。
- 13 个原始示例 Markdown 正文与打包前一致；新建的虚构测试笔记 `Ideas/未命名.md`、`Projects/未命名.md` 已保留。
- 11 月 4 日用户直接触摸验收仍未通过：标签面板中的选择与表格单元格的刷新明显不同步；长按六点手柄出现不需要的圆形外观；画廊与想法表格往返时，部分行从两行收成一行，仍可见布局更新。用户没有确认「新建→加标签→撤销两次→重做两次」通过。另要求看板列底的新建按钮使用与卡片相同圆角的圆角矩形。

R6 候选 `main.js` SHA-256：`01f77974797c65f5d9884a4c4672b000464023f6d4ebdc3be3a34fde2c9a44cf`；`styles.css`：`72a7357eb2ed8c1245d285f11d20d2f16b95d5dbd59b2a8949509f8fcd0d8b9a`；ZIP：`8ff4f8f511f9df4dc040f3da224c0142a3c112f80924985a76784e658abe5913`。

### R7 修复与真机反馈（2026-11-04）

- 标签面板更新前，先同步原生查询与单元格渲染器的确认状态；新增 12 项标签回归，覆盖较早写入的延迟确认、最近一次保存失败和外部撤销。该修复尚未在手机确认同步效果。
- 行高测量保留原生溢出规则；用不可交互的稳定测量控件计算最小列宽，覆盖首行空值、横向虚拟化和隐藏叉号。首次几何布局等待真实查询视图就绪，减少初始化时的两阶段布局。
- 看板列底新建按钮使用与卡片一致的 9px 圆角；调整六点手柄与拖拽浮层样式，移除多余圆形外观。触摸拖排仍待复测。
- 构建、**273/273** 自动测试及 `git diff --check` 通过。全新 `Nebula-Focus-iPhone-R7` 已在真机载入，库名与 6 行表格已确认；候选包和 iCloud 运行时哈希一致。只读核验时，13 篇原始虚构笔记的正文及完整文件均未改变。正式发布版本与目录提交状态不变。
- 布局验收仍未通过：第 3 行的多标签初次显示为两行，截图纵向范围约为 709–805；后续扫描或从画廊返回后变为三行，范围约为 709–846。该观察记录的是镜像截图坐标，不是 CSS 像素测量。
- 看板列底新建按钮已目测通过：紫色轮廓的圆角矩形与卡片圆角一致。
- 镜像点击标签面板选项时穿透到下方标题，延续之前已发现的镜像输入限制；不能据此认定标签功能在真实触摸下失败或通过，仍待直接手机复测。

R7 候选 `main.js` SHA-256：`fef227e1647a2635a35a2f90ad4960dae1e77b22377161e844b139ffa89124c7`；`styles.css`：`b8b307f8ef5523926fdeb5e5a449cfc59bba91702855f97ea460b0b6a392090c`；ZIP：`62f7114d5a6deab258c6310c91a7ce5a29382e69a97779921ecaca0e85ae5a8f`。

### R8 候选修复，待真机验收（2026-11-04）

- 修正 `idea-widths` 中首帧与后续装饰后的判定差异，使相同标签按一致条件测量最小列宽。隔离构建目录 `dist/r8-source` 仅采用 R7 加该宽度修复，不包含同期开发的页面侧栏，也不改写共享工作区中的其他源码。
- 构建通过，**273/273** 自动测试通过、无跳过。构建模块对比确认：相对 R7，只有 `src/idea-widths.ts` 内容改变；支持模块仅因导入顺序移动，内容不变。`styles.css` 与 R7 逐字节一致。
- 独立测试库 `dist/Nebula-Focus-iPhone-R8` 已打包并复制到 iCloud，三个运行时文件逐字节一致，未覆盖旧测试库。已在真机载入并确认库名。
- 镜像中这次布局复现路径目测通过：首次打开想法表格与从画廊返回时，第 3 行多标签均保持三行，截图纵向范围均为约 709–846；6 行表格底部及新建按钮的位置均保持在约 y=1118。R7 对应位置曾从约 y=1076 变为 y=1118。以上仅是该路径的镜像截图对照，不是整个候选通过验收。
- 已请求用户直接触摸复测标签面板与单元格同步、整行长按拖排及手柄无多余圆形、画廊往返，以及「新建→加标签→撤销两次→重做两次」。用户随后提出进一步界面修改，但未确认上述组合触摸序列通过；完整真机验收与发布条件仍未满足。

R8 候选 SHA-256：`main.js` 为 `6ed873f90d9b8bb3ef7d3d07123db8f52d0a2505f36c12465430f1ae4b2c1c78`；`styles.css` 为 `b8b307f8ef5523926fdeb5e5a449cfc59bba91702855f97ea460b0b6a392090c`；测试 `manifest.json` 为 `144c946f88f2e7fe98eb7f628c8536ad54ed8b014d21e36fdf3aac97ac3e8124`；ZIP 为 `dc1f76862eb7d2c783f967ac1ab263f403bc8902502fbb87c37ead57417ebe6c`。

### R9 桌面双主题验证与手机候选（2026-11-04）

- 当前完整源码（包括既有页面侧栏）通过构建、严格 TypeScript 检查与 **295/295** 自动测试。R9 使用完整当前源码，不再沿用 R8 排除侧栏的隔离构建。正式已发布版本仍为 1.0.0 桌面版。
- 在独立虚构 R9 库的实际桌面 Obsidian **1.14.5** 中检查了浅色与深色主题。原生单元格、面板顶部已选标签及选项标签的计算字号统一为 **13.125px**、字重 **400**，用户原生字号设置未缩小；两种主题的语义标签颜色均可辨认。
- 受管理标签单元格中的原生删除控件（含悬浮状态）为 `display: none`；标题末尾「打开」按钮元素数量为 **0**，前方页面图标保留为导航入口。
- 「这里写想法」列头已使用与标签管理同款的锚定设置小面板，实际打开与 Escape 关闭已验证。本轮界面检查未保存改名；保存、IME、错误重试由自动测试覆盖。
- 看板新建按钮的背景为透明 `rgba(0, 0, 0, 0)`，圆角 **9px** 与卡片一致，轮廓紫色。「项目下一步」「项目摘要」属性名使用 `--text-accent`，浅色主题采样 RGB **138, 92, 245**；截止日期逾期红色仍保留。
- 界面与取消检查后的 **13** 篇原始虚构 Markdown 文件完整内容逐字节未改。
- 已生成 `dist/Nebula-Focus-iPhone-R9`，从原始 ZIP 复制到 iCloud 同名新测试库，没有覆盖旧库。R9 已在 iPhone 加载，镜像确认了库名、六行表格、移除末尾「打开」及新的表头改名面板。镜像点击仍可能触发原生标签菜单或穿透弹窗控件，不能据此判断直接触摸行为。**完整手机验收仍待完成**；桌面双主题结果不等于手机通过，未正式发布或提交官方目录。
- 用户随后在 R9 上直接触摸确认两项通过：标签在单元格与面板中的字号一致；新建→加标签→撤销两次→重做两次正常。这是这两项的实际手机证据，不表示标签刷新同步、拖排、主题或生命周期等其他项目全部通过。用户另要求隐藏手机端撤销/重做入口并保留桌面端，该后续调整的有限检查见 R10。

R9 候选 SHA-256：`main.js` 为 `cc30fc6bd31fc8f0d405d4b8260061bd1d36eca2f6c2b42648f2d4891eb1d5b9`；`styles.css` 为 `331fb166adf66231823d2baaf5af12ff7327b42f57d981b564d2c7e8fd8089a3`；ZIP 为 `a21dc86c014cce104e2dbdf707222c4da1020d0977ae9f444bc4ff9b44b4797a`。

### R10 手机撤销按钮显示检查（2026-11-04）

- 构建与 **295/295** 自动测试通过。手机不创建可见撤销/重做按钮或其额外工具栏行；桌面按钮、快捷键与命令保留。手机内部数据库历史及命令回退仍可用，原生文本撤销不变。
- 已将 `dist/Nebula-Focus-iPhone-R10.zip` 原始包解压到 iCloud 同名新库，没有覆盖旧测试库；实际 iPhone 镜像已确认 R10 库名和加载状态。
- 独立想法表格显示 **6** 个结果，无撤销/重做行，原生工具栏直接位于列头上方。
- Home 嵌入看板显示 **3** 个结果，同样无撤销/重做行，其他卡片及分组触摸菜单仍保留。
- 表格与 Home 观察后，只读逐字节比较确认 iCloud R10 的 **13** 篇原始虚构 Markdown 文件仍与示例源文件完全一致。
- 上述是这次可见控件调整的有限真机镜像检查通过，不等于完整触摸验收。R9 用户直接确认的标签字号一致与组合新建/标签撤销结果保留；其他场景仍按各项证据判断。未正式发布手机版本或提交官方目录。

R10 候选 SHA-256：`main.js` 为 `e7e838dcc333bf9249516445f6c635dee505d5920b0b234b3727d2c92656a0f8`；`styles.css` 为 `6ec6f23416099cb9338c414c6e928b1e5f800c82ac21b5b6056321e76a002c51`；ZIP 为 `6c56a17c7df80dc8ad54409d2f1602ec679c9bfccde90648a61f8b7828841729`。

### 测试分层

| 层级 | 检查内容 | 证据要求 |
| --- | --- | --- |
| 构建与自动化 | 浏览器运行时、状态和撤销顺序、取消手势、弹窗边界与清理 | 构建结果、测试名称及数量 |
| 桌面移动模拟 | 320–430 CSS 像素宽度；横竖屏；表格横滚；标签、标题、图片和看板布局 | 标明桌面模拟，保存截图和复现步骤 |
| iPhone 真机 | 触摸、中文输入法、软键盘、滚动与长按、应用切回、撤销入口 | iPhone 型号、iOS 与 Obsidian 版本、通过/失败结果 |
| 官方目录 | 版本、发布附件、构建验证、代码扫描和披露 | 官方开发者页面的实际审核结果 |

### 逐项实测记录

使用独立示例库；记录实际使用的插件包版本。库内应包含表格、看板、短标题与长标题、多标签记录、本地图片和空条目。

运行 `npm run build` 后，把 `main.js`、`manifest.json`、`styles.css` 更新到现有 `Nebula-Focus-iPhone` 测试库的插件目录，保留测试笔记与插件设置，待 iCloud 同步后重新加载。打包脚本仍可生成仅包含虚构示例的本地测试归档，但不再为每个构建向 iCloud 添加新库。下表按实际证据说明范围；历史未测项不是要求全部完成后才可发布的统一门槛。

| 场景 | 应有结果 | 当前真机状态 |
| --- | --- | --- |
| 启用插件，打开表格、看板与画廊 | 正常呈现；不支持的原生结构保留原生控件 | 镜像确认 R2 加载、表格/看板呈现，画廊 3 张卡、本地封面和点击卡片打开文档正常；未知结构回退未测 |
| 竖屏/横屏与横向滑动表格 | 页面不被撑宽；信息可滚动查看；不误触编辑 | 用户直接操作确认横滑、横屏正常；字号和标签排版另有待修复反馈 |
| 点击标题及右侧空白、中文输入、完成/取消 | 原位编辑；候选输入不误提交；光标和文本完整可见 | 用户直接操作确认连续中文输入、键盘和光标正常；末尾空白、取消与组合输入边界未全部复测 |
| 标签选择、增加、移除、排序与取消触摸 | 面板与单元格同步；滚动和取消不误改数据 | R6 直接触摸未通过；R7 镜像点击穿透，不能替代真实触摸判断，需手机复测同步与整行拖排 |
| 键盘弹出/收起时使用标签面板 | 面板留在可视区域；控件可滚动到达 | 未通过：用户反馈长按等待过久、向右拖动不弹键盘；仍需修复并复测 |
| 看板菜单修改分组 | 可移动卡片；不依赖鼠标悬浮或桌面拖放 | 用户确认卡片移至「发布 / 运营中」正常；镜像确认该状态变更撤销/重做恢复分组人数 2↔1 |
| 点击缩略图、关闭图片预览 | 可查看图片；列表行高不被图片撑大 | 用户确认放大和关闭正常；行高边界未单独测量 |
| 看板分组加号新建后撤销、重做 | 正确记录创建；侧栏返回后也能撤销，不弹成功提示 | R6 镜像确认新建后侧栏返回另一个 Home 标签页，3→4→3→4，无成功提示 |
| 表格末行新建后撤销、重做 | 新建位于末行；侧栏返回后也能恢复与移除 | R6 镜像确认新建后侧栏返回另一个表格标签页，6→7→6→7，无成功提示 |
| 手机撤销、重做入口 | 容易发现并可直接点击 | R6 镜像确认文字按钮可见，侧栏打开的第二、第三个表格标签页继承可用撤销 |
| 浅色/深色外观 | 卡片、标签与控件可辨认 | R9 用户直接确认标签字号一致；双主题桌面检查通过，手机完整主题/布局验收仍未判定通过 |
| 新建→改属性→撤销两次→重做两次 | 操作顺序正确；恢复后的属性指向恢复文件 | R9 用户直接触摸确认新建→加标签→撤销两次→重做两次正常；这是该组合序列的通过记录 |
| 滚动卸载/重建、前进/返回 | 历史按所属数据库范围保留，布局不明显跳动 | R8 镜像首开与画廊返回的第 3 行均为三行、表格底部位置一致；此复现路径目测通过，直接触摸观感仍待用户确认 |
| 看板列底新建按钮 | 圆角矩形与卡片圆角一致 | R7 真机镜像目测通过，紫色轮廓与卡片圆角一致 |
| 切换应用、锁屏再返回 | 界面可继续使用；若进程重启，历史按会话规则清空 | 待验证 |
| 关闭/重新启用插件 | 恢复原生呈现，不留下重复控件或监听器 | 待验证 |

测试结束后比较笔记与 `.base` 的差异。纯展示不应写入 Markdown 正文；明确编辑的数据、视图配置变化与测试中新建/撤销的文件要分别核对。数据库撤销的既有边界见 [undo-coverage.md](undo-coverage.md)。

### 上架与后续更新

1.1.1 已发布到 GitHub；官方扫描记录、尚未确认的目录发布状态，以及客户端搜索和手机商店安装的验证状态见本文顶部。核心手机流程的通过结果和剩余覆盖限制已分别记录。最新标题对齐已通过真机镜像视觉检查；开发者政策与持续维护承诺已获用户确认并随首次提交完成。`manifest.json`、`package.json`、`versions.json` 和 Release tag 保持一致；正式 Release 附 `main.js`、`manifest.json` 和 `styles.css`。仅推送源码不构成可安装更新。首次提交使用 Obsidian Community 开发者页面，处理实际自动审核结果；尚未完成的测试不能写成已通过。[官方提交流程](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)

首次上架后，后续版本不需要重复填写初次提交表单，但每个新版本仍会接受自动扫描。官方周期性检查 GitHub Releases，开发者页面也可执行 **Check for new releases**；上传源码本身不会成为安装包。用户通过 Obsidian 的“检查更新”安装，插件自身不下载或替换代码。[官方 FAQ](https://docs.obsidian.md/community-directory/faq)

官方说明自动审核通常为几分钟，通过后可在 24 小时内搜索和下载。这是目录流程说明，不是每次更新固定等待时长的承诺；扫描和目录同步仍要实际确认。1.1.2 当前发布状态见本文顶部。[官方更新机制说明](https://obsidian.md/blog/future-of-plugins/) · [检查说明](review-warnings.md)

## English

### 1.1.2 update preparation (2026-11-04)

The source is a 1.1.2 release candidate. The local strict build and **308/308** automated tests pass; a comparison with the same official ESLint rule version reduces 1,570 findings to **38 warnings and zero errors**. This version strengthens native-structure boundaries and cleans up styles; retained findings are documented in the [review guide](review-warnings.md). GitHub publication and the official scan remain to be checked.

There is no new full iPhone-device result for this version. Type checks and desktop results must not be reported as a phone pass. The direct-touch and Mirroring evidence below belongs to 1.1.0 / 1.1.1 and their candidate builds. Continue updating **Nebula-Focus-iPhone** in place, preserving its data; no new test vault was created.

### 1.1.1 release and directory record (2026-11-04)

After the final actual-iPhone alignment check, version 1.1.0 was published on GitHub and submitted to the directory. The failure notification dated 2026-11-04 explicitly refers to **1.1.0**: its only Error was the redundant word “Obsidian” in the directory description. Version **1.1.1** removes that word and is published on GitHub; its latest scan no longer reports that Error. Both versions have byte-identical `main.js` and `styles.css`; GitHub CI build and all 295 tests pass. The single persistent test vault was updated in place.

[Official listing](https://community.obsidian.md/plugins/nebula-focus): the latest management page shows the scan for **1.1.1** (commit `9ce1bab`) as **Completed** with no Errors. Build reproduction passed: the generated `main.js` matches the release asset byte for byte. The public page was observed showing version **1.1.1** and an **Add to Obsidian** installation entry. Final directory publication status remains under verification; a completed scan and a visible installation entry alone do not confirm marketplace availability. After reopening the macOS community browser, searching for Nebula Focus still returned zero results. Phone marketplace installation remains unverified, and the cause of search unavailability has not been established. Native internal-type adapter and CSS findings remain Warnings; artifact attestations and extra ZIP attachments remain Recommendations. This is not a zero-warning result.


Final actual-iPhone Mirroring check, 2026-11-04: after reloading the same iCloud vault renamed `Nebula-Focus-iPhone`, single-line titles and page icons are centered within the first-line touch target. Entering inline edit preserves text position and the complete selection outline. Long titles still wrap naturally; tag-expanded rows remain top-aligned. The vault list contains one test vault, and the old desktop R9 entry was removed. All 13 original fictional Markdown files are byte-for-byte unchanged.

### 1.1.0 pre-release verification record (2026-11-04)

At this pre-release checkpoint, version 1.1.0 was in release preparation, with Obsidian **1.14.5** as its minimum and mobile loading enabled. The build and **295/295** automated tests pass. Core iPhone workflows have direct user confirmation, including consistent tag font sizes and creation → tag edit → two undos → two redos. R10's removal of the extra phone history row passed scoped actual-device Mirroring checks.

The latest single-line title alignment fix is implemented: the 32px link text previously sat at the top of a 44px touch row; balanced padding based on `1lh` centers it vertically. Actual-phone display and inline-edit visual checks passed through Mirroring.

Only **Nebula-Focus-iPhone** remains as the persistent iCloud test vault (formerly R10). Future builds update its plugin files in place. Nine older iCloud test vaults were archived locally under ignored `dist` storage with their data retained; no new numbered iCloud vault is created for each build.

At this checkpoint, the directory submission had not yet been sent; the user had confirmed the developer-policy agreement and ongoing-maintenance commitment. The 1.1.1 scan observations and unconfirmed publication status are recorded at the top of this document. Android, iPad, third-party themes and untested lifecycle boundaries remain disclosed coverage limits, not a collective new release-blocking checklist. R2–R10 entries below preserve each round's historical observations and decisions rather than the current release status. Mirroring, direct touch and automated results remain separate evidence levels.

### Historical record: initial R2 testing (2026-11-01 to 2026-11-04)

- Device: iPhone 16 Pro Max with Obsidian 1.14.5 (387). The User-Agent reports iOS 18.7; the full patch version has not been checked in Settings.
- Method: Mac iPhone Mirroring connected to the physical phone, supplemented by the user's direct touch tests. Mirroring observations and finger-operated tests are recorded separately.
- Vault: the fictional iCloud vault `Nebula-Focus-iPhone-R2`, with its runtime and styles confirmed loaded. Updates in the previous iCloud test vault did not take effect immediately, so subsequent checks used a fresh R2 vault.
- R2 `main.js` SHA-256: `1c76f9cebf45113a3098aa3a271f976493948df0330f752b6faac8a095717960`. ZIP SHA-256: `14503e9b99cbd445dfe7da24c4a6db35327260859985465e7c016e8c085c84bf`.
- Fixed a mobile creation path that did not set `newlyCreatedFile`, leaving new notes out of undo history. The build and 219 automated tests passed; R2 device retests are recorded below.

The R2 user run reported slow keyboard access after a long press, no keyboard when dragging right, hard-to-find undo/redo controls, small text and tag layout problems. Seeing and operating buttons through Mirroring does not establish that users can discover them. At that stage tag reordering, keyboard interaction and combined undo remained unaccepted; combined undo was later confirmed directly in R9, as recorded below. Public metadata stays at desktop version 1.0.0.

The 2026-11-02 follow-up passes the build and 225 automated tests. Undo/redo have visible labels aligned left. Mobile database and tag-panel text follows the body size with a 16px minimum. Tapping a tag opens its panel; tapping the search/add input invokes the keyboard, while selection and reordering no longer asynchronously steal focus. The specific tag-layout feedback still needs clarification, and these fixes await another device run. The bodies of all 13 original fictional Markdown fixtures remain unchanged after testing.

On 2026-11-03, the same iPhone loaded the fresh, separate `Nebula-Focus-iPhone-R4` vault. Mirroring confirmed visible Undo/Redo text buttons, larger database text and a tag panel that opens on tap. The user's subsequent direct-touch acceptance failed: cell tag alignment/spacing, popup density and remove icons need refinement; reordering needs lift/movement feedback; creation could not be undone; and the New footer was separated from the last record. Mirroring confirmed eight records, disabled history controls and the footer gap. Keyboard access and the combined undo sequence have no passing verdict. A mirrored option click passed through to the underlying page, so it is not counted as a passing selection test.

All 13 original R4 Markdown bodies still match the packaged fixtures; the user's two new test notes are preserved. At that point, three tabs opened the same standalone Base, requiring separate checks of history ownership and background DOM disconnection. The footer gap came from native phone table clearance for the bottom toolbar; R5 subsequently moved it after the New action. Release remains blocked on complete fixes and retesting.

R4 build identifiers: `main.js` SHA-256 `fd467c9deadf035384c5273fd45aa775da13f01efc5a461eb1d2bc6c649231c2`; `styles.css` `7a45ae73b876c5328b1adf53c275ca226e39d74aaa3a8bcd27b35a318d954535`; test-vault ZIP `0ec4f9c109d8d1b0951265e5cb772c3443ab30715cd718a4407b389266c6930a`.

### R5 fixes and device feedback (2026-11-03)

- Reproduced and fixed history loss when an open phone tab loses its DOM connection. Workspace membership now keeps that session alive; a closed tab cannot revive history through leftover DOM.
- Moved native bottom-toolbar clearance after the grid's New action so it follows the last record.
- Removed native delete-control spacing only in cells actually supported by the custom picker. Unknown/read-only cells keep native controls. Isolated measurements with native CSS show visible tag gaps reduced from about 20px to 6px and option rows from 48px to 40px. Mobile text sizes of 16/20/24px are retained; desktop layout is unchanged.
- Reduced popup remove icons to 12px with lower contrast. Dragging now lifts a visual overlay, animates peers and lands before saving. Cancellation, teardown and reduced-motion behavior have regression coverage.
- The build and **234/234** automated tests passed, and the fresh `Nebula-Focus-iPhone-R5` vault was loaded on the phone. Mirroring confirmed the New footer immediately follows the last row and labeled history controls are visible.
- Reproduced the cross-tab failure: after creation opened a note, reopening the Base from the file sidebar produced another tab with disabled undo. The original tab could undo, taking the count from seven to six. The user confirmed this sidebar route is their normal workflow. R5 retained source-tab history but did not solve cross-tab undo.
- The subsequent touch review requested removing the X from selected tags and deselecting through checked options, dragging from the whole row, and less visible progressive rendering on both table and Home Back/Forward navigation. This was not a visual or drag acceptance.

R5 `main.js` SHA-256: `e6abbd970b0ad7ad4de49fd3f92cd2ea9e8f449a35f5c002824861b27f957a88`; `styles.css`: `3345fa6ac997b1fd74edefac4c39c1f800323e336c6551765438b93df9fdf10e`; ZIP: `af33b4d05024de43b206caf2bb482538b0bc556706156749de9a27781efd3996`.

### R6 fixes and device feedback (2026-11-03 to 2026-11-04)

- Phone views for the same real external `.base`, matched by name and type, share chronological history across standalone tabs and Home embeds. Regression tests cover the shared queue, native stack replacement, placeholder promotion and source closure during asynchronous work. Desktop, inline Bases and different databases/views remain isolated.
- Selected tags have no X; clicking a checked option deselects it. A whole-row touch hold of about 180 ms starts reordering, quick swipes retain native list scrolling, and the grip remains immediate. Lift, peer movement and landing feedback remain; direct-touch validation is pending.
- First-data table geometry and decoration finish synchronously, navigation discovery runs in a microtask, live temporarily detached boards retain their cards, and unchanged data notifications avoid rebuilding them. These changes target visible layout shifts; they do not establish that all native Markdown chunk loading is eliminated.
- The build and **259/259** automated tests pass. The fresh `Nebula-Focus-iPhone-R6` vault was opened on the phone, this build enabled and configuration reloaded, with the sidebar vault name confirmed. Public metadata remains desktop 1.0.0, with no mobile release or directory submission.
- The table passed through iPhone Mirroring: six records → footer creation opened a new note tab → Escape and sidebar reopening produced seven records in another table tab with undo enabled → undo to six → redo to seven. A third table tab opened from the sidebar also inherited available undo.
- The Home embed passed through iPhone Mirroring: three cards → group-plus creation opened a new note tab → Escape and sidebar return to Home produced four cards with undo enabled → undo to three → redo to four. Both workflows produced no success notices.
- Mirrored tag and title input remain unreliable: the empty-tag popup closed without changing its value, and title pasting did not establish a saved edit. Neither counts as a passing property edit or combined undo test.
- All 13 original Markdown bodies match the package. The new fictional notes `Ideas/未命名.md` and `Projects/未命名.md` are retained.
- The November 4 direct-touch review did not pass: tag selection in the popup visibly updated out of sync with the table cell; holding the six-dot grip showed an unwanted circle; and moving between the gallery and idea table visibly changed some rows from two lines to one. The user did not confirm creation → tag edit → two undos → two redos. A new request also asks for the board footer's New button to use the same rounded-rectangle radius as its cards.

R6 candidate `main.js` SHA-256: `01f77974797c65f5d9884a4c4672b000464023f6d4ebdc3be3a34fde2c9a44cf`; `styles.css`: `72a7357eb2ed8c1245d285f11d20d2f16b95d5dbd59b2a8949509f8fcd0d8b9a`; ZIP: `8ff4f8f511f9df4dc040f3da224c0142a3c112f80924985a76784e658abe5913`.

### R7 fixes and device feedback (2026-11-04)

- Popup updates now follow authoritative native-query and cell-renderer acknowledgement. Twelve new tag regressions cover delayed acknowledgements from earlier writes, failure of the latest write and external undo. The synchronization effect has not yet been confirmed on the phone.
- Row-height measurement preserves native overflow rules. A stable inert probe measures minimum column widths for empty first cells, horizontal virtualization and hidden remove controls. Initial geometry waits for the actual query owner to reduce two-stage layout.
- Board footer New buttons use the cards' 9px radius. Grip and drag-overlay styling removes the unwanted circle. Touch reordering still needs a device retest.
- The build, **273/273** automated tests and `git diff --check` pass. The fresh `Nebula-Focus-iPhone-R7` vault loaded on the phone, with its name and six-row table confirmed. Candidate and iCloud runtime hashes match. At the read-only check, all 13 original fictional Markdown bodies and complete files remained unchanged. Public release metadata and directory-submission status are unchanged.
- Layout acceptance still failed: the third row's tags initially occupied two lines at approximately screenshot y=709–805, then three lines at y=709–846 after a later scan or return from the gallery. These are Mirroring screenshot coordinates, not measured CSS pixels.
- The board footer New button passed visual inspection: its purple rounded-rectangle outline matches the card radius.
- Clicking a tag option through Mirroring passed through to the title underneath, consistent with the previously observed Mirroring input limitation. This does not establish a real-touch tag failure or pass; direct phone retesting remains necessary.

R7 candidate `main.js` SHA-256: `fef227e1647a2635a35a2f90ad4960dae1e77b22377161e844b139ffa89124c7`; `styles.css`: `b8b307f8ef5523926fdeb5e5a449cfc59bba91702855f97ea460b0b6a392090c`; ZIP: `62f7114d5a6deab258c6310c91a7ce5a29382e69a97779921ecaca0e85ae5a8f`.

### R8 candidate awaiting device acceptance (2026-11-04)

- Corrected the difference between first-frame and already-decorated checks in `idea-widths`, so the same tags use consistent minimum-width measurement. The isolated `dist/r8-source` build contains only R7 plus this width fix, excludes the concurrently developed page sidebar, and does not rewrite other shared working-tree source.
- The build and **273/273** automated tests pass, with no skipped tests. Bundle-module comparison confirms that only `src/idea-widths.ts` content changed from R7; the support module moved with import order but is unchanged. `styles.css` is byte-identical to R7.
- The separate `dist/Nebula-Focus-iPhone-R8` test vault is packaged and copied to iCloud, with all three runtime files byte-identical and no previous test vault overwritten. It has loaded on the phone and the vault name is confirmed.
- This layout reproduction passed visual inspection through Mirroring: on both the initial idea-table opening and return from the gallery, the third row retained three tag lines at approximately screenshot y=709–846. The six-row table bottom and New action stayed at approximately y=1118. In R7, that position had changed from about y=1076 to y=1118. This is a screenshot comparison of that path, not acceptance of the whole candidate.
- Direct-touch retesting has been requested for popup/cell synchronization, whole-row hold-and-drag without the unwanted grip circle, gallery round trips, and creation → tag edit → two undos → two redos. Further UI changes were requested, but that combined touch sequence was not confirmed. Full mobile acceptance and the release gate remain unmet.

R8 candidate SHA-256: `main.js` `6ed873f90d9b8bb3ef7d3d07123db8f52d0a2505f36c12465430f1ae4b2c1c78`; `styles.css` `b8b307f8ef5523926fdeb5e5a449cfc59bba91702855f97ea460b0b6a392090c`; test `manifest.json` `144c946f88f2e7fe98eb7f628c8536ad54ed8b014d21e36fdf3aac97ac3e8124`; ZIP `dc1f76862eb7d2c783f967ac1ab263f403bc8902502fbb87c37ead57417ebe6c`.

### R9 desktop theme verification and mobile candidate (2026-11-04)

- The complete current source, including the existing page sidebar, passes the build, strict TypeScript checking and **295/295** automated tests. R9 uses this complete source rather than R8's isolated build that excluded the sidebar. The published release remains desktop 1.0.0.
- Both light and dark themes were checked in actual desktop Obsidian **1.14.5** using the separate fictional R9 vault. Native cell tags, selected popup tags and option tags share a computed **13.125px** font size and **400** weight without reducing the user's native font setting. Semantic tag colors remain readable in both themes.
- Native delete controls in managed tag cells, including hover, have `display: none`. There are **0** trailing Open-button elements; the leading page icon remains the navigation control.
- The idea-title column header opens an anchored settings panel styled like the tag manager. Opening and Escape cancellation were verified in the app. This visual pass did not save a rename; saving, IME and retry behavior are covered by automated tests.
- Board New buttons have a transparent `rgba(0, 0, 0, 0)` background, a **9px** radius matching the cards, and a purple outline. Project-next-step and project-summary property labels use `--text-accent`, sampled as RGB **138, 92, 245** in the light theme. Overdue-date red remains intact.
- All **13** original fictional Markdown files remained byte-identical after the visual and cancellation checks.
- `dist/Nebula-Focus-iPhone-R9` is packaged and was copied from the pristine ZIP into a new same-named iCloud vault without overwriting previous test vaults. R9 has loaded on the iPhone. Mirroring confirmed the vault name, six-row table without trailing Open buttons, and the anchored title-column rename panel. Mirroring clicks still trigger native tag menus or pass through popup controls, so they do not establish direct-touch behavior. **Full mobile acceptance remains pending.** Desktop theme checks are not mobile acceptance. No mobile release or official directory submission has occurred.
- The user subsequently confirmed two R9 cases through direct phone interaction: tag font sizes match between cells and the popup, and creation → tag edit → two undos → two redos works. These are real-device passes for those two cases only; popup/cell update synchronization, reordering, themes and lifecycle checks do not automatically inherit a pass. The user additionally requested hiding mobile undo/redo controls while keeping desktop controls; see R10 for the scoped follow-up check.

R9 candidate SHA-256: `main.js` `cc30fc6bd31fc8f0d405d4b8260061bd1d36eca2f6c2b42648f2d4891eb1d5b9`; `styles.css` `331fb166adf66231823d2baaf5af12ff7327b42f57d981b564d2c7e8fd8089a3`; ZIP `a21dc86c014cce104e2dbdf707222c4da1020d0977ae9f444bc4ff9b44b4797a`.

### R10 phone history-button visibility check (2026-11-04)

- The build and **295/295** automated tests pass. Phones do not create visible Undo/Redo buttons or their extra toolbar row. Desktop buttons, shortcuts and commands remain available. Internal phone database history and command fallback remain intact, as does native text undo.
- The pristine `dist/Nebula-Focus-iPhone-R10.zip` was extracted into a new same-named iCloud vault without overwriting older test vaults. Actual iPhone Mirroring confirmed the R10 vault name and loaded state.
- The standalone idea table shows **6** results with no Undo/Redo row; its native toolbar is immediately above the column headers.
- The Home embedded board shows **3** results with no Undo/Redo row. Other card and column touch menus remain present.
- After the table and Home observations, a read-only byte comparison confirmed all **13** original fictional Markdown files in iCloud R10 still match their example sources exactly.
- These scoped visual checks of the requested control change passed through actual iPhone Mirroring; they are not full touch acceptance. R9's user-confirmed tag-font consistency and combined creation/tag undo results remain valid evidence for those cases. Other scenarios retain their individual evidence limits. No mobile release or official directory submission has occurred.

R10 candidate SHA-256: `main.js` `e7e838dcc333bf9249516445f6c635dee505d5920b0b234b3727d2c92656a0f8`; `styles.css` `6ec6f23416099cb9338c414c6e928b1e5f800c82ac21b5b6056321e76a002c51`; ZIP `6c56a17c7df80dc8ad54409d2f1602ec679c9bfccde90648a61f8b7828841729`.

### Verification levels

| Level | Coverage | Required evidence |
| --- | --- | --- |
| Build and automation | Browser runtime, history ordering, cancelled gestures, popup boundaries and cleanup | Build result, test names and counts |
| Desktop mobile emulation | 320–430 CSS pixels, orientation, horizontal table scrolling and layout | Screenshots and steps labelled as desktop emulation |
| Physical iPhone | Touch, Chinese IME, software keyboard, scrolling, app switching and undo controls | Device model, iOS/Obsidian versions and pass/fail results |
| Community directory | Versioning, release assets, build verification, code scanning and disclosures | Actual results from the developer dashboard |

### Per-scenario device evidence

Use a separate sample vault and record the installed package version. Check tables, boards and galleries; short and long titles; several tags; local images and empty entries. Current evidence is limited to the cases below.

After `npm run build`, update `main.js`, `manifest.json` and `styles.css` in the existing `Nebula-Focus-iPhone` test vault, preserve test notes and plugin settings, wait for iCloud synchronization, then reload. The packaging script can still produce local fictional test archives, but each build no longer adds a new iCloud vault. The table records evidence and its limits; historical untested cases are not a blanket requirement to complete every case before release.

| Check | Current device result |
| --- | --- |
| Load views and local covers | Mirroring confirmed the R2 vault, table/board rendering, three gallery cards, local covers and opening a note from a gallery card. Unknown-structure fallback is untested. |
| Horizontal scrolling and rotation | The user confirmed both work; text size and tag layout still need improvement. |
| Continuous Chinese title input | The user confirmed keyboard and caret behavior. Trailing-blank clicks, cancellation and composition edge cases have not all been retested. |
| Select, add, remove and reorder tags | R6 direct-touch acceptance failed. R7 Mirroring clicks passed through and cannot establish real-touch behavior; popup/cell synchronization and whole-row dragging still need phone retesting. |
| Tag panel keyboard interaction | Not accepted: long-press keyboard access is slow and dragging right does not open the keyboard. Fix and retest required. |
| Move a board card through its menu | The user moved a card to the publishing group. Mirroring confirmed undo/redo changed that group's count 2↔1. |
| Enlarge and close a thumbnail | The user confirmed both work. Table-row height limits were not measured separately. |
| Create from a board group plus button | R6 Mirroring confirmed sidebar return to another Home tab after creation, 3→4→3→4, without success notices. |
| Create from the table footer | R6 Mirroring confirmed sidebar return to another table tab after creation, 6→7→6→7, without success notices. |
| Discover undo/redo controls | R6 Mirroring confirmed labeled controls and available undo in the second and third table tabs reopened from the sidebar. |
| Light and dark appearance | The R9 user confirmed consistent tag font sizes. Desktop checks passed in both themes; full phone theme/layout acceptance remains unconfirmed. |
| Create → tag edit → two undos → two redos | The R9 user directly confirmed that this combined creation/tag sequence works on the phone. This is a pass for that sequence. |
| Scroll remount and Back/Forward navigation | R8 Mirroring showed three tag lines and identical table-bottom positions on initial opening and return from the gallery. This reproduction passed visually; direct-touch perception awaits user confirmation. |
| Board footer New button | R7 passed visual inspection through iPhone Mirroring: purple outline and card-matching corner radius. |
| App lifecycle | Pending. History follows its owning database scope; an app process restart ends it. |
| Disable and re-enable the plugin | Pending; check duplicate controls and listener cleanup. |

Compare note and `.base` changes after testing. Presentation must not rewrite Markdown bodies. Verify explicit data edits, view configuration changes and test-created/undone files separately. Existing undo exclusions remain in [undo-coverage.md](undo-coverage.md).

### Publication and subsequent updates

Version 1.1.1 is published on GitHub. Official scan observations, unconfirmed directory publication status, and client-search and phone-marketplace verification status are recorded at the top of this document. Core phone passes and remaining coverage limits are recorded separately. The latest title-alignment visual check passed on the actual iPhone through Mirroring. The developer-policy and ongoing-maintenance commitments were confirmed by the user and completed with the initial submission. Keep version metadata and the release tag consistent, and attach the three runtime files to the GitHub Release. A source push alone is not an installable update. Subsequent releases do not require a new initial submission, but each version is still scanned. The service periodically checks GitHub Releases; developers can also use **Check for new releases**. The plugin does not update its own executable code; users update through Obsidian. [Official FAQ](https://docs.obsidian.md/community-directory/faq)

Obsidian says automatic reviews typically take a few minutes and passing plugins become searchable and downloadable within 24 hours. This describes the directory process, not a fixed delay guaranteed for every update; scans and directory synchronization still need actual confirmation. The current 1.1.2 release checkpoint is at the top of this document. [Official announcement](https://obsidian.md/blog/future-of-plugins/) · [Review guide](review-warnings.md)
