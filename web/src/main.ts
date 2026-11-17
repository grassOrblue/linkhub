import { createApp } from 'vue/dist/vue.esm-bundler.js';
import { isWechat, isIOS, copyText, awaitScheme, targetUrl, openUrl } from './jump.ts';
import './style.css';
const labels:Record<string,string>={douyin_publish:'抖音视频',kwai_publish:'快手视频',redbook_publish:'小红书视频',redbook_ic_publish:'小红书图文',pyq_publish:'朋友圈图文',big_three_people_punch:'大众点评收藏'};
const adminTabs=[{key:'overview',name:'工作台'},{key:'stores',name:'门店资料'},{key:'assets',name:'素材管理'},{key:'copies',name:'文案管理'},{key:'pages',name:'页面与二维码'}];
const groups=[{title:'分享一段精彩',sub:'发视频',keys:['douyin_publish','kwai_publish','redbook_publish']},{title:'把喜欢留在笔记里',sub:'发图文',keys:['redbook_ic_publish','pyq_publish']},{title:'下次见，先收藏',sub:'收藏门店',keys:['big_three_people_punch']}];
let controller:AbortController|undefined,cleanup:(()=>void)|undefined;
let sdkPromise:Promise<void>|undefined;
function loadSdk() {return sdkPromise||=new Promise<void>((resolve,reject)=>{if((window as any).xhs) return resolve();const script=document.createElement('script');script.src='https://fe-static.xhscdn.com/biz-static/goten/xhs-1.0.1.js';script.onload=()=>resolve();script.onerror=()=>{sdkPromise=undefined;script.remove();reject(Error('小红书 SDK 加载失败，请保存素材后手动发布'));};document.head.append(script);});}
createApp({
 data:()=>({admin:location.pathname.startsWith('/admin'),adminTabs,adminTab:'overview',filterStore:'',uploadStore:'',uploadFiles:[] as File[],uploading:false,uploadStatus:'',labels,groups,info:null as any,error:'',notice:'',busy:false,mask:false,sheet:null as any,current:'',preview:'',state:null as any,token:'',store:{name:'',brand_brief:'',dianping_shop_uuid:'',douyin_poi_id:'',flagship_items_json:'[]',selling_points_json:'[]'} as any,pageForm:{store_id:'',title:'分享你的喜欢',subtitle:'记录此刻，分享美好',staff_uuid:'',enabled:{}} as any,selectedStore:'',count:6,qr:'',qrLink:'',jobMessage:''}),
 async mounted() {
  document.addEventListener('keydown',(event:KeyboardEvent)=>{
   if(event.key==='Escape') {if(this.preview)this.preview='';else if(this.mask)this.mask=false;else this.sheet=null;}
   if(event.key==='Tab') {const overlays=document.querySelectorAll('.overlay'),overlay=overlays[overlays.length-1];if(!overlay)return;const items=Array.from(overlay.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]'));const first=items[0],last=items.at(-1);if(!first)return;if(event.shiftKey&&(!overlay.contains(document.activeElement)||document.activeElement===first)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(!overlay.contains(document.activeElement)||document.activeElement===last)){event.preventDefault();first.focus();}}
  });
  if(this.admin) return;
  const uuid=location.pathname.split('/')[2];if(!uuid) {this.error='请通过门店二维码或分享链接访问';return;}
  try {this.info=await this.api(`/api/page/${encodeURIComponent(uuid)}`);const job=new URLSearchParams(location.search).get('job');if(job) {const j=await this.api(`/api/jobs/${encodeURIComponent(job)}`);this.jobMessage=j.status==='published'?'快手已发布':j.status==='submitted'?'快手已受理，作品可能仍在处理中，请到快手确认':j.status==='processing'?'快手正在上传处理中，请稍后刷新':j.result;}} catch(e:any) {this.error=e.message;}
 },
 computed:{
  filteredAssets():any[] {return (this.state?.assets||[]).filter((a:any)=>!this.filterStore||String(a.store_id)===String(this.filterStore));},
  filteredCopies():any[] {return (this.state?.copies||[]).filter((c:any)=>!this.filterStore||String(c.store_id)===String(this.filterStore));},
  filteredPages():any[] {return (this.state?.pages||[]).filter((p:any)=>!this.filterStore||String(p.store_id)===String(this.filterStore));},
 },
 methods:{
  async api(path:string,body?:any,method?:string) {const response=await fetch(path,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(this.token?{Authorization:`Bearer ${this.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok) {const data=await response.json().catch(()=>({message:`请求失败 (${response.status})`}));throw Error(data.message||'请求失败，请检查后台口令');}if(response.status===204) return null;return response.json();},
  event(result:string) {void this.api('/api/events',{uuid:this.info.page.uuid,key:this.current,result}).catch(()=>{});},
  async action(key:string) {
   if(isWechat()) {this.mask=true;this.current=key;this.event('blocked');return;}
   this.error='';this.notice='';this.current=key;
   if(this.info.enabled[key].missing.length) {try {this.sheet=await this.api('/api/redirect',{key,uuid:this.info.page.uuid,manual:true});this.notice=this.sheet.message;}catch(e:any){this.error=e.message;}return;}
   this.busy=true;controller=new AbortController();
   try {const response=await awaitScheme(()=>this.api('/api/redirect',{key,uuid:this.info.page.uuid,staff_uuid:this.info.page.staff_uuid,need_scheme:key==='redbook_publish'?1:0}),controller.signal);
    this.sheet=response;
    if(response.ext) {this.sheet.content=response.ext.content;this.sheet.picData=response.ext.images;await loadSdk();}
    if(!isIOS()&&response.content) {try {await copyText(response.content);this.notice='文案已复制';} catch(e:any) {this.notice=e.message;}}
   } catch(e:any) {if(!controller.signal.aborted) this.error=e.message;}finally {this.busy=false;}
  },
  cancel() {controller?.abort();this.busy=false;},
  async copy() {if(!this.sheet.content?.trim()){this.notice='请先填写文案';return;}try {await copyText(this.sheet.content);this.notice='文案已复制';}catch(e:any) {this.notice=e.message;}},
  jump() {
   if(isWechat()) {this.mask=true;return;}
   this.error='';
   try {cleanup?.();cleanup=openUrl(targetUrl(this.current,this.sheet.scheme),(result)=>{this.event(result);this.notice=result==='not_observed'?'尚未检测到离开页面，请确认已安装 App，或重试打开。':'';});}catch(e:any) {this.error=e.message;}
  },
  async shareXhs() {
   if(isWechat()) {this.mask=true;return;}
   const ext=this.sheet.ext;
   try {
    if(!this.sheet.content?.trim()){this.notice='请先填写文案';return;}
    await copyText(this.sheet.content);this.notice='文案已复制，到小红书后粘贴';
   } catch(e:any) {this.notice=e.message;}
   try {await loadSdk();(window as any).xhs.share({shareInfo:{type:ext.video?'video':'normal',title:'',content:'',images:ext.images,...(ext.video?{video:ext.video,cover:ext.cover}:{})},verifyConfig:{appKey:ext.appKey,nonce:ext.nonce,timestamp:ext.timestamp,signature:ext.signature},success:(r:any)=>{if(r.urlSchema) {this.sheet.scheme=r.urlSchema;this.notice='内容准备好了，请点击打开小红书';}},fail:()=>{this.error='小红书分享失败，请保存素材并手动发布';}});}catch(e:any) {this.error=e.message;}
  },
  async refresh() {try {this.state=await this.api('/api/admin/state');if(!this.uploadStore&&this.state.stores.length===1)this.uploadStore=String(this.state.stores[0].id);this.error='';}catch(e:any) {this.error=e.message;}},
  async upload() {
   this.error='';this.notice='';
   if(!this.uploadStore||!this.uploadFiles.length){this.error='请选择门店和素材文件';return;}
   if(this.uploadFiles.length>9){this.error='每次最多上传9个文件';return;}
   for(const file of this.uploadFiles){const video=/\.mp4$/i.test(file.name);if(!/\.(jpg|jpeg|png|mp4)$/i.test(file.name)||!file.size||file.size>(video?500:10)*1024*1024){this.error=`${file.name}：仅支持10MB以内图片或500MB以内MP4`;return;}}
   this.uploading=true;let uploaded=0,duplicates=0;
   try {
    for(const [i,file] of this.uploadFiles.entries()) {
     this.uploadStatus=`正在处理 ${i+1}/${this.uploadFiles.length}：${file.name}`;
     const response=await fetch('/api/admin/assets/upload?'+new URLSearchParams({store_id:this.uploadStore,filename:file.name}),{method:'POST',headers:{'Content-Type':'application/octet-stream',...(this.token?{Authorization:`Bearer ${this.token}`}:{})},body:file});
     const result=await response.json();if(!response.ok)throw Error(result.message||'上传失败');
     if(result.duplicate)duplicates++;else uploaded++;
     if(result.asset.status!==1)this.error='素材已保存，但未就绪：'+result.asset.error;
    }
    this.uploadFiles=[];(this.$refs.uploadInput as HTMLInputElement).value='';
   }catch(e:any){this.error=e.message;}
   finally{this.uploading=false;this.uploadStatus='';const message=this.error;await this.refresh();this.error=message;this.notice=`新增 ${uploaded} 个，重复 ${duplicates} 个`;}
  },
  async saveStore() {try {await this.api('/api/admin/stores',this.store);this.store={name:'',brand_brief:'',dianping_shop_uuid:'',douyin_poi_id:'',flagship_items_json:'[]',selling_points_json:'[]'};await this.refresh();this.notice='门店已保存';}catch(e:any){this.error=e.message;}},
  async removeStore(id:number) {if(!confirm('删除此门店、页面、文案和素材索引？磁盘素材文件保留。')) return;try {await this.api(`/api/admin/stores/${id}`,undefined,'DELETE');await this.refresh();}catch(e:any){this.error=e.message;}},
  async scan() {this.busy=true;try {const r=await this.api('/api/admin/assets/scan',{});this.notice=`已扫描 ${r.scanned} 个文件`;await this.refresh();}catch(e:any){this.error=e.message;}finally{this.busy=false;}},
  async generate() {this.busy=true;try {const r=await this.api('/api/admin/copies/generate',{store_id:Number(this.selectedStore),n:Number(this.count)});this.notice=`已生成 ${r.added}/${r.requested} 条`;await this.refresh();}catch(e:any){this.error=e.message;}finally{this.busy=false;}},
  async toggle(c:any) {try {await this.api(`/api/admin/copies/${c.id}`,{status:1-c.status},'PATCH');await this.refresh();}catch(e:any){this.error=e.message;}},
  async savePage() {try {const p=await this.api('/api/admin/pages',this.pageForm);await this.refresh();await this.showQr(p.uuid);this.notice='页面已保存';}catch(e:any){this.error=e.message;}},
  async showQr(uuid:string) {const response=await fetch(`/api/admin/qr/${uuid}`,{headers:this.token?{Authorization:`Bearer ${this.token}`}:{}});if(!response.ok){this.error='二维码获取失败';return;}if(this.qr)URL.revokeObjectURL(this.qr);this.qr=URL.createObjectURL(await response.blob());this.qrLink=`${this.state.base}/p/${uuid}`;},
 },
 template:`
 <main :class="{admin}">
  <header><a href="/">LINKHUB <span>分享美好</span></a><span class="badge">{{admin?'商家工作台':'门店分享'}}</span></header>
  <p v-if="error" class="error" role="alert">{{error}}</p><p v-if="notice" class="notice" role="status">{{notice}}</p>
  <template v-if="!admin && info">
   <section class="hero"><div class="eyebrow">DISCOVER · SAVE · SHARE</div><img v-if="info.store.logo" :src="info.store.logo" class="logo" alt="门店标志"><h1>{{info.store.name}}</h1><h2>{{info.page.title}}</h2><p>{{info.page.subtitle}}</p><small>{{info.store.address}}</small></section>
   <p v-if="jobMessage" class="notice">{{jobMessage}}</p>
   <section v-for="group in groups" class="group"><div class="section-head"><h2>{{group.sub}}</h2><span>{{group.title}}</span></div><div class="actions"><button v-for="key in group.keys.filter(k=>info.enabled[k].enabled)" @click="action(key)" :disabled="busy" :data-channel="key"><span class="icon" :class="key">{{labels[key].slice(0,1)}}</span><span>{{labels[key]}}<small>{{info.enabled[key].missing.length?'未配置 · 查看手动发布':key==='pyq_publish'?'复制文案 · 保存图片':key==='kwai_publish'?'授权后提交发布':'准备素材并打开'}}</small></span><b>↗</b></button></div></section>
   <footer>发布前请核对内容，仅分享真实体验。<br>朋友圈需自行保存图片并粘贴文案。</footer>
  </template>
  <template v-if="admin">
   <h1>门店分享工作台</h1><section class="panel"><label>后台口令 <input type="password" v-model="token" autocomplete="current-password"></label><button @click="refresh">进入 / 刷新</button></section>
   <template v-if="state">
    <div class="admin-shell"><nav class="admin-nav" aria-label="后台功能"><button v-for="tab in adminTabs" :aria-current="adminTab===tab.key?'page':undefined" @click="adminTab=tab.key">{{tab.name}}</button></nav><div class="admin-content">
    <section v-if="adminTab==='overview'" class="panel"><h2>工作台概览</h2><div class="stats-grid"><article><strong>{{state.stores.length}}</strong><span>门店</span></article><article><strong>{{state.assets.filter(a=>a.status===1).length}}</strong><span>就绪素材</span></article><article><strong>{{state.copies.filter(c=>c.status===1).length}}</strong><span>可用文案（最近1000条）</span></article><article><strong>{{state.pages.length}}</strong><span>分享页面</span></article></div><p>先完善门店资料，再上传素材、生成文案，最后创建分享页面。</p><button @click="adminTab='assets'">上传素材</button> <button @click="adminTab='pages'">管理分享页面</button></section>
    <label v-if="adminTab!=='overview'&&adminTab!=='stores'" class="store-filter">筛选门店<select v-model="filterStore"><option value="">全部门店</option><option v-for="s in state.stores" :value="String(s.id)">{{s.name}}</option></select></label>
    <section v-if="adminTab==='stores'" class="panel"><h2>门店</h2><div class="row" v-for="s in state.stores"><strong>#{{s.id}} {{s.name}}</strong><button @click="store={...s}">编辑</button><button @click="removeStore(s.id)">删除</button></div><form @submit.prevent="saveStore"><label v-for="(v,k) in store" v-show="k!=='id'">{{({name:'门店名称',brand_brief:'品牌介绍与真实卖点',dianping_shop_uuid:'点评 shopuuid',douyin_poi_id:'抖音 POI',flagship_items_json:'招牌 JSON 数组',selling_points_json:'卖点 JSON 数组',address:'地址',phone:'电话',logo:'标志 URL'})[k]||k}}<input v-model="store[k]"></label><button>保存门店</button></form></section>
    <section v-if="adminTab==='assets'" class="panel"><h2>素材</h2><p>上传后自动探测格式、去重并生成视频封面。也可放入素材目录后手动扫描。</p><form @submit.prevent="upload" class="upload-form"><label>上传到门店<select v-model="uploadStore" required :disabled="uploading"><option disabled value="">选择门店</option><option v-for="s in state.stores" :value="String(s.id)">{{s.name}}</option></select></label><label>选择素材<input ref="uploadInput" type="file" accept=".jpg,.jpeg,.png,.mp4" multiple :disabled="uploading" @change="uploadFiles=Array.from($event.target.files||[])"></label><p class="hint">每次最多9个文件。图片≤10MB，H.264 MP4视频≤500MB。需安装 ffmpeg/ffprobe。</p><button :disabled="uploading||!uploadStore||!uploadFiles.length">{{uploading?'上传与探测中…':'上传并入库'}}</button><p role="status">{{uploadStatus}}</p></form><button @click="scan" :disabled="busy||uploading">扫描素材</button><div class="asset-grid"><article v-for="a in filteredAssets"><img v-if="a.kind==='image'" :src="a.url" alt="图片素材"><video v-else controls preload="none" :src="a.url" :poster="a.cover_url"></video><span class="status-tag" :class="a.status===1?'ready':'pending'">{{a.status===1?'就绪':'未就绪'}}</span><small>#{{a.store_id}} {{a.rel_path}}<br>{{a.error}}</small></article></div></section>
    <section v-if="adminTab==='copies'" class="panel"><h2>文案</h2><div class="row"><select v-model="selectedStore"><option disabled value="">选择门店</option><option v-for="s in state.stores" :value="s.id">{{s.name}}</option></select><input type="number" min="1" max="100" v-model="count" aria-label="文案条数"><button @click="generate" :disabled="busy||!selectedStore">生成文案</button></div><details v-for="c in filteredCopies"><summary>#{{c.store_id}} {{c.title}} · {{c.source}} · {{c.platform}} · 使用{{c.used_count}}次</summary><p>{{c.content}}</p><button @click="toggle(c)">{{c.status?'停用':'启用'}}</button></details><details><summary>生成日志</summary><pre>{{state.logs}}</pre></details></section>
    <section v-if="adminTab==='pages'" class="panel"><h2>分享页面与二维码</h2><div class="row" v-for="p in filteredPages"><span>{{p.title}} · {{p.uuid}}</span><button @click="pageForm={...p,enabled:JSON.parse(p.enabled_json)}">编辑</button><button @click="showQr(p.uuid)">二维码</button></div><form @submit.prevent="savePage"><label>门店<select v-model="pageForm.store_id" required><option v-for="s in state.stores" :value="s.id">{{s.name}}</option></select></label><label>标题<input v-model="pageForm.title"></label><label>副标题<input v-model="pageForm.subtitle"></label><label>员工归因<input v-model="pageForm.staff_uuid"></label><label v-for="(label,key) in labels" class="checkbox"><input type="checkbox" :checked="pageForm.enabled[key]!==0" @change="pageForm.enabled[key]=$event.target.checked?1:0">{{label}}</label><button>保存页面</button></form><img v-if="qr" :src="qr" class="qr" alt="门店分享二维码"><p><a :href="qrLink" target="_blank">{{qrLink}}</a></p><h3>渠道配置</h3><p class="hint">开放平台凭证由服务端配置，点评店铺 ID 在门店资料中填写。</p><div class="channel-config" v-for="(label,key) in labels"><span>{{label}}</span><span class="status-tag" :class="state.platforms[key].length?'pending':'ready'">{{key==='pyq_publish'?'无需资质':key==='big_three_people_punch'?'按门店配置':state.platforms[key].length?'未配置':'应用配置齐备'}}</span></div></section>
    </div></div>
   </template>
  </template>
  <div v-if="busy" class="overlay"><section class="dialog" role="status"><h2>正在准备素材…</h2><p>请稍候，视频可能需要一点时间。</p><button @click="cancel" v-if="!admin">取消</button></section></div>
  <div v-if="mask" class="overlay wechat" @click="mask=false"><section role="dialog" aria-modal="true" aria-label="在浏览器打开"><div class="arrow">↗</div><h2>请在浏览器中打开</h2><p>点击微信右上角「···」<br>选择「在浏览器打开」，再点击分享按钮。</p><button>知道了</button></section></div>
  <div v-if="sheet" class="overlay"><section class="dialog sheet" role="dialog" aria-modal="true" aria-label="准备分享"><button class="close" aria-label="关闭" @click="sheet=null">×</button><div class="eyebrow">READY TO SHARE</div><h2>{{labels[current]}}</h2><template v-if="typeof sheet.content==='string'"><h3>第一步 · 核对并编辑文案</h3><textarea class="copy" aria-label="分享文案" v-model="sheet.content" maxlength="2000" rows="6" @input="notice=''"></textarea><p class="hint">可改成你的真实体验，修改仅用于本次分享。</p><button @click="copy">一键复制</button></template><template v-if="sheet.picData?.length"><h3>第二步 · 点开图片，长按保存</h3><div class="pictures"><button v-for="src in sheet.picData" @click="preview=src" aria-label="预览并保存图片"><img :src="src" alt="分享图片"></button></div></template><video v-if="sheet.video" controls :src="sheet.video"></video><video v-if="sheet.ext?.video" controls :src="sheet.ext.video" :poster="sheet.ext.cover"></video><p v-if="current==='pyq_publish'">保存图片后，请手动打开微信 → 发现 → 朋友圈，粘贴文案并选择图片。</p><p v-if="sheet.manual">请手动打开目标 App，选择已保存的素材发布。</p><button v-if="sheet.ext && !sheet.scheme" @click="shareXhs">复制文案并分享到小红书</button><button v-if="sheet.scheme" class="primary" @click="jump">打开{{labels[current]}}</button><p class="notice" role="status">{{notice}}</p><p class="error" role="alert">{{error}}</p></section></div>
  <div v-if="preview" class="overlay preview" @click.self="preview=''"><button @click="preview=''">关闭预览</button><p>长按图片保存到相册</p><img :src="preview" alt="长按保存图片"></div>
 </main>`
}).mount('#app');
