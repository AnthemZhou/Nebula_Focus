const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints:['src/idea-table.ts'],bundle:true,write:false,
  platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;
const moduleValue={exports:{}};
new vm.Script(code).runInContext(vm.createContext({module:moduleValue,exports:moduleValue.exports,
  require:name=>{assert.equal(name,'obsidian');return {setIcon(){}};}}));
const {IdeaTables,semanticProperty,ideaTone}=moduleValue.exports;

function fixture(html) {
  const dom=new JSDOM('<!doctype html><body>'+html+'</body>',{pretendToBeVisual:true});
  const tags=new IdeaTables(),doc=dom.window.document;
  return {dom,doc,tags,refresh:()=>tags.refresh(doc),close(){tags.clear();dom.window.close();}};
}
const text=(key,value,type='text')=>`<div class="bases-td" data-property="${key}"><div class="bases-table-cell bases-metadata-value metadata-property-value" data-property-type="${type}"><div class="metadata-input-longtext" contenteditable="true" tabindex="0">${value}</div></div></div>`;
const table=body=>'<div class="bases-view" data-view-type="table" data-view-name="发布记录">'+body+'</div>';
const metadata=(key,value)=>`<div class="metadata-property" data-property-key="${key}"><div class="metadata-property-key"><input class="metadata-property-key-input" value="${key}"></div><div class="metadata-property-value" data-property-type="text"><div class="metadata-input-longtext" contenteditable="true" tabindex="0">${value}</div></div></div>`;

test('semantic field registry is explicit; titles, prose, dates, numbers and formula fields are not inferred as tags',()=>{
  for(const key of ['note.发布平台','内容类型','领域','类型','状态','重要性','优先级','category','Status'])
    assert.equal(semanticProperty(key),'classification',key);
  for(const key of ['项目','关联项目','note.使用镜头','project']) assert.equal(semanticProperty(key),'relation',key);
  for(const key of ['file.name','file.类型','formula.类型','标题','视频名称','项目摘要','项目下一步','备注','描述','发布时间','截止日期','播放','封面','文件和媒体','视频链接'])
    assert.equal(semanticProperty(key),null,key);
});

test('publishing fields become native editable tags without changing text, DOM nodes, events or layout scope',()=>{
  const f=fixture(table(text('note.发布平台','B站')+text('note.内容类型','预告')+text('note.项目','示例项目')+
    text('note.项目摘要','技术')+text('file.name','技术')));
  try {
    const view=f.doc.querySelector('.bases-view'),before=view.textContent;
    const platform=f.doc.querySelector('[data-property="note.发布平台"] .metadata-input-longtext');
    const type=f.doc.querySelector('[data-property="note.内容类型"] .metadata-input-longtext');
    const project=f.doc.querySelector('[data-property="note.项目"] .metadata-input-longtext');
    const plain=[...f.doc.querySelectorAll('[data-property="note.项目摘要"], [data-property="file.name"]')].map(el=>el.outerHTML);
    let inputs=0; platform.addEventListener('input',()=>inputs++); platform.focus();
    f.refresh();
    assert.equal(view.textContent,before); assert.equal(f.doc.activeElement,platform); assert.equal(inputs,0);
    assert.equal(platform.dataset.buiTone,'blue'); assert.equal(type.dataset.buiTone,'purple');
    assert.ok(project.classList.contains('bui-semantic-tag')); assert.equal(platform.getAttribute('contenteditable'),'true');
    assert.equal(view.classList.contains('bui-ideas-base'),false); assert.equal(f.doc.querySelector('.bui-ideas-new-row'),null);
    assert.deepEqual([...f.doc.querySelectorAll('[data-property="note.项目摘要"], [data-property="file.name"]')].map(el=>el.outerHTML),plain);
    platform.textContent='小红书'; platform.dispatchEvent(new f.dom.window.Event('input',{bubbles:true})); f.refresh();
    assert.equal(inputs,1); assert.equal(platform.dataset.buiTone,'orange');
    assert.equal(f.doc.querySelector('[data-property="note.发布平台"] .metadata-input-longtext'),platform);
  } finally {f.close();}
});

test('note properties and native/custom card fields share colors while their labels and prose stay unchanged',()=>{
  const f=fixture(metadata('状态','进行中')+metadata('类型','角色')+metadata('内容类型','教程')+metadata('项目摘要','进行中')+
    '<div class="bases-view" data-view-type="cards"><div class="bases-cards-property" data-property="note.类型"><span class="bases-cards-label">类型</span><div class="bases-rendered-value" data-property-type="text">角色</div></div></div>'+
    '<div class="bases-view" data-view-type="kanban"><div class="bases-kanban-card-property" data-property="note.状态"><span>状态</span><div class="bases-rendered-value" data-property-type="text">进行中</div></div><div class="bui-field" data-property="类型"><span class="bui-field-label">类型</span><div class="bui-field-value">角色</div></div><div class="bui-field" data-property="项目下一步"><span class="bui-field-label">项目下一步</span><div class="bui-field-value">进行中</div></div></div>');
  try {
    const label=f.doc.querySelector('.metadata-property-key'),before=label.outerHTML;
    f.refresh(); assert.equal(label.outerHTML,before);
    const character=[...f.doc.querySelectorAll('.bui-semantic-tag')].filter(el=>el.textContent==='角色');
    assert.equal(character.length,3); assert.equal(new Set(character.map(el=>el.dataset.buiTone)).size,1);
    assert.equal(f.doc.querySelector('[data-property-key="状态"] .metadata-input-longtext').dataset.buiTone,'blue');
    assert.equal(f.doc.querySelector('[data-property-key="项目摘要"] .bui-semantic-tag'),null);
    assert.equal(f.doc.querySelector('[data-property="项目下一步"] .bui-semantic-tag'),null);
    assert.equal(f.doc.querySelector('[data-property-key="内容类型"] .metadata-input-longtext').dataset.buiTone,'green');
  } finally {f.close();}
});

test('relation links retain their actual href, alias, click handler and native edit/remove buttons',()=>{
  const f=fixture(table('<div class="bases-td" data-property="note.项目"><div class="metadata-property-value" data-property-type="text"><div class="metadata-link"><a class="metadata-link-inner internal-link" href="Projects/A" data-href="Projects/A">项目别名</a><button class="metadata-link-flair">编辑</button></div></div></div>')+
    '<div class="metadata-property" data-property-key="项目"><div class="metadata-property-value" data-property-type="multitext"><div class="multi-select-pill"><a class="multi-select-pill-content internal-link" href="Projects/A" data-href="Projects/A">不同别名</a><button class="multi-select-pill-remove-button">删除</button></div><div class="multi-select-input" contenteditable="true"></div></div></div>');
  try {
    const single=f.doc.querySelector('.metadata-link-inner'),pill=f.doc.querySelector('.multi-select-pill'),link=pill.querySelector('a');
    const remove=pill.querySelector('button'),edit=f.doc.querySelector('.metadata-link-flair');
    let clicks=0,removes=0,edits=0;
    for(const el of [single,link]) el.addEventListener('click',event=>{event.preventDefault();clicks++;});
    remove.addEventListener('click',()=>removes++);edit.addEventListener('click',()=>edits++);
    f.refresh();
    assert.ok(single.classList.contains('bui-semantic-link')); assert.equal(single.dataset.buiTone,pill.dataset.buiTone);
    assert.equal(single.textContent,'项目别名'); assert.equal(link.textContent,'不同别名');
    assert.equal(single.getAttribute('href'),'Projects/A'); assert.equal(link.getAttribute('data-href'),'Projects/A');
    assert.equal(pill.querySelectorAll('.bui-native-tag').length,0); assert.equal(pill.querySelector('a'),link);
    assert.equal(pill.querySelector('button'),remove); single.click();link.click();remove.click();edit.click();
    assert.equal(clicks,2);assert.equal(removes,1);assert.equal(edits,1);
    f.tags.clear();single.click();assert.equal(clicks,3);assert.equal(single.classList.contains('bui-semantic-link'),false);
  } finally {f.close();}
});

test('unknown/new values use stable colors and refreshing or toggling preserves prior native classes and attributes',()=>{
  const f=fixture(table(text('note.内容类型','用户新建的类型')));
  try {
    const input=f.doc.querySelector('.metadata-input-longtext');input.classList.add('bui-native-tag','native-class');input.dataset.buiTone='original';
    f.refresh();const tone=input.dataset.buiTone,html=f.doc.body.innerHTML;f.refresh();assert.equal(f.doc.body.innerHTML,html);
    input.classList.add('native-selected');f.tags.clear();
    assert.equal(input.dataset.buiTone,'original');assert.ok(input.classList.contains('bui-native-tag'));assert.ok(input.classList.contains('native-selected'));
    assert.equal(input.classList.contains('bui-semantic-tag'),false);
    f.refresh();assert.equal(input.dataset.buiTone,tone);assert.equal(tone,ideaTone('用户新建的类型','内容类型'));
    assert.equal(ideaTone('e\u0301','类型'),ideaTone('\u00e9','类型'));
  } finally {f.close();}
});

test('empty values, unsupported renderer types and raw Markdown tables remain undecorated',()=>{
  const f=fixture(table(text('note.发布平台','')+text('note.优先级','1','number'))+
    '<div class="markdown-rendered"><table><tr><th>类型</th><td>技术</td></tr></table></div>');
  try {
    const markdown=f.doc.querySelector('.markdown-rendered'),before=markdown.innerHTML; f.refresh();
    assert.equal(f.doc.querySelector('.bui-semantic-tag'),null);assert.equal(markdown.innerHTML,before);
    const cell=f.doc.querySelector('[data-property="note.发布平台"]'),input=cell.querySelector('.metadata-input-longtext');
    input.textContent='B站';f.refresh();assert.ok(input.classList.contains('bui-semantic-tag'));
    cell.dataset.property='note.标题';f.refresh();assert.equal(input.classList.contains('bui-semantic-tag'),false);
    assert.equal(cell.classList.contains('bui-semantic-property'),false);assert.equal(input.textContent,'B站');
  } finally {f.close();}
});

test('native property suggestions are colored only for the active semantic field',()=>{
  const f=fixture(metadata('发布平台','B站')+metadata('项目摘要','B站')+
    '<div class="suggestion-container mod-property-value" data-property-key="发布平台"><div class="suggestion-item">小红书</div></div>');
  try {
    const input=f.doc.querySelector('[data-property-key="发布平台"] .metadata-input-longtext'),option=f.doc.querySelector('.suggestion-item');
    input.focus();f.refresh();assert.equal(option.dataset.buiTone,'orange');
    f.doc.querySelector('[data-property-key="项目摘要"] .metadata-input-longtext').focus();f.refresh();
    assert.equal(option.classList.contains('bui-native-tag'),false);assert.equal(option.hasAttribute('data-bui-tone'),false);
  } finally {f.close();}
});
