const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const m = {exports:{}};
const code = buildSync({entryPoints:['src/notion-rule-model.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
new Function('module','exports',code)(m,m.exports);
const {NotionRuleModel} = m.exports;
const formula = expression => ({type:'formula',formula:{expression}});
const sources = {
  book:{properties:{Entries:{type:'relation',relation:{data_source_id:'entries',dual_property:{synced_property_name:'Book'}}},
    Total:{type:'rollup',rollup:{function:'sum',relation_property_name:'Entries',rollup_property_name:'Net'}}}},
  entries:{properties:{Book:{type:'relation'},Amount:{type:'number'},Hold:{type:'number'},Status:{type:'select'},Date:{type:'date'},
    Net:formula('if(["paid", "cleared"].includes(prop("Status")), round(prop("Amount") * 100) / 100, 0)'),
    Month:formula('formatDate(prop("Date"), "YYYY-MM")'),
    Label:formula('lets(amount, prop("Amount"), ifs(prop("Hold") == 0, "zero", prop("Hold") < amount, "partial", style("other", "gray")))')}}
};
const book = {key:'book',source:'book',properties:{Entries:['one','one'],Total:999}};
const one = {key:'one',source:'entries',properties:{Book:['book'], Amount:12.34,Status:'paid',Date:'2026-11-01T00:01:00+08:00'}};
const model = (...rows) => new NotionRuleModel(sources,rows,ref=>ref);
test('live rollups follow unique links and new reverse-linked records without using stored formula snapshots',()=>{
  const two={key:'two',source:'entries',properties:{Book:['book'],Amount:5,Status:'paid',Net:10000}};
  assert.equal(model(book,one,two).get(book,'Total'),17.34);
  const changed={...one,properties:{...one.properties,Status:'pending'}};
  assert.equal(model(book,changed,two).get(book,'Total'),5);
  assert.equal(book.properties.Total,999);
});
test('missing linked rows and conflicting bidirectional edits are reported rather than omitted from totals',()=>{
  assert.throws(()=>model(book).get(book,'Total'),/未导入/);
  assert.throws(()=>model(book,{...one,properties:{...one.properties,Book:[]}}).get(book,'Total'),/关联不一致/);
});
test('Notion empty numeric comparisons differ from zero, source calendar dates keep their month',()=>{
  assert.equal(model(one).get(one,'Label'),'other');
  assert.equal(model(one).get(one,'Month'),'2026-11');
  const withHold={...one,properties:{...one.properties,Hold:0}};
  assert.equal(model(withHold).get(withHold,'Label'),'zero');
});
test('cycles, unsupported functions and invalid field references cannot be used to fabricate results',()=>{
  const row={key:'r',source:'custom',properties:{A:15}};
  const schema={custom:{properties:{A:formula('prop("B")'),B:formula('prop("A")'),C:formula('if(true, 1, unknown())'),D:formula('prop("unknown")')}}};
  const computed=new NotionRuleModel(schema,[row],ref=>ref);
  for(const f of computed.fields(row)) assert.ok(f.error);
});
