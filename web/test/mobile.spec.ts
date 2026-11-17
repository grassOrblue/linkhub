import { test, expect } from '@playwright/test';
test.beforeAll(async({request})=>{
 const r=await request.post('/api/admin/stores',{data:{name:'手机端测试门店',dianping_shop_uuid:'own-shop'}});const {id}=await r.json();
 await request.post('/api/admin/pages',{data:{uuid:'mobile-test',store_id:id,title:'分享美好'}});
});
test('手机宽度呈现全部六个渠道且不溢出',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/p/mobile-test');await expect(page.locator('[data-channel]')).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);await page.screenshot({path:'.tmp/mobile-preview.png',fullPage:true});
});
test('微信内点击仅引导，不请求 redirect',async({browser})=>{
 const context=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone) MicroMessenger/8.0',viewport:{width:390,height:844}});const page=await context.newPage();let calls=0;page.on('request',r=>{if(r.url().includes('/api/redirect'))calls++;});await page.goto('/p/mobile-test');await page.locator('[data-channel="big_three_people_punch"]').click();await expect(page.getByRole('heading',{name:'请在浏览器中打开'})).toBeVisible();expect(calls).toBe(0);await context.close();
});
for(const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)','Mozilla/5.0 (Linux; Android 14) Chrome/130.0'])test(`点评弹层与复制 ${ua.includes('iPhone')?'iOS':'Android'}`,async({browser})=>{
 const context=await browser.newContext({userAgent:ua,viewport:{width:390,height:844}});const page=await context.newPage();await page.addInitScript(()=>{(window as any).copyCalls=0;document.execCommand=(command)=>{if(command==='copy')(window as any).copyCalls++;return true;};Object.defineProperty(navigator,'clipboard',{value:undefined});});
 await page.route('**/api/redirect',r=>r.fulfill({json:{status:1,scheme:'dianping://shopinfo?shopuuid=own-shop',content:'测试文案',picData:['/test.jpg']}}));await page.goto('/p/mobile-test');await page.locator('[data-channel="big_three_people_punch"]').click();await expect(page.getByRole('dialog',{name:'准备分享'})).toBeVisible();expect(await page.evaluate(()=>(window as any).copyCalls)).toBe(ua.includes('iPhone')?0:1);await page.getByRole('button',{name:'一键复制'}).click();await expect(page.getByRole('button',{name:'打开大众点评收藏'})).toBeVisible();expect(await page.evaluate(()=>(window as any).copyCalls)).toBe(ua.includes('iPhone')?1:2);await context.close();
});
test('后台导航、门店筛选和上传表单可用，手机宽度不溢出',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/admin');await page.getByRole('button',{name:'进入 / 刷新'}).click();await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
 await page.getByRole('navigation',{name:'后台功能'}).getByRole('button',{name:'素材管理'}).click();await expect(page.getByLabel('选择素材')).toBeVisible();await page.getByLabel('筛选门店').selectOption({label:'手机端测试门店'});await page.getByLabel('上传到门店').selectOption({label:'手机端测试门店'});
 await page.getByLabel('选择素材').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a52sAAAAASUVORK5CYII=','base64')});await page.getByRole('button',{name:'上传并入库'}).click();await expect(page.getByRole('status').first()).toContainText(/新增 [01] 个，重复 [01] 个/);await expect(page.locator('.asset-grid img').first()).toBeVisible();
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'.tmp/admin-desktop-preview.png',fullPage:true});await page.setViewportSize({width:390,height:844});
 await page.getByRole('navigation').getByRole('button',{name:'页面与二维码'}).click();await expect(page.getByRole('heading',{name:'分享页面与二维码'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);await page.screenshot({path:'.tmp/admin-mobile-preview.png',fullPage:true});
});
test('小红书 SDK 按钮复制顾客修改后的文案',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:undefined});document.execCommand=()=>{(window as any).lastCopied=(document.activeElement as HTMLTextAreaElement)?.value;return true;};(window as any).sdkCalls=0;(window as any).xhs={share:()=>{(window as any).sdkCalls++;}};});
 await page.route('**/api/page/mobile-test',async r=>{const response=await r.fetch();const data=await response.json();data.enabled.redbook_ic_publish.missing=[];await r.fulfill({json:data});});
 await page.route('**/api/redirect',r=>r.fulfill({json:{status:1,scheme:'',ext:{content:'原始SDK文案',images:[],appKey:'test',nonce:'test',timestamp:'1',signature:'test'}}}));
 await page.goto('/p/mobile-test');await page.locator('[data-channel="redbook_ic_publish"]').click();await page.getByRole('textbox',{name:'分享文案'}).fill('修改后的SDK分享内容');await page.getByRole('button',{name:'复制文案并分享到小红书'}).click();expect(await page.evaluate(()=>(window as any).lastCopied)).toBe('修改后的SDK分享内容');expect(await page.evaluate(()=>(window as any).sdkCalls)).toBe(1);
});
test('编辑后的分享文案用于复制且不回写素材文案接口',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:undefined});document.execCommand=()=>{(window as any).lastCopied=(document.activeElement as HTMLTextAreaElement)?.value;return true;};});
 await page.route('**/api/redirect',r=>r.fulfill({json:{status:1,scheme:'',content:'原始文案',picData:[],manual:true}}));await page.goto('/p/mobile-test');await page.locator('[data-channel="redbook_ic_publish"]').click();
 await page.getByRole('textbox',{name:'分享文案'}).fill('我编辑后的真实体验');await page.getByRole('button',{name:'一键复制'}).click();expect(await page.evaluate(()=>(window as any).lastCopied)).toBe('我编辑后的真实体验');
 await page.getByRole('textbox',{name:'分享文案'}).fill('');await page.getByRole('button',{name:'一键复制'}).click();await expect(page.getByRole('dialog').getByRole('status')).toHaveText('请先填写文案');
});
