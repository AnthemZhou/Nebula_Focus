const {chromium}=require('playwright');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const {mkdirSync,readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const version=JSON.parse(readFileSync('manifest.json','utf8')).version;

// Tests the interactive demo in a real browser, not Obsidian or an iOS device.
(async()=>{
  mkdirSync('test-results',{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}: {})});
  const errors=[];
  try{
    for(const width of [320,393,1024]){
      const page=await browser.newPage({viewport:{width,height:852},colorScheme:width===1024?'light':'dark',hasTouch:width<600,isMobile:width<600});
      page.on('pageerror',error=>errors.push(`${width}px: ${error.message}`));
      try{
        await page.goto(pathToFileURL(resolve(`docs/mobile-preview-${version}.html`)).href);
        await page.waitForSelector('.nf-card');
        assert.equal(await page.locator('.mobile-navbar').isVisible(),false);
        assert.equal(await page.locator('.view-content').isVisible(),false,'native content must be hidden once the replacement page is mounted');
        assert.equal(await page.locator('.nf-cover').isVisible(),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.equal(await page.locator('.nf-page-heading h1').textContent(),'我的创作空间');
        assert.equal(await page.locator('.nf-card').count(),2);
        if(width===393)await page.screenshot({path:`test-results/page-${version}.png`});

        const paragraph=page.locator('.nf-section-body p').filter({hasText:'让每次灵感'});
        await paragraph.scrollIntoViewIfNeeded();
        const geometry=element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return {x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,lineHeight:s.lineHeight};};
        const before=await paragraph.evaluate(geometry);
        await paragraph.click();
        const editor=page.getByRole('textbox',{name:'编辑当前文字块',exact:true});
        const after=await editor.evaluate(geometry);
        for(const key of ['x','y','width','height'])assert(Math.abs(before[key]-after[key])<1,`${width}px: entering edit changed ${key}`);
        assert.equal(after.font,before.font);assert.equal(after.lineHeight,before.lineHeight);
        assert.equal(await page.locator('[contenteditable="true"]').count(),1);
        assert.equal(await editor.evaluate(element=>element.tagName),'P');
        if(width===393)await page.screenshot({path:`test-results/page-${version}-editing.png`});
        await editor.fill('浏览器测试保存。');
        await page.getByRole('button',{name:'完成',exact:true}).click();
        await page.waitForSelector('.nf-block-editor',{state:'detached'});
        const saved=await page.evaluate(()=>window.demo.host.leaf.view.file.text);
        assert(saved.includes('## 想法收集箱\n\n浏览器测试保存。'));
        assert(saved.includes('点击这段文字可以直接修改。长按分区或使用手柄，可以调整顺序。'));

        await page.locator('.nf-section-body p').filter({hasText:'浏览器测试保存。'}).click();
        await page.getByRole('button',{name:'文字样式',exact:true}).click();
        await page.getByRole('button',{name:'三级标题',exact:true}).waitFor();
        if(width===393)await page.screenshot({path:`test-results/page-${version}-style-menu.png`});
        await page.getByRole('button',{name:'三级标题',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.nf-block-editor')?.tagName==='H3');
        assert.equal(await editor.textContent(),'浏览器测试保存。');
        assert((await page.evaluate(()=>window.demo.host.leaf.view.file.text)).includes('### 浏览器测试保存。'));

        await page.getByRole('button',{name:'文字样式',exact:true}).click();
        await page.getByRole('button',{name:'撤销 · ⌘/Ctrl Z',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.nf-block-editor')?.tagName==='P');
        assert.equal(await page.evaluate(()=>window.demo.host.leaf.view.file.text),saved);
        await editor.press('Control+Shift+z');
        await page.waitForFunction(()=>document.querySelector('.nf-block-editor')?.tagName==='H3');
        await editor.press('Control+z');
        await page.waitForFunction(()=>document.querySelector('.nf-block-editor')?.tagName==='P');
        assert.equal(await page.evaluate(()=>window.demo.host.leaf.view.file.text),saved);
        await page.getByRole('button',{name:'完成',exact:true}).click();
        await page.waitForSelector('.nf-block-editor',{state:'detached'});

        await page.getByRole('button',{name:'页面外观',exact:true}).click();
        await page.getByRole('button',{name:'双栏 35 / 65（宽屏）',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.nf-section-grid').dataset.columns==='2');
        const columns=await page.locator('.nf-section-grid').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length);
        assert.equal(columns,width<650?1:2);
        await page.getByRole('button',{name:'页面外观',exact:true}).click();
        await page.getByRole('button',{name:'封面与裁切',exact:true}).click();
        await page.locator('.nf-cover-presets button').filter({hasText:'暮色山峦'}).click();
        await page.waitForSelector('.nf-cover-dialog',{state:'detached'});
        assert((await page.evaluate(()=>window.demo.host.leaf.view.file.text)).includes('暮色山峦.svg'));
        await page.getByRole('button',{name:'更多',exact:true}).click();
        await page.getByRole('button',{name:'显示原界面和全部工具',exact:true}).click();
        assert.equal(await page.locator('.nf-page').count(),0);
        assert.equal(await page.locator('.mobile-navbar').isVisible(),true);
        await page.getByRole('button',{name:'恢复简洁界面',exact:true}).click();
        await page.waitForSelector('.nf-card');await page.locator('.nf-card').first().click();
        await page.waitForFunction(()=>window.demo.host.leaf.view.file.path==='项目/典籍里的中国.md');
        console.log(`PASS: ${width}px demo — stable leaf geometry, save, format menu, undo/redo, layout, cover, restore, linked cards`);
      }finally{await page.close();}
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS: Nebula Focus ${version} interactive demo at 320/393/1024px; no browser errors.`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
