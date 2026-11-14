const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const loaded={exports:{}};
new Function('module','exports',buildSync({entryPoints:['src/table-profile.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text)(loaded,loaded.exports);
const {tableProfile,tableTitleProfiles}=loaded.exports;
const profile=()=>({titleColumn:'formula.流水',titleProperty:'流水摘要',tags:{交易类型:'single',项目:'multi'},wrap:true,attachments:['凭证'],scopeNote:'仅筛选后的示例记录'});

test('native and serialized table configs return independent, defensive profiles',()=>{
  const raw=profile();
  for (const input of [{nebulaTable:raw},{name:'收支流水',get:key=>key==='nebulaTable'?raw:undefined},{config:{name:'项目',nebulaTable:raw}}]) {
    const actual=tableProfile(input);assert.equal(actual.titleColumn,raw.titleColumn);assert.equal(actual.titleProperty,raw.titleProperty);
    assert.deepEqual({...actual.tags},raw.tags);assert.deepEqual(actual.attachments,['凭证']);assert.equal(actual.scopeNote,raw.scopeNote);
    actual.tags['新增']='single';actual.attachments.push('媒体');assert.equal(raw.tags['新增'],undefined);assert.deepEqual(raw.attachments,['凭证']);
  }
});

test('legacy idea inbox is supported but arbitrary native views are untouched',()=>{
  const actual=tableProfile({config:{name:'想法收集箱'}});
  assert.equal(actual.titleColumn,'formula.想法');assert.equal(actual.titleProperty,'这里写想法');assert.equal(actual.wrap,true);
  assert.deepEqual({...actual.tags},{领域:'multi',类型:'single',重要性:'single'});assert.deepEqual(actual.attachments,['文件和媒体']);
  assert.equal(tableProfile({name:'普通表格'}),null);assert.equal(tableProfile({name:'想法收集箱',nebulaTable:false}),null);
});

test('view description overrides nested metadata without mutating it, including deliberate empty descriptions',()=>{
  const raw=profile();
  for(const override of ['自己的说明','',null,42]) {
    const config={nebulaTable:raw,nebulaScopeNote:override};
    const expected=typeof override==='string'?override:raw.scopeNote;
    for(const input of [config,{config},{get:key=>config[key]}]) assert.equal(tableProfile(input).scopeNote,expected);
  }
  assert.equal(raw.scopeNote,'仅筛选后的示例记录');
  for(const input of [{name:'想法收集箱',nebulaScopeNote:'收集想法'},
    {name:'想法收集箱',get:key=>key==='nebulaScopeNote'?'收集想法':undefined}])
    assert.equal(tableProfile(input).scopeNote,'收集想法');
  assert.equal(Object.hasOwn(tableProfile({name:'想法收集箱'}),'scopeNote'),false);
  assert.equal(tableProfile({name:'普通表格',nebulaScopeNote:'不得自动启用'}),null);
});

test('invalid profiles and initializing native getters defer safely without partial opt-in',()=>{
  for (const value of [null,42,[],{config:{get(){throw Error('initializing');}}},
    ...[{titleColumn:''},{titleProperty:1},{tags:{领域:'relation'}},{wrap:'true'},{attachments:['']},{scopeNote:3}]
      .map(patch=>({nebulaTable:{...profile(),...patch}}))]) assert.equal(tableProfile(value),null);
});

test('tag opt-in maps have no inherited property names, including legacy profiles',()=>{
  for (const actual of [tableProfile({nebulaTable:profile()}),tableProfile({name:'想法收集箱'})]) {
    assert.equal(actual.tags.constructor,undefined);assert.equal(actual.tags.toString,undefined);assert.equal(actual.tags.__proto__,undefined);
  }
  const raw=profile();raw.tags=JSON.parse('{"__proto__":"single","constructor":"multi"}');
  const actual=tableProfile({nebulaTable:raw});assert.equal(Object.getPrototypeOf(actual.tags),null);
  assert.equal(actual.tags.__proto__,'single');assert.equal(actual.tags.constructor,'multi');
});

test('native file-name titles opt into interactions without enabling richer table presentation',()=>{
  for(const input of [{name:'发布记录',order:['file.name','note.内容类型']},{config:{name:'按平台分组',getOrder:()=>['file.name','note.内容类型']}}]){
    assert.equal(tableProfile(input),null);
    assert.deepEqual(tableTitleProfiles(input),[{titleColumn:'file.name',titleProperty:'',kind:'filename'}]);
  }
  assert.deepEqual(tableTitleProfiles({name:'原生默认'}),[{titleColumn:'file.name',titleProperty:'',kind:'filename'}]);
  assert.deepEqual(tableTitleProfiles({name:'只显示普通文本',order:['note.视频名称','note.备注']}),[]);
  assert.deepEqual(tableTitleProfiles({name:'失败配置',order:42}),[]);
});

test('only explicitly declared or reversible current-record title formulas are editable',()=>{
  const expressions={
    Source:'link(file.path, if(note["视频名称"], note["视频名称"], file.name))',
    Native:{text:'file.asLink(note["标题"])'},
    Filename:{text:'file.asLink(file.name)'},
    Other:'link(note["关联路径"], note["视频名称"])',
    Derived:'link(file.path, note["数量"] + " 次")',
    Mismatch:'link(file.path, if(note["A"], note["B"], file.name))',
    Function:{toString(){throw Error('Do not invoke custom conversion');}},
  };
  const input={config:{name:'自定义',query:{formulas:expressions},getOrder:()=>Object.keys(expressions).map(x=>'formula.'+x)}};
  assert.deepEqual(tableTitleProfiles(input),[
    {titleColumn:'formula.Source',titleProperty:'视频名称',kind:'property'},
    {titleColumn:'formula.Native',titleProperty:'标题',kind:'property'},
    {titleColumn:'formula.Filename',titleProperty:'',kind:'filename'},
  ]);
  assert.equal(tableProfile(input),null);
  assert.deepEqual(tableTitleProfiles({name:'显式原生属性',titleProperty:'note.视频名称',order:['note.视频名称','note.备注']}),
    [{titleColumn:'note.视频名称',titleProperty:'视频名称',kind:'property'}]);
  assert.deepEqual(tableTitleProfiles({name:'不得假设',titleProperty:'file.name',order:['note.视频名称']}),[]);
});

test('title resolution honors visible columns, invalid explicit profiles and initializing getters without mutating configuration',()=>{
  const mapped={nebulaTable:profile(),order:['formula.流水','note.流水摘要','file.name']};
  const before=JSON.stringify(mapped);
  assert.deepEqual(tableTitleProfiles(mapped).map(x=>x.titleColumn),['formula.流水','file.name']);
  assert.equal(JSON.stringify(mapped),before);
  assert.deepEqual(tableTitleProfiles({config:mapped,data:{properties:['file.name']}}),[{titleColumn:'file.name',titleProperty:'',kind:'filename'}]);
  assert.deepEqual(tableTitleProfiles({...mapped,nebulaTable:false}),[]);
  assert.deepEqual(tableTitleProfiles({get(){throw Error('initializing');}}),[]);
  const unsafe='link(file.path, note["标题"]); globalThis.titleExecuted = true';
  assert.deepEqual(tableTitleProfiles({name:'formula',order:['formula.X'],formulas:{X:unsafe}}),[]);
  assert.equal(globalThis.titleExecuted,undefined);
});
