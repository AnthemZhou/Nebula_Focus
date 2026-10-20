// Capture only the shipped examples in an isolated test vault.
const c=require('./obsidian-client.cjs')(process.argv[2]);
const {resolve}=require('node:path');const {copyFileSync,readFileSync}=require('node:fs');
const version=JSON.parse(readFileSync('manifest.json','utf8')).version;
c.cli('dev:debug','on');
try{
 c.cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
 c.evaluate(`const p=app.plugins.plugins['nebula-focus'];p.settings.legacyPages=false;p.settings.homePath='Home.md';await p.saveSettings(true);p.setPaused(false);for(const m of [...p.dialogs])m.close();app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();window.__nfCaptureTheme=app.vault.getConfig('theme');`);
 for(const theme of ['light','dark'])for(const width of [320,393,1024]){
  c.cdp('Emulation.setDeviceMetricsOverride',{width,height:852,deviceScaleFactor:1,mobile:false});
  c.evaluate(`app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');app.updateTheme();`);
  for(const surface of ['writing','library']){
   c.evaluate(`const p=app.plugins.plugins['nebula-focus'],file=app.vault.getAbstractFileByPath('${surface==='writing'?'Home.md':'阅读资料库.base'}');if(!file)throw Error('Missing shipped example');await p.openFile(file);await new Promise(r=>setTimeout(r,300));const view=app.workspace.getMostRecentLeaf().view;if('${surface}'==='writing'){view.editor.setCursor({line:2,ch:0});view.editor.focus();view.editor.scrollTo(0,0);}else if(!view.containerEl.querySelector('.bases-view'))throw Error('Bases not enabled');`);
   c.cli('dev:screenshot',`path=${resolve(`docs/ui-${version}-${surface}-${theme}-${width}.png`)}`);
  }
 }
 for(const surface of ['writing','library'])copyFileSync(`docs/ui-${version}-${surface}-light-1024.png`,`docs/ui-${version}-${surface}-light.png`);
}finally{
 c.cdp('Emulation.clearDeviceMetricsOverride');
 c.evaluate(`app.changeTheme(window.__nfCaptureTheme);app.updateTheme();await app.plugins.plugins['nebula-focus'].openHome();`);
 c.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});c.cli('dev:debug','off');
}
console.log(`Captured 12 real Obsidian example screens for ${version}`);
