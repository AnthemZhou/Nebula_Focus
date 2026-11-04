import {Plugin, PluginSettingTab, SettingDefinitionItem} from 'obsidian';
import type {PageSidebar} from './page-sidebar';

/** Sidebar preferences belong to the same plugin and settings queue as Bases. */
export class NebulaFocusSettings extends PluginSettingTab {
  constructor(plugin: Plugin, private sidebar: PageSidebar) {
    super(plugin.app, plugin);
    this.icon = 'panels-top-left';
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [{type: 'group', heading: '页面侧栏', items: [
      {name: '打开页面侧栏', desc: '将同名文件夹与笔记合为一个入口，支持搜索、收藏和同级排序。',
        render: setting => {setting.addButton(button => button.setButtonText('打开侧栏').setCta()
          .onClick(() => this.sidebar.open()));}},
      {name: '启动时打开页面侧栏', desc: '打开库或重新启用插件时，自动显示左侧页面树。',
        control: {type: 'toggle', key: 'openOnStartup'}},
      {name: '排序方式', desc: '手动排序支持拖动、方向快捷键和行菜单；切回手动排序会恢复已保存的顺序。',
        control: {type: 'dropdown', key: 'sort', options: {manual: '手动排序', name: '按名称排序'}}},
      {name: '显示附件', desc: '在页面树中显示图片、PDF 等附件及其文件夹。',
        control: {type: 'toggle', key: 'showAttachments'}},
      {name: '原生文件列表', desc: '用于跨文件夹移动、重命名和删除文件。',
        render: setting => {setting.addButton(button => button.setButtonText('打开文件列表')
          .onClick(() => this.sidebar.openNative()));}},
    ]}];
  }

  getControlValue(key: string): unknown {
    switch (key) {
      case 'openOnStartup': return this.sidebar.settings.openOnStartup;
      case 'showAttachments': return this.sidebar.settings.showAttachments;
      case 'sort': return this.sidebar.settings.sort;
      default: return undefined;
    }
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    let saved = true;
    if ((key === 'openOnStartup' || key === 'showAttachments') && typeof value === 'boolean') {
      saved = await this.sidebar.update(state => ({...state, [key]: value}));
    } else if (key === 'sort' && (value === 'manual' || value === 'name')) {
      saved = await this.sidebar.update(state => ({...state, sort: value}));
    }
    if (!saved) this.update();
  }
}
