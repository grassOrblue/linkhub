import { createHash, randomBytes } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { all, one, run } from './db.ts';
import { config } from './config.ts';
export const keys=['douyin_publish','kwai_publish','redbook_publish','redbook_ic_publish','pyq_publish','big_three_people_punch'];
const e=process.env;
export function missing(key:string,store:any) {
 const need=key==='douyin_publish'?['DOUYIN_CLIENT_KEY',...(e.DOUYIN_SHARE_TICKET?[]:['DOUYIN_CLIENT_SECRET'])]:key==='kwai_publish'?['KUAISHOU_APP_ID','KUAISHOU_APP_SECRET']:key.startsWith('redbook')?(key==='redbook_publish'&&e.XHS_MINIAPP_ID?[]:['XHS_APP_KEY','XHS_APP_SECRET']):[];
 return [...need.filter(k=>!e[k]),...(key==='big_three_people_punch'&&!store.dianping_shop_uuid?['点评店铺 shopuuid']:[])];
}
export async function json(url:string|URL,init:RequestInit={}) {
 const response=await fetch(url,{...init,signal:init.signal||AbortSignal.timeout(30000)});
 if(!response.ok) throw Error(`平台 HTTP ${response.status}`);return response.json() as Promise<any>;
}
const pending=new Map<string,Promise<string>>();
async function cached(platform:string,load:()=>Promise<{value:string,expires:number}>) {
 const old=one('SELECT * FROM token_cache WHERE platform=?',platform);
 if(old&&old.expires>Date.now()+60000) return old.value;
 if(pending.has(platform)) return pending.get(platform)!;
 const promise=load().then(t=>{if(!t.value||t.expires<=Date.now()) throw Error('平台凭据无效');run('INSERT OR REPLACE INTO token_cache VALUES(?,?,?)',platform,t.value,t.expires);return t.value;}).finally(()=>pending.delete(platform));
 pending.set(platform,promise);return promise;
}
export function douyinScheme(input:{clientKey:string,ticket:string,nonce:string,timestamp:string,state:string,video:string,title:string,hashtags:string[],poi:string}) {
 const {clientKey,ticket,nonce,timestamp,state,video,title,hashtags,poi}=input;
 const signature=createHash('md5').update(`nonce_str=${nonce}&ticket=${ticket}&timestamp=${timestamp}`).digest('hex');
 const tags=hashtags.map(name=>({name,start:title.indexOf(`#${name}`)>=0?title.indexOf(`#${name}`):title.length}));
 return 'snssdk1128://openplatform/share?'+new URLSearchParams({share_type:'h5',client_key:clientKey,nonce_str:nonce,timestamp,state,image_path:'',video_path:video,share_to_publish:'1',title,short_title:[...title].slice(0,20).join(''),poi_id:poi,title_hashtag_list:JSON.stringify(tags),signature});
}
export async function douyinTicket() {
 if(e.DOUYIN_SHARE_TICKET) return e.DOUYIN_SHARE_TICKET;
 return cached('douyin',async()=>{
  const token=await json('https://open.douyin.com/oauth/client_token/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_key:e.DOUYIN_CLIENT_KEY,client_secret:e.DOUYIN_CLIENT_SECRET,grant_type:'client_credential'})});
  if(!token.data?.access_token) throw Error('抖音 client_token 获取失败，请检查资质与权限');
  const ticket=await json('https://open.douyin.com/open/getticket/',{headers:{'access-token':token.data.access_token}});
  if(!ticket.data?.ticket) throw Error('抖音 ticket 获取失败，请检查 open.get.ticket 权限');
  return {value:ticket.data.ticket,expires:Date.now()+Math.min(token.data.expires_in,ticket.data.expires_in)*1000};
 });
}
export const xhsSignature=(appKey:string,nonce:string,timeStamp:string,secret:string)=>createHash('sha256').update(`appKey=${appKey}&nonce=${nonce}&timeStamp=${timeStamp}${secret}`).digest('hex');
export async function xhsConfig() {
 const appKey=e.XHS_APP_KEY!;
 const token=await cached('xhs',async()=>{
  const nonce=randomBytes(16).toString('hex'),timestamp=Date.now();
  const body=await json('https://edith.xiaohongshu.com/api/sns/v1/ext/access/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_key:appKey,nonce,timestamp,signature:xhsSignature(appKey,nonce,String(timestamp),e.XHS_APP_SECRET!)})});
  if(!body.success||!body.data?.access_token) throw Error('小红书 access_token 获取失败');return {value:body.data.access_token,expires:Number(body.data.expires_in)};
 });
 const nonce=randomBytes(16).toString('hex'),timestamp=String(Date.now());
 return {appKey,nonce,timestamp,signature:xhsSignature(appKey,nonce,timestamp,token)};
}
export function miniappScheme(uuid:string,staff:string,session:string) {
 return `xhsdiscover://miniapp/${encodeURIComponent(e.XHS_MINIAPP_ID!)}/pages/post/post?`+new URLSearchParams({uuid,staff_uuid:staff,key:'redbook_publish',timestamp:String(Math.floor(Date.now()/1000)),session,api_base:config.base});
}
export function authorizeUrl(state:string) {
 return 'https://open.kuaishou.com/oauth2/authorize?'+new URLSearchParams({app_id:e.KUAISHOU_APP_ID!,response_type:'code',scope:'user_info,user_video_publish,user_video_info',redirect_uri:`${config.base}/api/kuaishou/callback`,state});
}
export async function publishKwai(code:string,job:any) {
 const token=await json('https://open.kuaishou.com/oauth2/access_token?'+new URLSearchParams({app_id:e.KUAISHOU_APP_ID!,app_secret:e.KUAISHOU_APP_SECRET!,code,grant_type:'authorization_code'}));
 if(token.result!==1||!token.access_token||!token.scopes?.includes('user_video_publish')) throw Error('快手授权失败或未允许视频发布');
 const query=new URLSearchParams({app_id:e.KUAISHOU_APP_ID!,access_token:token.access_token});
 const start=await json(`https://open.kuaishou.com/openapi/photo/start_upload?${query}`,{method:'POST'});
 if(start.result!==1||!start.upload_token) throw Error('快手发起上传失败');
 if(!/^[a-z0-9.-]+\.(gifshow\.com|kuaishou\.com|kwai\.com)$/i.test(start.endpoint)) throw Error('快手上传网关无效');
 const asset=one('SELECT * FROM assets WHERE id=? AND status=1',job.asset_id),copy=one('SELECT * FROM copies WHERE id=?',job.copy_id);
 if(!asset?.cover_rel_path) throw Error('缺少视频或封面，请重新扫描素材');
 const file=await open(join(config.media,asset.rel_path),'r');
 try {
  const size=(await file.stat()).size,chunk=5*1024*1024,count=Math.ceil(size/chunk);
  for(let i=0;i<count;i++) {
   const data=Buffer.alloc(Math.min(chunk,size-i*chunk));await file.read(data,0,data.length,i*chunk);
   const uploaded=await json(`https://${start.endpoint}/api/upload/fragment?`+new URLSearchParams({upload_token:start.upload_token,fragment_id:String(i)}),{method:'POST',body:data,signal:AbortSignal.timeout(120000)});
   if(uploaded.result!==1) throw Error('快手视频分片上传失败');
  }
  const complete=await json(`https://${start.endpoint}/api/upload/complete?`+new URLSearchParams({upload_token:start.upload_token,fragment_count:String(count)}),{method:'POST'});
  if(complete.result!==1) throw Error('快手合并视频失败');
 } finally {await file.close();}
 const form=new FormData();form.append('caption',copy?.content||'');form.append('cover',new Blob([await readFile(join(config.media,asset.cover_rel_path))]),'cover.jpg');query.set('upload_token',start.upload_token);
 const result=await json(`https://open.kuaishou.com/openapi/photo/publish?${query}`,{method:'POST',body:form});
 if(result.result!==1||!result.video_info?.photo_id) throw Error('快手发布提交失败');
 return {photo_id:result.video_info.photo_id,pending:result.video_info.pending!==false};
}
