import {Platform, Plugin, PluginSettingTab, SettingDefinitionItem, type SettingDefinition} from 'obsidian';
import type {PageSidebar} from './page-sidebar';
import {readFontChoice, type FontPreferences} from './font-appearance';
import {readHiddenPagePaths} from './page-tree';

/** Sidebar preferences belong to the same plugin and settings queue as Bases. */
export class NebulaFocusSettings extends PluginSettingTab {
  // Disclosure is local to this settings tab, never another saved preference.
  private showMore = false;
  constructor(plugin: Plugin, private sidebar: PageSidebar, private font?: FontPreferences) {
    super(plugin.app, plugin);
    this.icon = 'panels-top-left';
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const archives = this.sidebar.archives;
    const archiveSettings: SettingDefinitionItem[] = archives && !Platform.isMobileApp ? [{type: 'group', heading: '外部归档（桌面）', visible: () => this.showMore, items: [
      {name: '归档保存位置', desc: '保存在库外的独立目录；归档校验成功后源文件移入回收站。手机不提供此操作。',
        render: setting => {
          setting.descEl.createEl('p', {text: archives.directory});
          setting.addButton(button => button.setButtonText('管理目录与归档').onClick(() => archives.browse()));
        }},
    ]}] : [];
    const appearance: SettingDefinitionItem[] = this.font ? [{type: 'group', heading: '字体', items: [
      {name: '显示字体', desc: '正文、表格和界面使用的字体；原生外观保留 Obsidian 设置。',
        control: {type: 'dropdown', key: 'fontFamily', options: {'codex-system': 'Codex 系统字体', default: '跟随 Obsidian', 'lxgw-wenkai': '霞鹜文楷 / LXGW WenKai'}}},
      {name: '字体预览', desc: 'Codex 系统字体使用系统无衬线字体；霞鹜文楷已内置，两者均可离线使用。',
        render: setting => {
          this.font?.mount(setting.controlEl.ownerDocument);
          setting.controlEl.createDiv({cls: 'bui-font-preview', text: '想法收集箱 · 山川与星河 Aa 0123'});
        }},
    ]}] : [];
    const ribbon = this.sidebar.ribbon;
    const ribbonSettings: SettingDefinitionItem[] = ribbon?.available ? [{type: 'group', heading: '左侧工具按钮', visible: () => this.showMore, items: [
      {name: '显示哪些按钮', desc: '只调整左侧工具栏的显示，不停用功能。新增第三方按钮默认保留；切回原生外观会恢复原工具栏。',
        render: setting => {
          setting.addButton(button => button.setButtonText('全部显示').onClick(async () => {await ribbon.showAll(); this.update();}));
          setting.addButton(button => button.setButtonText('恢复精简').onClick(async () => {await ribbon.reset(); this.update();}));
        }},
      ...ribbon.listItems().map(item => ({name: item.label, control: {type: 'toggle' as const, key: 'ribbon:' + item.id}})),
    ]}] : [];
    const reminders: SettingDefinitionItem[] = this.sidebar.reminders ? [{type: 'group', heading: '提醒事项', items: [
      {name: '页面名称', desc: '同时更新侧栏入口和提醒事项页面标题。',
        render: setting => {
          const controller = this.sidebar.reminders;
          let input: HTMLInputElement, composing = false;
          setting.addText(text => {
            input = text.inputEl; input.maxLength = 80;
            input.setAttribute('aria-label', '提醒事项名称');
            text.setValue(controller?.displayName ?? this.sidebar.reminderName?.() ?? '提醒事项');
            input.addEventListener('compositionstart', () => {composing = true;});
            input.addEventListener('compositionend', () => {composing = false;});
          });
          // Only explicit Save commits the field; typing, IME candidate
          // selection, Enter and blur must not navigate behind this modal.
          setting.addButton(button => button.setButtonText('保存').onClick(async () => {
            const value = input.value.trim();
            if (!controller || !value || composing || input.disabled) return;
            button.setDisabled(true); input.disabled = true;
            try {
              if (await controller.update(state => ({...state, name: value}))) {
                input.value = controller.displayName; this.update();
              }
            } finally {input.disabled = false; button.setDisabled(false);}
          }));
        }},
      {name: '启动时打开提醒事项', desc: '汇总库内未完成任务与截止日期，并显示你添加的数据库。关闭后恢复上次页面。',
        control: {type: 'toggle', key: 'remindersStartup'}},
    ]}] : [];
    const more: SettingDefinitionItem = {name: '更多设置', desc: Platform.isMobileApp ? '侧栏排序、附件与隐藏页面。' : '页面侧栏、工具按钮与归档。',
      render: setting => {setting.addButton(button => {
        button.setButtonText(this.showMore ? '收起' : '展开');
        button.buttonEl.setAttribute('aria-expanded', String(this.showMore));
        button.onClick(() => {this.showMore = !this.showMore; this.update();});
      });}};
    const startupSidebar: SettingDefinition[] = Platform.isMobileApp ? [] : [
      {name: '启动时打开页面侧栏', desc: '打开库或重新启用插件时，自动显示左侧页面树。',
        control: {type: 'toggle', key: 'openOnStartup'}},
    ];
    return [...appearance, ...reminders, more, {type: 'group', heading: '页面侧栏', visible: () => this.showMore, items: [
      {name: '打开页面侧栏', desc: '将同名文件夹与笔记合为一个入口，支持搜索、收藏和同级排序。',
        render: setting => {setting.addButton(button => button.setButtonText('打开侧栏').setCta()
          .onClick(() => this.sidebar.open()));}},
      ...startupSidebar,
      {name: '排序方式', desc: '手动排序支持拖动、方向快捷键和行菜单；切回手动排序会恢复已保存的顺序。',
        control: {type: 'dropdown', key: 'sort', options: {manual: '手动排序', name: '按名称排序'}}},
      {name: '显示附件', desc: '在页面树中显示图片、PDF 等附件及其文件夹。',
        control: {type: 'toggle', key: 'showAttachments'}},
      {name: '隐藏页面路径', desc: '每行填写一个库内文件或文件夹路径，仅从页面侧栏和收藏隐藏，不会删除文件。删除对应行并保存即可恢复；原生文件列表始终可见。Nebula Views 生成配置目录自动隐藏。',
        render: setting => {
          let input: HTMLTextAreaElement;
          setting.addTextArea(text => {
            input = text.inputEl; input.rows = 4; input.cols = 24;
            input.setAttribute('aria-label', '隐藏页面路径，每行一个');
            text.setValue(this.sidebar.settings.hiddenPaths.join('\n')).setPlaceholder('Getting Started.md\n旧导航');
          });
          setting.addButton(button => button.setButtonText('保存').onClick(async () => {
            button.setDisabled(true); input.disabled = true;
            const saved = await this.sidebar.update(state => ({...state, hiddenPaths: readHiddenPagePaths(input.value.split('\n'))}));
            if (saved) input.value = this.sidebar.settings.hiddenPaths.join('\n');
            input.disabled = false; button.setDisabled(false);
          }));
        }},
      {name: '原生文件列表', desc: '用于跨文件夹移动、重命名和删除文件。',
        render: setting => {setting.addButton(button => button.setButtonText('打开文件列表')
          .onClick(() => this.sidebar.openNative()));}},
    ]}, ...ribbonSettings, ...archiveSettings];
  }

  getControlValue(key: string): unknown {
    if (key.startsWith('ribbon:')) return this.sidebar.ribbon?.isVisible(key.slice(7));
    switch (key) {
      case 'remindersStartup': return this.sidebar.reminders?.preferences.openOnStartup ?? true;
      case 'fontFamily': return this.font?.get() ?? 'default';
      case 'openOnStartup': return this.sidebar.settings.openOnStartup;
      case 'showAttachments': return this.sidebar.settings.showAttachments;
      case 'sort': return this.sidebar.settings.sort;
      default: return undefined;
    }
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    let saved = true;
    if (key.startsWith('ribbon:') && typeof value === 'boolean' && this.sidebar.ribbon) {
      saved = await this.sidebar.ribbon.setVisible(key.slice(7), value);
    } else if (key === 'remindersStartup' && typeof value === 'boolean' && this.sidebar.reminders) {
      saved = await this.sidebar.reminders.setOpenOnStartup(value);
    } else if (key === 'fontFamily' && this.font) {
      saved = await this.font.set(readFontChoice(value));
    } else if ((key === 'openOnStartup' || key === 'showAttachments') && typeof value === 'boolean') {
      saved = await this.sidebar.update(state => ({...state, [key]: value}));
    } else if (key === 'sort' && (value === 'manual' || value === 'name')) {
      saved = await this.sidebar.update(state => ({...state, sort: value}));
    }
    if (!saved) this.update();
  }
}
