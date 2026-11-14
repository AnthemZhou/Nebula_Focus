# 内置字体 / Bundled fonts

## 当前字体选择 / Current font choices

「显示字体」现支持 **Codex 系统字体**、**跟随 Obsidian**、**霞鹜文楷**。Codex 系统字体使用 Codex 桌面默认正文的系统字体栈 `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`，使正文、表格、标签与面板使用相同字体；中文由操作系统匹配对应字形。无需提取、安装或分发 Codex 的字体文件。字号、行距和代码等宽字体保持现有设置。

选择仍保存在插件设置中，原生外观恢复 Obsidian 字体。既有字体偏好不会自动覆盖，可在「设置 → Nebula Focus → 字体」切换。

**Display font** now offers **Codex system font**, **Follow Obsidian**, and **LXGW WenKai**. The Codex option uses the desktop app's default content stack, `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`, consistently across notes, tables, tags and panels; the operating system supplies Chinese glyphs. It needs no extracted, installed or redistributed Codex font files. Existing size, leading and monospace code settings remain unchanged. The choice stays in plugin settings, native appearance restores Obsidian fonts, and existing preferences are not overwritten automatically.

## 1.3.0 行为

1.3.0 包含可选的离线霞鹜文楷。下方验证表保留 2026-11-12 开发阶段的测试范围与构建状态，不代表对后续所有布局重新验收。

在「设置 → Nebula Focus → 字体 → 显示字体」中，可选择「跟随 Obsidian」或「霞鹜文楷 / LXGW WenKai」。默认跟随 Obsidian；选择内置字体后才加载字体数据。正文、表格、首页、侧栏和界面使用同一字体，代码保留等宽字体；字号、字重和行距设置不变。

选择保存在插件 `data.json` 的 `fontFamily` 字段，不写入 Markdown、`.base` 或 Obsidian 的原生字体设置。切回原生外观或停用插件时，恢复原有字体；异步加载完成也不会重新启用已关闭的字体效果。每个窗口独立管理字体，字体切换后重新测量表格行高与列宽。

## 来源与分发

- 字体：官方 **LXGW WenKai Regular 1.530**，字重 400。
- 固定来源、提交、完整字形数量、原始与压缩文件校验值、可复现压缩步骤：见 [字体来源记录](../assets/fonts/README.md)。
- 原始完整授权：见 [SIL Open Font License 1.1](../assets/fonts/OFL.txt)；主插件 GPL 授权不替代字体的 OFL 授权。
- 完整 WOFF2 随 `main.js` 内嵌分发，无运行时下载、CDN 或系统字体安装依赖。标准 Obsidian 更新仍只需既有的 `main.js`、`manifest.json`、`styles.css`。
- 字体授权全文也随构建写入 `main.js`，见 [第三方声明](../THIRD-PARTY-NOTICES.md)。

## 开发阶段验证记录（2026-11-12）

| 范围 | 结果与限制 |
| --- | --- |
| 自动化全量 | **599/599 通过，0 失败**；执行于独立设置窗口额外挂载修复之前。 |
| 修复后专项 | 字体、阅读呈现、页面侧栏相关 **68/68 通过，0 失败**。覆盖默认不加载、原生恢复、异步晚完成、卸载、跨窗口、加载失败及设置保存。 |
| 构建与静态检查 | 构建通过；lint **0 错误、38 条既存警告**。 |
| 桌面深色设置窗口 | 已确认独立设置窗口加载内置字体，预览和设置文字正常显示。 |
| 桌面主窗口 | 已确认 Home 表格、侧栏、标题与标签显示内置字体。 |
| 原生恢复与重载 | 原生外观移除字体 class 并恢复原字体 family；重载后保留所选字体。验证结束已选回「跟随 Obsidian」。 |
| iPhone 字体切换 | 真机设置页已显示字体选项。选择「霞鹜文楷」后，设置预览、侧栏以及原生财务测试表格的标题、日期、标签均观察到字形切换；再选「跟随 Obsidian」后恢复成功。这是上述字体呈现与恢复的有限通过，不包含后续手机布局或侧栏隐藏路径验收。继续使用同一个 iCloud 测试库，插件仍为本地 1.2.0。 |
| iCloud 运行文件 | 此前发现 `main.js` 唯一版本冲突，旧版本为 506,023 字节且不含字体设置。已备份全部插件运行文件、`data.json` 和冲突版本，再通过 `NSFileCoordinator` 更新 `main.js` 并将冲突标记为已解决。随后真机实际显示字体入口并完成切换，补足了字体代码已加载的观察证据。后续布局与侧栏隐藏修复仍在上传，手机尚未加载该批更新；不能把字体通过扩展为新布局通过。备份位于本地验证目录 `dist/lxgw-font-validation/icloud-conflict`，不随发布分发。 |
| 数据与设置 | 桌面已恢复「跟随 Obsidian」。桌面与手机配置除 `fontFamily`、`appearanceMode` 外均与原备份一致；本次同步修复没有修改 `data.json`。原有 15 篇 Markdown 的完整文件哈希全部一致。 |

## Behavior in 1.3.0

Version 1.3.0 includes the optional offline LXGW WenKai font. The validation table below retains the scope and build state of the 2026-11-12 development checks; it does not imply revalidation of every subsequent layout.

Settings → Nebula Focus → 字体 (Fonts) → 显示字体 (Display font) offers **Follow Obsidian** and **LXGW WenKai**. Follow Obsidian remains the default; font data loads only when selected. Notes, tables, Home, the sidebar and interface share the chosen font. Code retains its monospace font, and font-size, weight and line-spacing settings are unchanged.

The preference lives in `fontFamily` in plugin `data.json`. It does not change Markdown, `.base` files or Obsidian's native font settings. Native appearance and plugin unload restore the original fonts; a late asynchronous load cannot reactivate a disabled effect. Each window manages its own font, and table geometry is recalculated after switching.

The bundled font is official **LXGW WenKai Regular 1.530**, weight 400. See the [font provenance](../assets/fonts/README.md) for pinned sources, hashes and reproducible compression, and [OFL.txt](../assets/fonts/OFL.txt) for its original license. The complete WOFF2 and license are embedded in `main.js`, so standard plugin updates need no extra asset, runtime network request or system-font installation. The font retains its OFL license separately from the plugin's GPL license.

## Development verification record (2026-11-12)

| Scope | Result and limit |
| --- | --- |
| Full automated suite | **599/599 passed, 0 failures**, before the extra mount fix for the separate settings window. |
| After that fix | **68/68 passed, 0 failures** across font, reading and page-sidebar tests. Cases include default no-load behavior, native restoration, late asynchronous completion, unload, multiple windows, load failure and preference persistence. |
| Build and lint | Build passed; lint reported **0 errors and 38 existing warnings**. |
| Dark desktop settings window | The separate settings window loaded the bundled font; preview and settings text displayed correctly. |
| Main desktop window | Home tables, the sidebar, titles and tags displayed the bundled font. |
| Native appearance and reload | Native mode removed the font class and restored the original font family. Reload preserved the selection. The setting was returned to Follow Obsidian after verification. |
| iPhone font switching | The real device now showed the font option. Selecting LXGW WenKai visibly changed glyphs in the settings preview, sidebar, and titles, dates and tags in a native finance test table; selecting Follow Obsidian restored the original font. This is a scoped pass for those font-rendering and restoration cases, not the subsequent mobile-layout or hidden-sidebar-path changes. Testing still uses the same iCloud vault and local build marked 1.2.0. |
| iCloud runtime file | An earlier `main.js` version conflict contained an old 506,023-byte version without font settings. All plugin runtime files, `data.json` and that version were backed up before updating `main.js` through `NSFileCoordinator` and marking the conflict resolved. The later font option and successful switching on the real device supply actual evidence that font support loaded. Subsequent layout and hidden-path fixes are still uploading and have not loaded on the phone; the font pass does not cover them. Backups are in the local validation directory `dist/lxgw-font-validation/icloud-conflict` and are not release inputs. |
| Data and settings | Desktop was returned to Follow Obsidian. Desktop and phone settings match their original backups except for `fontFamily` and `appearanceMode`; this synchronization repair did not modify `data.json`. Whole-file hashes for all 15 original Markdown files remain unchanged. |
