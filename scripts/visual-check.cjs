// Verifies the offline real-app screenshot gallery, not Obsidian itself.
const {chromium}=require('playwright');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}: {})});const errors=[];
 try{
  for(const width of [320,393,1024]){
   const page=await browser.newPage({viewport:{width,height:852},colorScheme:width===1024?'light':'dark'});page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(resolve('docs/mobile-preview.html')).href);
   for(const surface of ['writing','library'])for(const theme of ['light','dark'])for(const viewport of ['320','393','1024']){
    await page.selectOption('#surface',surface);await page.selectOption('#theme',theme);await page.selectOption('#width',viewport);
    await page.waitForFunction(()=>{const i=document.querySelector('#preview');return i.complete&&i.naturalWidth>0;});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await page.close();console.log(`PASS gallery at ${width}px: all 12 captures loaded, no horizontal overflow`);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
