import { beforeAll, afterAll, test, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
const dir=mkdtempSync(join(tmpdir(),'linkhub-test-'));
process.env.DATA_DIR=join(dir,'data');process.env.MEDIA_DIR=join(dir,'media');process.env.PUBLIC_BASE_URL='https://share.example.com';process.env.ADMIN_TOKEN='test-admin-token-for-integration';
delete process.env.DEEPSEEK_API_KEY;
let db:any,app:any,copy:any,platform:any,server:Server,base:string;
const request=async(path:string,body?:any,auth=true,method?:string)=>{const response=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:`Bearer ${process.env.ADMIN_TOKEN}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json().catch(()=>null)};};
beforeAll(async()=>{
 db=await import('../src/db.ts');app=(await import('../src/app.ts')).app;copy=await import('../src/copy.ts');platform=await import('../src/platforms.ts');
 server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
 db.run("INSERT INTO stores(id,name,dianping_shop_uuid,brand_brief) VALUES(1,'测试门店','G82hLbsWHbzzS7jo','门店信息请咨询店员')");
 db.run("INSERT INTO pages(uuid,store_id,title) VALUES('test-page',1,'分享美好')");
});
afterAll(async()=>{vi.unstubAllGlobals();await new Promise<void>(r=>server.close(()=>r()));db.db.close();rmSync(dir,{recursive:true,force:true});});
test('抖音 H5 签名固定向量和 EVIDENCE 参数编码',()=>{
 const scheme=platform.douyinScheme({clientKey:'own-key',ticket:'@ml6sqYBGgTKmQNajnKNkaj8yksCAY++adIhlGIqfTiKyvBqOIkzdJ6WRgP+nO+wtVItqKbX4iZ+mFIYkyPJjpQ==',nonce:'Wm3WZYTPz0wzccnW',timestamp:'1650941858',state:'test-share',video:'https://media.example.com/烤鸭.mp4?a=1&b=2',title:'来吃饭 #烤鸭',hashtags:['烤鸭'],poi:'6816965329281910798'});
 const u=new URL(scheme);expect(u.protocol).toBe('snssdk1128:');expect(u.searchParams.get('signature')).toBe('3f7b739a91a52cb7d85c4f89c5f611fe');expect(u.searchParams.get('share_to_publish')).toBe('1');expect(u.searchParams.get('video_path')).toContain('?a=1&b=2');expect(JSON.parse(u.searchParams.get('title_hashtag_list')!)).toEqual([{name:'烤鸭',start:4}]);expect(u.searchParams.has('image_path')).toBe(true);
});
test('小红书两次签名使用 timeStamp 大小写与原文排序',()=>{const expected=createHash('sha256').update('appKey=123&nonce=nonce&timeStamp=1692102691696test').digest('hex');expect(platform.xhsSignature('123','nonce','1692102691696','test')).toBe(expected);expect(platform.xhsSignature('123','nonce','1692102691696','token')).not.toBe(expected);});
test('快手 OAuth scope、不可猜测 state；小程序不借用参考站 ID',()=>{
 process.env.KUAISHOU_APP_ID='own-app';process.env.XHS_MINIAPP_ID='own-mini';
 const u=new URL(platform.authorizeUrl('random-session'));expect(u.searchParams.get('state')).toBe('random-session');expect(u.searchParams.get('scope')).toContain('user_video_publish');expect(u.searchParams.get('redirect_uri')).toBe('https://share.example.com/api/kuaishou/callback');
 const mini=new URL(platform.miniappScheme('test-page','员工 A','session'));expect(mini.pathname).toContain('own-mini');expect(mini.searchParams.get('staff_uuid')).toBe('员工 A');expect(mini.searchParams.get('session')).toBe('session');delete process.env.XHS_MINIAPP_ID;
});
test('无素材返回 status:0，缺资质返回明确错误，不生成伪 scheme',async()=>{
 expect((await request('/api/redirect',{uuid:'test-page',key:'pyq_publish'})).data).toEqual({status:0});
 expect((await request('/api/redirect',{uuid:'test-page',key:'douyin_publish'})).data.message).toContain('未配置');
 expect((await request('/api/redirect',{uuid:'test-page',key:'unknown'})).status).toBe(400);
});
test('点评/朋友圈响应与 EVIDENCE 对齐，素材跨门店隔离、最久未用优先',async()=>{
 for(let i=0;i<4;i++) db.run('INSERT INTO assets(store_id,kind,rel_path,content_hash,status,last_used_at) VALUES(?,?,?,?,1,?)',1,'image',`1/image/${i}.jpg`,`hash${i}`,i===3?Date.now():0);
 const dianping=(await request('/api/redirect',{uuid:'test-page',key:'big_three_people_punch'})).data;
 expect(dianping.scheme).toBe('dianping://shopinfo?shopuuid=G82hLbsWHbzzS7jo');expect(dianping.picData).toHaveLength(3);expect(dianping.picData.some((p:string)=>p.endsWith('/3.jpg'))).toBe(false);
 const moments=(await request('/api/redirect',{uuid:'test-page',key:'pyq_publish'})).data;expect(moments.scheme).toBe('');expect(moments.picData).toHaveLength(3);
});
test('后台鉴权、输入校验、停用渠道与无效 OAuth state',async()=>{
 expect((await request('/api/admin/state',undefined,false)).status).toBe(401);
 expect((await request('/api/admin/stores',{name:''})).status).toBe(400);
 expect((await request('/api/admin/pages',{store_id:1,enabled:{unknown:1}})).status).toBe(400);
 await request('/api/admin/pages',{uuid:'disabled-page',store_id:1,enabled:{pyq_publish:0}});
 expect((await request('/api/redirect',{uuid:'disabled-page',key:'pyq_publish'})).data.message).toContain('停用');
 expect((await request('/api/kuaishou/callback?code=fake&state=guess')).status).toBe(400);
});
test('42条七天文案：hash、3-gram与标题去重都通过',async()=>{
 const result=await copy.generate(1,42);expect(result.added).toBe(42);
 const rows=db.all('SELECT * FROM copies WHERE store_id=1');expect(new Set(rows.map((r:any)=>r.content_hash)).size).toBe(42);
 for(let i=0;i<rows.length;i++)for(let j=0;j<i;j++){expect(copy.jaccard(rows[i].content,rows[j].content)).toBeLessThanOrEqual(.82);expect(copy.titleSimilarity(rows[i].title,rows[j].title)).toBeLessThanOrEqual(.9);}
},20000);
test('每日生成幂等，文案消费计数，页面不泄露密钥',async()=>{
 expect((await copy.generate(1,6,true)).added).toBe(0);const c=copy.pickCopy(1,'douyin_publish');expect(db.one('SELECT used_count FROM copies WHERE id=?',c.id).used_count).toBe(1);
 const page=(await request('/api/page/test-page')).data;expect(page.enabled.pyq_publish.enabled).toBe(true);expect(JSON.stringify(page)).not.toContain('test-admin-token');
});
test('已配置抖音/小红书接口完成双签名并保留 SDK 参数，不泄露 token',async()=>{
 process.env.DOUYIN_CLIENT_KEY='own-key';process.env.DOUYIN_SHARE_TICKET='test-ticket';process.env.XHS_APP_KEY='own-xhs';process.env.XHS_APP_SECRET='private-secret';
 const nativeFetch=globalThis.fetch;let exchanges=0;
 vi.stubGlobal('fetch',async(input:any,init:any)=>{
  if(String(input).startsWith('https://edith.xiaohongshu.com/')) {exchanges++;return new Response(JSON.stringify({success:true,data:{access_token:'temporary-token',expires_in:Date.now()+3600000}}));}
  return nativeFetch(input,init);
 });
 try {
  db.run("INSERT INTO assets(store_id,kind,rel_path,content_hash,status,cover_rel_path) VALUES(1,'video','1/video/test.mp4','video-hash',1,'1/covers/test.jpg')");
  const dy=(await request('/api/redirect',{uuid:'test-page',key:'douyin_publish'})).data;expect(new URL(dy.scheme).searchParams.get('client_key')).toBe('own-key');
  for(const key of ['redbook_publish','redbook_ic_publish']) {const xhs=(await request('/api/redirect',{uuid:'test-page',key})).data;expect(xhs.ext.signature).toBe(platform.xhsSignature('own-xhs',xhs.ext.nonce,xhs.ext.timestamp,'temporary-token'));expect(xhs.ext.appKey).toBe('own-xhs');expect(JSON.stringify(xhs)).not.toContain('temporary-token');}
  expect(exchanges).toBe(1);
 } finally {vi.unstubAllGlobals();delete process.env.DOUYIN_CLIENT_KEY;delete process.env.DOUYIN_SHARE_TICKET;delete process.env.XHS_APP_KEY;delete process.env.XHS_APP_SECRET;}
});
test('快手回调上传、受理状态、重放保护和过期 state',async()=>{
 process.env.KUAISHOU_APP_ID='own-app';process.env.KUAISHOU_APP_SECRET='own-secret';
 mkdirSync(join(dir,'media','1','video'),{recursive:true});mkdirSync(join(dir,'media','1','covers'),{recursive:true});writeFileSync(join(dir,'media','1','video','test.mp4'),Buffer.from('fake video'));writeFileSync(join(dir,'media','1','covers','test.jpg'),Buffer.from('fake cover'));
 const nativeFetch=globalThis.fetch;let publishes=0;
 vi.stubGlobal('fetch',async(input:any,init:any)=>{
  const url=String(input);
  if(url.includes('open.kuaishou.com/oauth2/access_token'))return new Response(JSON.stringify({result:1,access_token:'private-token',scopes:['user_video_publish']}));
  if(url.includes('/photo/start_upload'))return new Response(JSON.stringify({result:1,upload_token:'upload-token',endpoint:'upload.gifshow.com'}));
  if(url.includes('upload.gifshow.com'))return new Response(JSON.stringify({result:1}));
  if(url.includes('/photo/publish')) {publishes++;return new Response(JSON.stringify({result:1,video_info:{photo_id:'test-photo',pending:true}}));}
  return nativeFetch(input,init);
 });
 try {
  const start=(await request('/api/redirect',{uuid:'test-page',key:'kwai_publish'})).data;const state=new URL(start.scheme).searchParams.get('state');expect(state).toMatch(/^[a-f0-9]{32}$/);
  for(let i=0;i<2;i++) {const response=await fetch(`${base}/api/kuaishou/callback?code=code&state=${state}`,{redirect:'manual'});expect(response.status).toBe(302);}
  expect(publishes).toBe(1);const job=(await request(`/api/jobs/${state}`)).data;expect(job.status).toBe('submitted');expect(job.result).not.toContain('private-token');
  db.run('UPDATE oauth_jobs SET expires=0 WHERE state=?',state);expect((await fetch(`${base}/api/kuaishou/callback?code=code&state=${state}`)).status).toBe(400);
 } finally {vi.unstubAllGlobals();delete process.env.KUAISHOU_APP_SECRET;delete process.env.KUAISHOU_APP_ID;}
});
test('扫描器在 Windows 临时目录的短路径别名下仍登记素材',async()=>{
 const folder=join(dir,'media','1','image');mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'path-check.jpg'),'invalid-image-fixture');
 const {scan}=await import('../src/media.ts');await scan();
 const row=db.one("SELECT * FROM assets WHERE rel_path='1/image/path-check.jpg'");
 expect(row).toBeTruthy();expect([0,2]).toContain(row.status);
});
test('上传接口受鉴权保护，拒绝越界文件名、伪装内容和超大文件',async()=>{
 const url=base+'/api/admin/assets/upload?store_id=1&filename=photo.png';
 expect((await fetch(url,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:'test'})).status).toBe(401);
 const headers={'Content-Type':'application/octet-stream',Authorization:`Bearer ${process.env.ADMIN_TOKEN}`};
 for(const filename of ['../../bad.png','script.svg','page.html']) {
  expect((await fetch(base+'/api/admin/assets/upload?'+new URLSearchParams({store_id:'1',filename}),{method:'POST',headers,body:'test'})).status).toBe(400);
 }
 expect((await fetch(url,{method:'POST',headers,body:'<html>not an image</html>'})).status).toBe(400);
 const status=await new Promise<number>(resolve=>{const req=httpRequest(url,{method:'POST',headers:{...headers,'Content-Length':String(10*1024*1024+1)}},res=>{res.resume();resolve(res.statusCode!);req.destroy();});req.on('error',()=>{});req.end();});
 expect(status).toBe(413);
 const {readdirSync}=await import('node:fs');expect(readdirSync(join(dir,'media','.incoming'))).toEqual([]);
});
test('图片上传自动登记、重复上传不增副本、相同素材允许归属不同门店',async()=>{
 const media=await import('../src/media.ts'),probe=vi.spyOn(media,'probeFile').mockResolvedValue({codec_name:'png',width:1,height:1,duration_ms:0});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a52sAAAAASUVORK5CYII=','base64');
 const upload=async(storeId:number)=>{const response=await fetch(base+'/api/admin/assets/upload?'+new URLSearchParams({store_id:String(storeId),filename:'photo.png'}),{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:`Bearer ${process.env.ADMIN_TOKEN}`},body:png});return {status:response.status,data:await response.json() as any};};
 try {
  const first=await upload(1);expect(first.status).toBe(200);expect(first.data.duplicate).toBe(false);expect(first.data.asset.rel_path).toMatch(/^1\/image\/[a-f0-9-]+\.png$/);
  const again=await upload(1);expect(again.data.duplicate).toBe(true);expect(again.data.asset.id).toBe(first.data.asset.id);
  db.run("INSERT INTO stores(id,name) VALUES(2,'另一门店')");const second=await upload(2);expect(second.data.asset.store_id).toBe(2);expect(second.data.duplicate).toBe(false);
  expect(db.all('SELECT * FROM assets WHERE content_hash=?',first.data.asset.content_hash)).toHaveLength(2);
 } finally {probe.mockRestore();}
});
