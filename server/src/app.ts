import express from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import { config } from './config.ts';
import { all, one, run, transaction, mediaUrl } from './db.ts';
import { scan, pick, assetView } from './media.ts';
import { uploadAsset } from './upload.ts';
import { generate, pickCopy } from './copy.ts';
import { keys, missing, douyinScheme, douyinTicket, xhsConfig, miniappScheme, authorizeUrl, publishKwai } from './platforms.ts';
export const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'64kb'}));
app.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});next();});
app.use('/media',express.static(config.media,{dotfiles:'deny',index:false}));
const requirePage=(uuid:any)=>{if(typeof uuid!=='string'||uuid.length>100) throw Error('页面标识无效');const p=one('SELECT * FROM pages WHERE uuid=?',uuid);if(!p) throw Error('页面不存在');return p;};
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.get('/api/page/:uuid',(req,res)=>{
 const page=requirePage(req.params.uuid),store=one('SELECT * FROM stores WHERE id=?',page.store_id),enabled=JSON.parse(page.enabled_json);
 const availability=Object.fromEntries(keys.map(k=>[k,{enabled:enabled[k]!==0,missing:missing(k,store)}]));
 res.json({page,store,enabled:availability,assets:{videos:all("SELECT * FROM assets WHERE store_id=? AND kind='video' AND status=1",store.id).map(assetView),images:all("SELECT * FROM assets WHERE store_id=? AND kind='image' AND status=1",store.id).map(assetView)}});
});
app.post('/api/redirect',async(req,res)=>{
 const {key,uuid,staff_uuid=''}=req.body;
 if(!keys.includes(key)||typeof staff_uuid!=='string'||staff_uuid.length>100) return res.status(400).json({code:500,message:'渠道或归因参数无效'});
 const page=requirePage(uuid),store=one('SELECT * FROM stores WHERE id=?',page.store_id);
 if(JSON.parse(page.enabled_json)[key]===0) return res.status(400).json({code:500,message:'该渠道已停用'});
 const absent=missing(key,store);
 if(absent.length && req.body.manual===true) {
  const copy=pickCopy(store.id,key==='big_three_people_punch'?'dianping':key==='redbook_ic_publish'||key==='pyq_publish'?'redbook_ic_publish':'douyin_publish');
  return res.json({status:1,manual:true,scheme:'',content:[copy.title,copy.content,...copy.hashtags.map((t:string)=>`#${t}`)].filter(Boolean).join('\n'),picData:pick(store.id,'image',3).map(a=>a.url),video:pick(store.id,'video',1)[0]?.url||'',message:`该渠道未配置：${absent.join('、')}，请手动发布`});
 }
 if(absent.length) return res.json({code:500,message:`该渠道未配置：${absent.join('、')}`});
 const video=['douyin_publish','kwai_publish','redbook_publish'].includes(key);
 const result=transaction(()=>{
  const assets=pick(store.id,video?'video':'image',video?1:3);
  if(!assets.length) return null;
  const copy=pickCopy(store.id,video?'douyin_publish':key==='big_three_people_punch'?'dianping':'redbook_ic_publish');
  return {assets,copy};
 });
 if(!result) return res.json({status:0});
 const {assets,copy}=result,images=assets.map(a=>a.url),share_id=randomBytes(16).toString('hex');
 const content=[copy.title,copy.content,...copy.hashtags.map((t:string)=>`#${t}`)].filter(Boolean).join('\n');
 if(key==='douyin_publish') return res.json({status:1,share_id,scheme:douyinScheme({clientKey:process.env.DOUYIN_CLIENT_KEY!,ticket:await douyinTicket(),nonce:randomBytes(16).toString('hex'),timestamp:String(Math.floor(Date.now()/1000)),state:share_id,video:assets[0].url,title:content,hashtags:copy.hashtags,poi:store.douyin_poi_id})});
 if(key==='kwai_publish') {
  if(!copy.id) throw Error('请先生成文案');
  run('DELETE FROM oauth_jobs WHERE expires<?',Date.now()-86400000);
  run('INSERT INTO oauth_jobs(state,uuid,asset_id,copy_id,expires) VALUES(?,?,?,?,?)',share_id,uuid,assets[0].id,copy.id,Date.now()+600000);
  return res.json({status:1,share_id,scheme:authorizeUrl(share_id)});
 }
 if(key==='redbook_publish'&&process.env.XHS_MINIAPP_ID) {
  run('INSERT INTO oauth_jobs(state,uuid,asset_id,copy_id,expires) VALUES(?,?,?,?,?)',share_id,uuid,assets[0].id,copy.id,Date.now()+600000);
  return res.json({status:1,scheme:miniappScheme(uuid,staff_uuid,share_id)});
 }
 if(key.startsWith('redbook')) return res.json({status:1,scheme:'',ext:{...await xhsConfig(),content,title:copy.title,images:video?[]:images,...(video?{video:assets[0].url,cover:assets[0].cover_url}:{})}});
 return res.json({status:1,scheme:key==='pyq_publish'?'':`dianping://shopinfo?${new URLSearchParams({shopuuid:store.dianping_shop_uuid})}`,picData:images,content});
});
app.get('/api/xhs/session/:session',(req,res)=>{
 const job=one('SELECT * FROM oauth_jobs WHERE state=? AND expires>?',req.params.session,Date.now());if(!job) return res.status(404).json({message:'素材会话已过期'});
 const a=one('SELECT * FROM assets WHERE id=? AND status=1',job.asset_id),c=one('SELECT title,content FROM copies WHERE id=?',job.copy_id);
 res.json({asset:a?assetView(a):null,copy:c});
});
app.get('/api/kuaishou/callback',async(req,res)=>{
 const state=typeof req.query.state==='string'?req.query.state:'',job=one('SELECT * FROM oauth_jobs WHERE state=?',state);
 if(!job||job.expires<Date.now()) return res.status(400).send('授权会话无效或已过期，请返回门店页重试');
 if(job.status!=='waiting') return res.redirect(`/p/${encodeURIComponent(job.uuid)}?job=${state}`);
 if(typeof req.query.code!=='string') {run("UPDATE oauth_jobs SET status='error',result='授权被取消' WHERE state=?",state);return res.redirect(`/p/${encodeURIComponent(job.uuid)}?job=${state}`);}
 run("UPDATE oauth_jobs SET status='processing' WHERE state=? AND status='waiting'",state);
 try {const result=await publishKwai(req.query.code,job);run('UPDATE oauth_jobs SET status=?,result=? WHERE state=?',result.pending?'submitted':'published',JSON.stringify(result),state);}
 catch {run("UPDATE oauth_jobs SET status='error',result='发布失败，请检查后台平台配置后重新授权；如已经提交，请先检查快手作品列表以免重复发布。' WHERE state=?",state);}
 res.redirect(`/p/${encodeURIComponent(job.uuid)}?job=${state}`);
});
app.get('/api/jobs/:state',(req,res)=>{const job=one('SELECT status,result FROM oauth_jobs WHERE state=? AND expires>?',req.params.state,Date.now());res.status(job?200:404).json(job||{message:'会话不存在'});});
app.post('/api/events',(req,res)=>{
 const {uuid,key,result}=req.body;if(typeof uuid!=='string'||!keys.includes(key)||!['opened','not_observed','blocked','error'].includes(result)) return res.sendStatus(400);
 run('INSERT INTO events(uuid,key,ua,is_wechat,result) VALUES(?,?,?,?,?)',uuid,key,(req.headers['user-agent']||'').slice(0,500),Number(/micromessenger/i.test(req.headers['user-agent']||'')),result);res.sendStatus(204);
});
app.use(['/api/admin','/admin'],(req,res,next)=>{
 const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'');
 if(config.adminBind==='127.0.0.1'&&!loopback) return res.sendStatus(403);
 if(req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
  if(config.adminToken) {const provided=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,'')),expected=Buffer.from(config.adminToken);if(provided.length!==expected.length||!timingSafeEqual(provided,expected)) return res.sendStatus(401);}
  else if(!loopback) return res.sendStatus(403);
  if(req.method!=='GET' && req.headers.origin && req.headers.origin!==new URL(config.base).origin && req.headers.origin!==`http://127.0.0.1:${config.port}` && req.headers.origin!==`http://localhost:${config.port}`) return res.sendStatus(403);
 }
 next();
});
app.get('/api/admin/state',(_req,res)=>res.json({stores:all('SELECT * FROM stores'),pages:all('SELECT * FROM pages'),assets:all('SELECT * FROM assets').map(assetView),copies:all('SELECT * FROM copies ORDER BY id DESC LIMIT 1000'),logs:all('SELECT * FROM gen_logs ORDER BY id DESC LIMIT 100'),base:config.base,platforms:Object.fromEntries(keys.map(k=>[k,missing(k,{dianping_shop_uuid:'configured per store'})]))}));
const storeFields=['name','logo','address','phone','dianping_shop_uuid','douyin_poi_id','brand_brief','flagship_items_json','selling_points_json'];
app.post('/api/admin/stores',(req,res)=>{
 const values=storeFields.map(k=>{const v=req.body[k]??(k.endsWith('_json')?'[]':'');if(typeof v!=='string'||v.length>4000) throw Error('门店字段无效');if(k.endsWith('_json')&&!Array.isArray(JSON.parse(v))) throw Error('卖点/招牌必须是 JSON 数组');return v;});
 if(!values[0].trim()) throw Error('门店名不能为空');
 if(req.body.id) {run(`UPDATE stores SET ${storeFields.map(k=>`${k}=?`).join(',')} WHERE id=?`,...values,Number(req.body.id));res.json({id:req.body.id});}
 else {const result=run(`INSERT INTO stores(${storeFields.join(',')}) VALUES(${storeFields.map(()=>'?').join(',')})`,...values);res.json({id:Number(result.lastInsertRowid)});}
});
app.delete('/api/admin/stores/:id',(req,res)=>{run('DELETE FROM stores WHERE id=?',Number(req.params.id));res.sendStatus(204);});
app.post('/api/admin/assets/scan',async(_req,res)=>res.json(await scan()));
app.post('/api/admin/assets/upload',uploadAsset);
app.post('/api/admin/copies/generate',async(req,res)=>{const n=Number(req.body.n||config.quota);if(!Number.isInteger(n)||n<1||n>100) throw Error('条数应为1–100');res.json(await generate(Number(req.body.store_id),n));});
app.patch('/api/admin/copies/:id',(req,res)=>{if(![0,1].includes(req.body.status)) throw Error('状态无效');run('UPDATE copies SET status=? WHERE id=?',req.body.status,Number(req.params.id));res.sendStatus(204);});
app.post('/api/admin/pages',(req,res)=>{
 const {store_id,title='',subtitle='',enabled={},staff_uuid=''}=req.body;
 if(!one('SELECT id FROM stores WHERE id=?',Number(store_id))) throw Error('门店不存在');
 if([title,subtitle,staff_uuid].some(v=>typeof v!=='string'||v.length>500)||!enabled||Array.isArray(enabled)||typeof enabled!=='object'||Object.entries(enabled).some(([k,v])=>!keys.includes(k)||![0,1].includes(Number(v)))) throw Error('页面字段无效');
 const uuid=req.body.uuid||randomUUID();if(typeof uuid!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(uuid)) throw Error('uuid 无效');
 run('INSERT INTO pages(uuid,store_id,title,subtitle,enabled_json,staff_uuid) VALUES(?,?,?,?,?,?) ON CONFLICT(uuid) DO UPDATE SET title=excluded.title,subtitle=excluded.subtitle,enabled_json=excluded.enabled_json,staff_uuid=excluded.staff_uuid',uuid,Number(store_id),title,subtitle,JSON.stringify(enabled),staff_uuid);
 res.json({uuid,url:`${config.base}/p/${uuid}`});
});
app.get('/api/admin/qr/:uuid',async(req,res)=>{requirePage(req.params.uuid);res.type('svg').send(await QRCode.toString(`${config.base}/p/${req.params.uuid}`,{type:'svg'}));});
app.use(express.static(resolve('dist'),{index:false}));
app.get(['/','/p/:uuid','/admin'],(_req,res)=>res.sendFile(resolve('dist/index.html')));
app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(err.message);res.status(400).json({code:500,message:err.message?.includes('fetch')?'平台请求失败，请检查网络和资质配置':err.message||'请求失败'});});
