# 外部归档 / External archives

1.3.0 提供的桌面功能；手机不显示归档或恢复入口。
A desktop feature included in 1.3.0; archive and restore controls are not exposed on mobile.

## 中文

桌面页面侧栏的右键行菜单提供「归档到外部…」，侧栏选项及插件设置提供「外部归档」。手机不显示归档、恢复或外部目录设置。

默认保存位置是系统用户的 `Documents/Nebula Focus Archives/库名`，可在「外部归档」中改为其他库外绝对路径。更改设置不会移动已保存的归档；切回原目录即可查看之前的包。

归档分为两个阶段：先复制所选页面／项目并逐文件校验，再将源文件移入 Obsidian 的**本地回收站**。不采用可能永久删除文件的系统偏好。项目包括目录内文件以及目录外的同名 Markdown 笔记；本地嵌入附件也会备份，位于所选项目之外的共享附件只复制，不移除。网页、外部图片和链接到的其他笔记不会自动下载或递归归档。

每个包都包含原始文件的相对路径、字节内容和 `manifest.json` 校验清单。Markdown 正文不插入样式或归档代码；AI 和其他工具仍可直接读取 `files/` 中的文件。跨项目链接保持原文，目标未归档时不会凭空生成副本。

复制或校验失败时保留所有源文件；移入回收站中途失败时停止处理剩余源文件，保留完整外部副本并标记部分归档。库中归档记录移除后，不再参与该库的 Bases 查询，原来的入站链接可能暂时无法打开。

在「外部归档」选择「查看与恢复」，确认清单后恢复到当前库的原路径。恢复先检查全部文件和目标路径；同名冲突不会覆盖，共享附件或未被移除的源文件只有内容完全相同时才复用。外部包在恢复后仍然保留。磁盘写入中断时记录已恢复的文件，重试仍需通过校验。

归档支持文件和项目内容，不保留空目录、操作系统文件权限或版本历史；不归档整个库或插件配置。符号链接、越界路径和嵌套的库／归档目录会被拒绝。

## English

The desktop sidebar offers **归档到外部…** (Archive externally) in row context menus and an archive manager in sidebar options and plugin settings. Mobile exposes no archive, restore or external-directory controls.

The default location is `Documents/Nebula Focus Archives/<vault name>` in the current user's home directory. Choose another absolute directory outside the vault in the manager. Changing that preference does not move existing packages; select the old directory to list them again.

Archiving copies and verifies every selected file before moving sources to Obsidian's **local trash**, regardless of permanent-deletion preferences. A project includes its directory and a sibling folder note. Locally embedded attachments are included; shared attachments outside the selection are copied but retained in the vault. Web resources and linked notes are not recursively downloaded or archived.

Each package keeps original relative paths and unmodified bytes under `files/`, plus a checksum manifest. Markdown gains no styling or archive code, and remains directly readable by AI and other tools. Cross-project links retain their original targets. Archived records no longer participate in the active vault's Bases queries, and incoming links may temporarily be unresolved.

Copy/verification failures preserve all sources. A trash failure stops further removal and marks a partial archive while retaining the verified external copy. Restore verifies the package and all destination conflicts first. It never overwrites an existing file; unchanged shared attachments and sources that were never removed may be reused. External packages remain after restoration, and interrupted restores record their progress for a checked retry.

This preserves file content, not empty directories, OS permissions or version history. Whole-vault/configuration archives, symlinks, escaping paths and overlapping vault/archive directories are rejected.
