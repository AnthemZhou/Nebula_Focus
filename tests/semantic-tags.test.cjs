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

test('scoped viewport decoration includes the root table and retains other tables and note properties',()=>{
  const f=fixture(table(text('note.类型','技术'))+table(text('note.类型','流程'))+metadata('状态','进行中'));
  try {
    f.refresh();
    const [one,two]=f.doc.querySelectorAll('.bases-view');
    const other=two.querySelector('.bui-semantic-tag'),note=f.doc.querySelector('.metadata-property .bui-semantic-tag');
    one.innerHTML=text('note.类型','内容选题');
    f.tags.refresh(one,true);
    assert.equal(one.querySelector('.bui-semantic-tag').dataset.buiTone,'yellow');
    assert.equal(two.querySelector('.bui-semantic-tag'),other);assert.equal(other.dataset.buiTone,'blue');
    assert.ok(note.classList.contains('bui-semantic-tag'));
    assert.equal(f.tags.decorated.size,3);
    f.tags.clear();assert.equal(f.doc.querySelector('.bui-semantic-tag'),null);
  }finally{f.close();}
});

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
    assert.equal(project.classList.contains('bui-semantic-tag'),false,'a relationship-like name alone is not a select'); assert.equal(platform.getAttribute('contenteditable'),'true');
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
    assert.ok(single.classList.contains('bui-relation-link')); assert.ok(pill.classList.contains('bui-relation-pill'));
    assert.equal(f.doc.querySelector('.bui-native-tag, .bui-semantic-tag'),null);
    assert.equal(single.hasAttribute('data-bui-tone'),false);assert.equal(pill.hasAttribute('data-bui-tone'),false);
    assert.equal(single.textContent,'项目别名'); assert.equal(link.textContent,'不同别名');
    assert.equal(single.getAttribute('href'),'Projects/A'); assert.equal(link.getAttribute('data-href'),'Projects/A');
    assert.equal(pill.querySelectorAll('.bui-native-tag').length,0); assert.equal(pill.querySelector('a'),link);
    assert.equal(pill.querySelector('button'),remove); single.click();link.click();remove.click();edit.click();
    assert.equal(clicks,2);assert.equal(removes,1);assert.equal(edits,1);
    f.tags.clear();single.click();assert.equal(clicks,3);assert.equal(single.classList.contains('bui-relation-link'),false);
    assert.equal(f.doc.querySelector('.bui-relation-pill, .bui-relation-property'),null);
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
    for (const value of ['constructor','toString','__proto__']) {
      input.textContent=value;f.refresh();
      assert.ok(['green','orange','blue','purple','yellow'].includes(input.dataset.buiTone),value);
    }
  } finally {f.close();}
});

test('native linked pills and arbitrary related-page fields stay distinct from classifications through refresh and cleanup',()=>{
  const f=fixture(table(text('note.类型','技术')+'<div class="bases-td" data-property="note.关联单据"><div class="multi-select-container"><div class="multi-select-pill internal-link" data-href="Receipts/one" tabindex="0"><span class="multi-select-pill-content">一张相关单据</span><button class="multi-select-pill-remove-button">移除</button></div></div></div>'));
  try{
    const view=f.doc.querySelector('.bases-view');view.dataset.buiEnhancedTable='true';
    const field=view.querySelector('[data-property="note.关联单据"]'),pill=field.querySelector('.multi-select-pill'),content=pill.firstElementChild;
    let opens=0;pill.addEventListener('click',()=>opens++);
    f.refresh();
    assert.ok(pill.classList.contains('bui-relation-pill'));assert.ok(content.classList.contains('bui-relation-link'));
    assert.equal(field.querySelector('.bui-native-tag, .bui-semantic-tag'),null);
    assert.equal(field.classList.contains('bui-semantic-property'),false);
    assert.ok(view.querySelector('[data-property="note.类型"] .bui-native-tag'));
    const before=field.innerHTML;pill.focus();f.refresh();assert.equal(field.innerHTML,before);
    pill.click();assert.equal(opens,1);assert.equal(pill.dataset.href,'Receipts/one');
    // A wrongly configured select hint cannot recolor an actual page link.
    view.dataset.buiTagProperties=JSON.stringify(['note.关联单据']);f.refresh();
    assert.equal(field.querySelector('.bui-native-tag, .bui-semantic-tag'),null);
    f.tags.clear();assert.equal(field.querySelector('.bui-relation-link, .bui-relation-pill'),null);
    assert.ok(pill.classList.contains('internal-link'));pill.click();assert.equal(opens,2);
  }finally{f.close();}
});

test('a classification renderer changing into a related page loses its color and restores on return',()=>{
  const f=fixture(table(text('note.类型','技术')));
  try{
    const field=f.doc.querySelector('.bases-td'),value=field.querySelector('.metadata-input-longtext');
    f.refresh();assert.ok(value.classList.contains('bui-native-tag'));
    value.innerHTML='<a class="internal-link" href="Types/技术">技术详情</a>';f.refresh();
    assert.equal(value.classList.contains('bui-native-tag'),false);assert.equal(value.hasAttribute('data-bui-tone'),false);
    assert.ok(value.firstElementChild.classList.contains('bui-relation-link'));
    value.textContent='流程';f.refresh();assert.equal(value.dataset.buiTone,'blue');
    assert.equal(field.classList.contains('bui-relation-property'),false);
  }finally{f.close();}
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

test('native suggestions preserve selection and callbacks, share new-value colors, and follow the active semantic field',()=>{
  for (const field of [metadata('发布平台','B站'),table(text('note.发布平台','B站'))]) {
  const f=fixture(field+metadata('项目摘要','B站')+
    '<div class="suggestion-container mod-property-value" data-property-key="发布平台"><div class="suggestion-item is-selected">小红书</div></div>');
  try {
    const input=f.doc.querySelector(':is([data-property-key="发布平台"], [data-property="note.发布平台"]) .metadata-input-longtext'),option=f.doc.querySelector('.suggestion-item');
    let clicks=0;option.addEventListener('click',()=>clicks++);
    input.focus();f.refresh();assert.equal(option.dataset.buiTone,'orange');
    input.textContent=option.textContent='新建研究领域';f.refresh();
    assert.equal(option.dataset.buiTone,input.dataset.buiTone);
    assert.equal(f.doc.activeElement,input);assert.ok(option.classList.contains('is-selected'));
    option.click();assert.equal(clicks,1);
    input.blur();f.refresh();assert.equal(option.classList.contains('bui-native-tag'),false);
    assert.ok(option.classList.contains('is-selected'));assert.equal(option.textContent,'新建研究领域');
    input.focus();f.refresh();assert.ok(option.classList.contains('bui-native-tag'));
    f.doc.querySelector('[data-property-key="项目摘要"] .metadata-input-longtext').focus();f.refresh();
    assert.equal(option.classList.contains('bui-native-tag'),false);assert.equal(option.hasAttribute('data-bui-tone'),false);
  } finally {f.close();}
  }
});


test('explicit native finance profiles color only configured tag columns and retain cell DOM editors',()=>{
  const f=fixture(table(text('note.方向','支出')+text('note.入账状态','待确认')+text('note.流水摘要','服务费')));try{
    const view=f.doc.querySelector('.bases-view');view.dataset.viewName='收支流水';
    view.dataset.buiEnhancedTable='true';view.dataset.buiTagProperties=JSON.stringify(['note.方向','note.入账状态']);
    const input=view.querySelector('[data-property="note.方向"] .metadata-input-longtext');
    input.focus();f.refresh();
    assert.ok(view.classList.contains('bui-ideas-base'));assert.ok(input.classList.contains('bui-native-tag'));
    assert.equal(f.doc.activeElement,input);assert.equal(input.textContent,'支出');
    assert.equal(view.querySelector('[data-property="note.流水摘要"] .bui-native-tag'),null);
    delete view.dataset.buiEnhancedTable;delete view.dataset.buiTagProperties;f.refresh();
    assert.equal(input.classList.contains('bui-native-tag'),false);assert.equal(view.classList.contains('bui-ideas-base'),false);
  }finally{f.close();}
});

test('a renamed opted-in native table keeps a final create row and delegates all writes to the native toolbar',async()=>{
  const f=fixture('<div class="bases-embed"><div class="bases-header"><div class="bases-toolbar-new-item-menu"><button class="text-icon-button" role="button">原生新建</button></div></div>'+table('<div class="bases-table-container" style="width:600px"><div class="bases-tbody">'+text('note.标题','条目一')+'</div></div>')+'</div>');
  try{
    const view=f.doc.querySelector('.bases-view'),native=f.doc.querySelector('.text-icon-button'),container=view.querySelector('.bases-table-container');
    view.dataset.viewName='新文档数据库';view.dataset.buiEnhancedTable='true';view.dataset.buiTagProperties='[]';
    let creates=0;native.addEventListener('click',()=>creates++);f.refresh();
    const footer=view.lastElementChild,button=footer.querySelector('button');
    assert.ok(footer.classList.contains('bui-ideas-new-row'));assert.equal(footer.previousElementSibling,container);
    assert.equal(creates,0);button.click();assert.equal(creates,1);
    view.dataset.viewName='重命名后的数据库';f.refresh();assert.equal(view.lastElementChild,footer);
    view.replaceChildren(container);await new Promise(resolve=>f.dom.window.setTimeout(resolve,0));
    assert.equal(view.lastElementChild,footer);assert.equal(footer.querySelector('button'),button);
    view.setAttribute('aria-readonly','true');button.click();assert.equal(creates,1);f.refresh();assert.equal(view.querySelector('.bui-ideas-new-row'),null);
    view.removeAttribute('aria-readonly');f.refresh();assert.ok(view.querySelector('.bui-ideas-new-row'));
    view.dataset.buiEnhancedTable='false';f.refresh();assert.equal(view.querySelector('.bui-ideas-new-row'),null);
    assert.equal(container.querySelector('.metadata-input-longtext').textContent,'条目一');
  }finally{f.close();}
});

test('legacy native idea DOM is retained as a fallback but an explicit opt-out wins',()=>{
  const f=fixture(table(text('note.标题','条目')));try{
    const view=f.doc.querySelector('.bases-view');view.dataset.viewName='想法收集箱';f.refresh();
    assert.ok(view.classList.contains('bui-ideas-base'));
    view.dataset.buiEnhancedTable='false';f.refresh();assert.equal(view.classList.contains('bui-ideas-base'),false);
    delete view.dataset.buiEnhancedTable;f.refresh();assert.ok(view.classList.contains('bui-ideas-base'));
  }finally{f.close();}
});

test('single-record tables hide the final create row without marking existing cells read-only',async()=>{
  const f=fixture('<div class="bases-embed"><div class="bases-header"><div class="bases-toolbar-new-item-menu"><button class="text-icon-button" role="button">原生新建</button></div></div>'+table('<div class="bases-table-container">'+text('note.标题','当前记录')+'</div>')+'</div>');
  try{
    const view=f.doc.querySelector('.bases-view');view.dataset.buiEnhancedTable='true';view.dataset.buiAllowCreate='false';
    const input=view.querySelector('[contenteditable]'),native=f.doc.querySelector('.text-icon-button');let creates=0;
    native.addEventListener('click',()=>creates++);f.refresh();
    assert.ok(view.classList.contains('bui-ideas-base'));assert.equal(view.querySelector('.bui-ideas-new-row'),null);
    assert.equal(input.getAttribute('contenteditable'),'true');assert.equal(view.hasAttribute('aria-readonly'),false);
    delete view.dataset.buiAllowCreate;f.refresh();const button=view.querySelector('.bui-ideas-new-button');assert.ok(button);
    view.dataset.buiAllowCreate='false';button.click();assert.equal(creates,0,'a stale footer cannot bypass the setting');
    await new Promise(resolve=>f.dom.window.setTimeout(resolve,0));assert.equal(view.querySelector('.bui-ideas-new-row'),null);
    delete view.dataset.buiAllowCreate;f.refresh();view.querySelector('.bui-ideas-new-button').click();assert.equal(creates,1);
  }finally{f.close();}
});
