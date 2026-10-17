const {chromium}=require('playwright');const {resolve}=require('node:path');const {mkdirSync}=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 mkdirSync('test-results',{recursive:true});const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--no-zygote','--disable-gpu','--single-process']}: {})});const errors=[];
 for(const width of [320,393,1024]){
  const page=await browser.newPage({viewport:{width,height:852},colorScheme:width===1024?'light':'dark',hasTouch:width<600,isMobile:width<600});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+resolve('docs/mobile-preview.html'));await page.waitForSelector('.nf-card');
  assert.equal(await page.locator('.mobile-navbar').isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('.nf-page-heading h1').textContent(),'我的创作空间');assert.equal(await page.locator('.nf-card').count(),2);
  if(width===393)await page.screenshot({path:'test-results/page-060.png'});
  await page.locator('.nf-section-body p').filter({hasText:'让每次灵感'}).click();await page.getByRole('textbox',{name:'编辑当前分区'}).fill('## 想法收集箱\n\n浏览器测试保存。');await page.getByRole('button',{name:'完成',exact:true}).click();
  await page.getByText('浏览器测试保存。',{exact:true}).waitFor();assert((await page.evaluate(()=>window.demo.host.leaf.view.file.text)).includes('浏览器测试保存。'));
  await page.getByRole('button',{name:'页面外观',exact:true}).click();await page.getByRole('button',{name:'双栏 35 / 65（宽屏）',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.nf-section-grid').dataset.columns==='2');
  const columns=await page.locator('.nf-section-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(columns,width<650?1:2);
  await page.getByRole('button',{name:'页面外观',exact:true}).click();await page.getByRole('button',{name:'封面与裁切',exact:true}).click();await page.locator('.nf-cover-presets button').filter({hasText:'暮色山峦'}).click();await page.waitForSelector('.nf-cover-dialog',{state:'detached'});
  assert((await page.evaluate(()=>window.demo.host.leaf.view.file.text)).includes('暮色山峦.svg'));
  await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('button',{name:'显示原界面和全部工具',exact:true}).click();assert.equal(await page.locator('.nf-page').count(),0);assert.equal(await page.locator('.mobile-navbar').isVisible(),true);
  await page.getByRole('button',{name:'恢复简洁界面',exact:true}).click();await page.waitForSelector('.nf-card');await page.locator('.nf-card').first().click();await page.waitForFunction(()=>window.demo.host.leaf.view.file.path==='项目/典籍里的中国.md');
  await page.close();
 }
 await browser.close();assert.deepEqual(errors,[]);console.log('PASS: 320/393/1024px, cover, inline edit, persisted layout, responsive columns, restore, linked cards; no browser errors.');
})().catch(e=>{console.error(e);process.exit(1)});
