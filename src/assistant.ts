import {Component, Modal, Notice, Plugin, Setting, requestUrl, setIcon, type TextComponent, type ToggleComponent} from 'obsidian';
import {AssistantEngine, assistantConfig, assistantPreset, chatEndpoint, type AssistantConfig, type ChatEvent, type ChatImage, type Transport} from './assistant-engine';
import {RecordService} from './record-api';
import {MobileAssistantDock} from './assistant-dock';

type Attachment = {file: File; preview: string; image?: ChatImage};
type Bubble = {kind: 'user' | 'assistant' | 'error' | 'record'; text: string; path?: string};
export class RecordingAssistant extends Component {
  private engine: AssistantEngine;
  private modal?: AssistantModal;
  private settingsModal?: AssistantSettings;
  private abort?: AbortController;
  private bubbles: Bubble[] = [];
  private attachments: Attachment[] = [];
  private draft = '';
  private status = '';
  private stopped = false;
  private busy = false;
  private dock?: MobileAssistantDock;
  constructor(readonly plugin: Plugin, readonly records: RecordService, private readConfig: () => unknown,
    private writeConfig: (config: AssistantConfig) => Promise<void>) {
    super(); this.engine = new AssistantEngine(input => records.handle(input), plugin.app.vault.getName());
  }
  get config() {return assistantConfig(this.readConfig());}
  get app() {return this.plugin.app;}
  onload() {
    this.plugin.addCommand({id: 'open-recording-assistant', name: '打开 AI 记录', callback: () => this.open()});
  }
  onunload() {this.stopped = true; this.cancel(); this.modal?.close(); this.settingsModal?.close(); this.releaseAttachments(); this.clearDocks();}
  refreshDock(doc: Document, enabled: boolean) {
    const active = enabled && !this.stopped && doc.body.classList.contains('is-phone');
    // The native navbar is temporarily detached while the soft keyboard is up.
    // Retain both our independent surface and the native control references.
    const host = active ? doc.querySelector<HTMLElement>('.mobile-navbar') ??
      (this.dock?.isConnected && this.dock.host.ownerDocument === doc ? this.dock.host : null) : null;
    if (this.dock?.host !== host) {this.clearDocks(); if (host) this.dock = new MobileAssistantDock(host, this);}
  }
  clearDocks() {this.dock?.destroy(); this.dock = undefined;}
  open() {
    if (this.stopped) return;
    if (this.modal) {this.modal.input?.focus(); return;}
    this.modal = new AssistantModal(this); this.modal.open();
  }
  openSettings() {
    if (this.settingsModal) return;
    this.settingsModal = new AssistantSettings(this); this.settingsModal.open();
  }
  settingsClosed() {this.settingsModal = undefined; this.modal?.render(); this.dock?.render();}
  closed() {this.cancel(); this.modal = undefined;}
  get state() {return {bubbles: this.bubbles, attachments: this.attachments, draft: this.draft, status: this.status, busy: this.busy};}
  setDraft(value: string) {this.draft = value; this.dock?.render();}
  async saveConfig(config: AssistantConfig, key?: string) {
    if (this.busy) throw Error('请等待当前记录完成，或先停止，再更改 AI 配置');
    chatEndpoint(config.endpoint);
    if (!config.model.trim()) throw Error('请填写模型名称');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.secretId)) throw Error('密钥名称只支持小写字母、数字和短横线');
    const previous = this.config;
    if (key !== undefined) this.app.secretStorage.setSecret(config.secretId, key);
    await this.writeConfig(config);
    if (previous.endpoint !== config.endpoint || previous.model !== config.model) {
      this.engine.clear();
      if (this.bubbles.length) this.bubbles.push({kind: 'assistant', text: 'AI 服务或模型已更换，后续对话从新上下文开始；已保存的页面保留。'});
    }
    this.dock?.render();
  }
  private releaseAttachments() {for (const item of this.attachments) URL.revokeObjectURL(item.preview); this.attachments = [];}
  removeAttachment(item: Attachment) {
    if (this.busy) return;
    this.attachments = this.attachments.filter(value => value !== item); URL.revokeObjectURL(item.preview); this.modal?.renderAttachments(); this.dock?.render();
  }
  addFiles(files: File[]) {
    if (this.busy) return;
    if (!this.config.imageInput) {new Notice('当前配置未启用图片输入，请在 AI 设置中选择支持图片的模型并启用'); return;}
    for (const file of files) {
      if (this.attachments.length >= 4) {new Notice('每次最多添加 4 张截图'); break;}
      if (!/\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name) || file.size > 20 * 1024 * 1024 || !file.size) {new Notice('请选择 20 MB 以内的图片'); continue;}
      this.attachments.push({file, preview: URL.createObjectURL(file)});
    }
    this.modal?.renderAttachments(); this.dock?.render();
  }
  clear() {
    if (this.busy) return;
    this.engine.clear(); this.bubbles = []; this.releaseAttachments(); this.draft = ''; this.status = ''; this.modal?.render(); this.dock?.render();
  }
  cancel() {if (this.abort) {this.abort.abort(); this.status = '正在停止…'; this.modal?.renderStatus();}}
  private transport(config: AssistantConfig): Transport {
    const url = chatEndpoint(config.endpoint), key = this.app.secretStorage.getSecret(config.secretId)?.trim();
    if (!key && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(url)) throw Error('请先在 AI 设置中保存 API 密钥');
    return async (body, signal) => {
      if (signal.aborted) throw Error('已停止');
      // requestUrl is cross-platform; cancellation stops the tool loop, even
      // though the native HTTP request cannot be physically aborted.
      let timeout: number | undefined;
      let onAbort: (() => void) | undefined;
      try {
        const response = await Promise.race([
          requestUrl({url, method: 'POST', headers: {'Content-Type': 'application/json', ...(key ? {Authorization: `Bearer ${key}`} : {})}, body: JSON.stringify(body), throw: false}),
          new Promise<never>((_, reject) => {
            timeout = window.setTimeout(() => reject(Error('请求超过 90 秒，请检查网络；已保存的记录会保留')), 90_000);
            onAbort = () => reject(Error('已停止；已保存的记录会保留'));
            signal.addEventListener('abort', onAbort, {once: true});
          }),
        ]);
        if (signal.aborted) throw Error('已停止');
        if (response.status < 200 || response.status >= 300) throw Error(`AI 请求失败（HTTP ${response.status}）。请检查地址、模型、密钥或额度。`);
        const result: unknown = response.json; return result;
      } catch (error) {
        // Never display a transport exception that might contain credentials.
        if (error instanceof Error && /^(已停止|请求超过|AI 请求失败)/.test(error.message)) throw error;
        throw Error('无法连接 AI 服务，请检查网络、API 地址和模型配置');
      } finally {if (timeout) window.clearTimeout(timeout); if (onAbort) signal.removeEventListener('abort', onAbort);}
    };
  }
  private async prepare(item: Attachment): Promise<ChatImage> {
    if (item.image) return item.image;
    // Use a decoded preview for vision APIs; preserve the original in the vault.
    const img = new Image();
    img.src = item.preview;
    try {await img.decode();} catch {throw Error(`无法读取图片「${item.file.name}」，请换为 PNG 或 JPEG`);}
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = createEl('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('无法准备截图');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (this.abort?.signal.aborted || this.stopped) throw Error('已停止');
    const saved = await this.records.storeAttachment(item.file.name, await item.file.arrayBuffer());
    item.image = {name: item.file.name, path: saved.path, wikiLink: saved.wikiLink, dataUrl: canvas.toDataURL('image/jpeg', 0.9)};
    return item.image;
  }
  async send() {
    if (this.busy || this.stopped || !this.draft.trim() && !this.attachments.length) return;
    const config = this.config;
    let transport: Transport;
    try {
      if (!config.model.trim()) throw Error('请先填写 AI 模型和 API 配置');
      if (this.attachments.length && !config.imageInput) throw Error('当前模型未启用图片输入，请移除截图或更换支持图片的模型');
      transport = this.transport(config);
    }
    catch (error) {new Notice(error instanceof Error ? error.message : '请先配置 AI'); this.openSettings(); return;}
    this.busy = true; this.abort = new AbortController(); this.status = '正在准备…';
    const text = this.draft.trim(), attachments = [...this.attachments];
    const page = this.app.workspace?.getActiveFile()?.path;
    this.modal?.renderStatus(); this.dock?.render();
    let accepted = false;
    try {
      const images: ChatImage[] = [];
      for (const item of attachments) images.push(await this.prepare(item));
      if (this.abort.signal.aborted || this.stopped) throw Error('已停止');
      this.bubbles.push({kind: 'user', text: text + (images.length ? '\n' + images.map(image => `📎 ${image.name}`).join('\n') : '')});
      this.draft = ''; accepted = true; this.modal?.render();
      await this.engine.send(text, images, config.model.trim(), transport, this.abort.signal, event => this.event(event), page);
      this.releaseAttachments();
    } catch (error) {
      this.bubbles.push({kind: 'error', text: error instanceof Error ? error.message : '处理失败'});
      // Attachments retain their saved paths on retry, so no duplicate copies.
      if (!accepted) this.draft = text;
    } finally {
      this.busy = false; this.abort = undefined; this.status = ''; this.modal?.render(); this.dock?.render();
    }
  }
  private event(event: ChatEvent) {
    if (event.kind === 'status') {this.status = event.text; this.modal?.renderStatus(); return;}
    if (event.kind === 'text') this.bubbles.push({kind: 'assistant', text: event.text});
    if (event.kind === 'record') {
      const {title, path, created, updated, idempotent} = event.result;
      if (typeof path === 'string') this.bubbles.push({kind: 'record', path, text: `${idempotent ? '已存在' : created ? '已新建' : updated ? '已更新' : '无需更改'} · ${typeof title === 'string' ? title : path}`});
    }
    this.modal?.renderMessages();
  }
}

class AssistantSettings extends Modal {
  constructor(private controller: RecordingAssistant) {super(controller.app);}
  onOpen() {
    this.setTitle('AI 记录设置');
    const config = {...this.controller.config}; let key: string | undefined;
    this.contentEl.createEl('p', {text: '支持 OpenAI、DeepSeek 和其他兼容 Chat Completions 的服务。模型必须支持工具调用；记录截图还需支持图片输入。发送时，消息、截图和所需的数据库内容会交给所选服务。'});
    let endpointInput: TextComponent, modelInput: TextComponent, secretInput: TextComponent, keyInput: TextComponent, imageToggle: ToggleComponent;
    new Setting(this.contentEl).setName('快速填写').setDesc('预设仅填写下面的配置，地址和模型都可继续修改。更换服务或模型后，会重置对话上下文。')
      .addDropdown(dropdown => dropdown.addOption('custom', '自定义 / 保持当前').addOption('openai', 'OpenAI').addOption('deepseek', 'DeepSeek').setValue('custom').onChange(value => {
        if (value !== 'openai' && value !== 'deepseek') return;
        Object.assign(config, assistantPreset(value));
        key = undefined; keyInput.setValue('');
        endpointInput.setValue(config.endpoint); modelInput.setValue(config.model); secretInput.setValue(config.secretId); imageToggle.setValue(config.imageInput);
      }));
    new Setting(this.contentEl).setName('API 地址').setDesc('填写服务商基础地址（可含 /v1）或完整的 /chat/completions 地址。')
      .addText(text => {endpointInput = text; text.setValue(config.endpoint).onChange(value => {config.endpoint = value.trim();});});
    new Setting(this.contentEl).setName('模型').setDesc('可填写服务商提供的任意兼容模型 ID。')
      .addText(text => {modelInput = text; text.setPlaceholder('服务商提供的模型 ID').setValue(config.model).onChange(value => {config.model = value.trim();});});
    new Setting(this.contentEl).setName('图片输入').setDesc('仅在所选模型支持图片时开启；关闭后仍可用文字记录。预设能力以服务商实际提供为准。')
      .addToggle(toggle => {imageToggle = toggle; toggle.setValue(config.imageInput).onChange(value => {config.imageInput = value;});});
    new Setting(this.contentEl).setName('密钥名称').setDesc('保存在 Obsidian 密钥存储中，插件配置只保存这个名称。')
      .addText(text => {secretInput = text; text.setValue(config.secretId).onChange(value => {config.secretId = value.trim();});});
    new Setting(this.contentEl).setName('API 密钥').setDesc('留空保留已有密钥。本机免密服务可以不填。')
      .addText(text => {keyInput = text; text.inputEl.type = 'password'; text.inputEl.autocomplete = 'off'; text.setPlaceholder('输入新密钥').onChange(value => {key = value.trim() || undefined;});});
    const error = this.contentEl.createDiv({cls: 'bui-ai-error', attr: {role: 'status'}});
    new Setting(this.contentEl).addButton(button => button.setButtonText('保存').setCta().onClick(async () => {
      button.setDisabled(true);
      try {await this.controller.saveConfig(config, key); this.close(); new Notice('AI 配置已保存');}
      catch (reason) {error.textContent = reason instanceof Error ? reason.message : '保存失败';}
      finally {button.setDisabled(false);}
    }));
  }
  onClose() {this.contentEl.empty(); this.controller.settingsClosed();}
}
class AssistantModal extends Modal {
  input?: HTMLTextAreaElement;
  private messages!: HTMLElement;
  private attachmentList!: HTMLElement;
  private status!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private attachButton!: HTMLButtonElement;
  private clearButton!: HTMLButtonElement;
  constructor(private controller: RecordingAssistant) {super(controller.app);}
  onOpen() {
    this.modalEl.classList.add('bui-ai-modal'); this.setTitle('AI 记录');
    const toolbar = this.contentEl.createDiv({cls: 'bui-ai-toolbar'});
    this.clearButton = this.button(toolbar, '新对话', 'message-square-plus', () => this.controller.clear());
    this.button(toolbar, 'AI 设置', 'settings', () => this.controller.openSettings());
    this.messages = this.contentEl.createDiv({cls: 'bui-ai-messages', attr: {role: 'log', 'aria-label': '对话记录'}});
    this.status = this.contentEl.createDiv({cls: 'bui-ai-status', attr: {role: 'status', 'aria-live': 'polite'}});
    this.attachmentList = this.contentEl.createDiv({cls: 'bui-ai-attachments'});
    const compose = this.contentEl.createDiv({cls: 'bui-ai-compose'});
    this.input = compose.createEl('textarea', {attr: {rows: '3', placeholder: '记录一笔报销，或附上截图…', 'aria-label': '消息'}});
    this.input.addEventListener('input', () => this.controller.setDraft(this.input!.value));
    this.input.addEventListener('keydown', event => {if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {event.preventDefault(); void this.controller.send();}});
    this.input.addEventListener('paste', event => {const files = Array.from(event.clipboardData?.files ?? []); if (files.length) {event.preventDefault(); this.controller.addFiles(files);}});
    const actions = compose.createDiv({cls: 'bui-ai-actions'}), picker = actions.createEl('input', {attr: {type: 'file', accept: 'image/*', multiple: ''}});
    picker.hidden = true;
    picker.addEventListener('change', () => {this.controller.addFiles(Array.from(picker.files ?? [])); picker.value = '';});
    this.attachButton = this.button(actions, '添加截图', 'image-plus', () => picker.click());
    this.sendButton = this.button(actions, '发送', 'arrow-up', () => {if (this.controller.state.busy) this.controller.cancel(); else void this.controller.send();});
    this.sendButton.classList.add('mod-cta'); this.render();
  }
  private button(parent: HTMLElement, label: string, icon: string, run: () => void) {
    const button = parent.createEl('button', {attr: {'aria-label': label}}); setIcon(button.createSpan(), icon); button.createSpan({text: label}); button.addEventListener('click', run); return button;
  }
  render() {if (!this.input) return; this.input.value = this.controller.state.draft; this.renderMessages(); this.renderAttachments(); this.renderStatus();}
  renderMessages() {
    if (!this.messages) return;
    this.messages.empty();
    const {bubbles} = this.controller.state;
    if (!bubbles.length) {
      this.messages.createEl('p', {cls: 'bui-ai-welcome', text: '把截图和想记录的内容发在这里。\n例如：这笔打车费记到待报销，关联到 LUXURY MAPPING。'});
      this.messages.createEl('p', {cls: 'bui-ai-hint', text: '首次使用请填写 AI 设置。聊天暂存于本次插件运行期间，已写入的页面和附件会保留。'});
    }
    for (const bubble of bubbles) {
      const row = this.messages.createDiv({cls: `bui-ai-bubble bui-ai-${bubble.kind}`});
      if (bubble.path) {
        const link = row.createEl('a', {text: bubble.text, href: `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(bubble.path)}`});
        link.addEventListener('click', event => {event.preventDefault(); this.close(); void this.app.workspace.openLinkText(bubble.path!, '', false);});
      } else row.textContent = bubble.text;
    }
    this.messages.scrollTop = this.messages.scrollHeight;
  }
  renderAttachments() {
    if (!this.attachmentList) return;
    this.attachmentList.empty();
    for (const item of this.controller.state.attachments) {
      const chip = this.attachmentList.createDiv({cls: 'bui-ai-attachment'});
      chip.createEl('img', {attr: {src: item.preview, alt: item.file.name}});
      const remove = this.button(chip, `移除 ${item.file.name}`, 'x', () => this.controller.removeAttachment(item)); remove.disabled = this.controller.state.busy;
    }
  }
  renderStatus() {
    if (!this.status) return;
    const {busy, status} = this.controller.state;
    this.status.textContent = status || (!this.controller.config.imageInput ? '当前配置仅接收文字，可在 AI 设置中启用图片输入。' : '');
    this.input!.disabled = busy; this.attachButton.disabled = busy || !this.controller.config.imageInput; this.clearButton.disabled = busy;
    this.sendButton.textContent = busy ? '停止' : '发送'; this.sendButton.setAttribute('aria-label', busy ? '停止' : '发送');
  }
  onClose() {this.controller.closed(); this.contentEl.empty(); this.input = undefined;}
}
