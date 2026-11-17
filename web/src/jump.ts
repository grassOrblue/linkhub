export const isWechat=(ua=navigator.userAgent)=>/micromessenger/i.test(ua);
export const isIOS=(ua=navigator.userAgent)=>/iphone|ipad|ipod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
export async function copyText(text:string) {
 try {if(navigator.clipboard&&window.isSecureContext) {await navigator.clipboard.writeText(text);return;}} catch { /* HTTP 局域网与剪贴板权限限制时使用选区复制。 */ }
 const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.top='0';input.style.opacity='0';document.body.append(input);input.focus();input.select();input.setSelectionRange(0,text.length);
 const copied=document.execCommand('copy');input.remove();if(!copied) throw Error('未能复制，请长按文案手动复制');
}
export async function awaitScheme(load:()=>Promise<any>,signal:AbortSignal) {
 for(let i=0;i<60;i++) {
  signal.throwIfAborted();const response=await load();signal.throwIfAborted();if(response.code) throw Error(response.message);if(response.status===1) return response;
  if(response.status!==0) throw Error('跳转响应无效');
  if(i<59) await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},3000);signal.addEventListener('abort',cancel,{once:true});});
 }
 throw Error('素材准备超时，请联系门店检查素材状态');
}
export function targetUrl(key:string,scheme:string) {return key==='kwai_publish'?`kwai://webview?url=${encodeURIComponent(scheme)}`:scheme;}
export function openUrl(url:string,result:(value:string)=>void) {
 if(!/^(snssdk1128|kwai|xhsdiscover|dianping):\/\//.test(url)) throw Error('不支持的跳转地址');
 let hidden=false;
 const finish=()=>{if(document.hidden) {hidden=true;cleanup();result('opened');}};
 const cleanup=()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',finish);window.removeEventListener('pagehide',pagehide);};
 const pagehide=()=>{hidden=true;cleanup();result('opened');};
 const timer=setTimeout(()=>{cleanup();if(!hidden) result('not_observed');},2500);
 document.addEventListener('visibilitychange',finish);window.addEventListener('pagehide',pagehide);window.location.href=url;
 return cleanup;
}
