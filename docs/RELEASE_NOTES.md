# Nebula Focus 0.6.1 — visual refresh · experimental prerelease

参考 [shadcn/ui](https://ui.shadcn.com/) 的视觉设计，重新整理了 Nebula Focus 的页面、卡片、导航和弹窗。

- 封面缩短并与正文对齐；页面图标、标题、分区标题采用更紧凑的比例。
- 卡片使用细边框、内嵌封面和清晰的标题，补充所在文件夹及打开提示。
- 统一按钮、输入框、搜索结果、封面选择与编辑操作；保存按钮有明确的主操作样式。
- 颜色跟随 Obsidian 主题，支持深浅色、窄分栏和移动端较大的点击区域。
- 修复实际 Obsidian 中搜索结果被默认按钮样式居中、导航按钮边框裁切的问题。

实现采用原生 Obsidian API 和独立 CSS，没有新增运行时依赖。Markdown 格式和保存行为沿用 0.6.0。

在 macOS 26.5.2 / Obsidian 1.14.4 中验证：30 项自动化测试通过，24 项真实应用检查通过（含 CLI 超时项复测），检查了深浅色页面、内联编辑、搜索和封面弹窗的实际截图。详细方法和原始结果见 docs/TESTING.md 与 docs/MAC-UI-TEST-RESULTS.json。

提供安装包、完整源码、示例库及 ZIP 校验文件。桌面端请关闭“仅在手机和平板启用”。本版本仍为预发布，iPhone/Android 实机、系统输入法候选窗及第三方主题尚待验证；未提交 Obsidian 社区目录。GPL-3.0-only。
