import { createHash, randomInt } from 'node:crypto';
import { all, one, run, transaction } from './db.ts';
import { config } from './config.ts';
export const day = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
export const normalize = (s:string) => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
export const hash = (s:string) => createHash('sha256').update(normalize(s)).digest('hex');
export function jaccard(a:string,b:string) {
 const grams=(s:string)=>{s=normalize(s);return new Set(s.length<3?[s]:Array.from({length:s.length-2},(_,i)=>s.slice(i,i+3)));};
 const x=grams(a),y=grams(b);return [...x].filter(g=>y.has(g)).length/new Set([...x,...y]).size;
}
export function titleSimilarity(a:string,b:string) {
 a=normalize(a); b=normalize(b); let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++) {const next=[i];for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));row=next;}
 return 1-row[b.length]/Math.max(a.length,b.length,1);
}
const angles=['口味','环境','服务','性价比','打卡','家庭聚餐','朋友聚会','工作餐','夜宵','回头客'];
const personas=['我','我们','朋友安利','老客复盘'];
const styles=['随手记录','细节观察','路线攻略','清单分享','短句口播','周末日记','实用建议','问答','轻松聊天','简洁推荐','下班计划','午间笔记'];
export function axisFor(storeId:number) {
 const used=new Set(all("SELECT axis_key FROM used_axes WHERE store_id=? AND used_on>=date(?,'-30 day')",storeId,day()).map(r=>r.axis_key));
 const choices=angles.flatMap(angle=>personas.flatMap(persona=>styles.map(style=>({angle,persona,style})))).filter(a=>!used.has(JSON.stringify(a)));
 if(!choices.length) throw Error('近30天维度已用完');return choices[randomInt(choices.length)];
}
const fallbackLines=[
 '先把位置收藏，出门前再核对营业时间，临时找地方也能少一点忙乱。',
 '约朋友碰面，先问大家偏好的口味和预算，把选择留给同桌的人。',
 '一家人出门时，我更想提前了解交通与座位安排，吃饭才能从容一些。',
 '工作日的午餐计划不必复杂，先看看菜单，再决定今天想吃什么。',
 '周末探索一个新地方，顺路走一走周边，也给自己留一点闲逛的时间。',
 '想尝招牌却拿不定主意，可以先问清分量，按人数安排更合适。',
 '记录店铺时我会拍下门头，下一次找路，往往比记住街道名字管用。',
 '多人聚餐别急着下单，提前沟通忌口，比临时调整更省心。',
 '如果准备晚上过去，记得提前联系门店确认，避免白跑一趟。',
 '给自己的探店备忘录留一栏：哪些信息已经确认，哪些还需要现场了解。',
 '不急着做评价，先看一眼当日供应，找到适合这一次相聚的选择。',
 '带长辈出门前，提前确认是否需要上楼，路线信息总能派上用场。',
 '随手把地址发给同行的人，约定好集合地点，碰面就不用来回打电话。',
 '第一次到访，我会先了解点餐方式，再慢慢挑想尝试的东西。',
 '如果有人对食材过敏，记得下单前和工作人员说明，别凭印象猜测。',
 '想拍照做记录，可以先征求同桌人的意见，让镜头不打扰相聚。',
 '将门店联系方式加进备忘录，需要预订时就不必反复搜索。',
 '吃多少点多少，按实际人数安排菜量，剩余食物也记得妥善打包。',
 '周边停车情况可能随时变化，出发前查看实时信息会更稳妥。',
 '准备带小朋友同行的话，不妨先询问儿童座椅与餐具的安排。',
 '给计划留一点余地，如果碰上忙碌时段，就按现场情况耐心沟通。',
 '偏爱清淡还是喜欢浓郁，把自己的偏好说清楚，选餐更有方向。',
 '收藏夹里多留一个地址，下回朋友问起去哪见面，就多一个选择。',
 '一个人的用餐也值得认真安排，可以先了解适合单人的分量。',
 '准备请客前先询问大家有没有忌口，心意往往体现在这些小地方。',
 '路过时顺手确认门牌和入口，下次专程过去就能少绕一段路。',
 '选择公共交通出行，提前看看返程时间，尽量避开最后一班的匆忙。',
 '想写一份有用的笔记，不妨记下到访时间与实际选择，便于自己回看。',
 '季节不同，供应也可能不同，对心仪的菜品最好提前电话确认。',
 '把预算提前商量好，聚餐时大家都能更轻松地做选择。',
 '对于没尝过的口味，我会先问问食材特点，再决定是否适合自己。',
 '打包带走前询问保存方式，回去后按建议及时处理食物。',
 '多人点餐可以指定一人汇总，减少重复，也方便核对最后的清单。',
 '选择见面地点时兼顾每个人的路程，大家抵达时都能少一点疲惫。',
 '不照搬别人的评分，把自己的偏好与实际需求写下来才有参考价值。',
 '如果要用优惠活动，先读清规则和有效期，结账时会更清楚。',
 '记录一顿饭也可以很简单：同行的人、选择的菜，以及当天的心情。',
 '下雨天出门记得查看路况，见面时间宽松一点，路上就不用着急。',
 '临时增加同行人数时，先联系门店确认安排，给彼此一点准备时间。',
 '把真实体验留给亲自到访之后，出发前的这份清单只负责做好准备。',
];
export function fallback(store:any,axis:any,index:number) {
 const first=index%fallbackLines.length,second=Math.floor(index/fallbackLines.length)%fallbackLines.length;
 const content=`${store.name}｜${axis.angle}备忘\n${fallbackLines[first]}\n${fallbackLines[second===first?(second+1)%fallbackLines.length:second]}\n${store.brand_brief||'体验因个人偏好而异，详情请向门店咨询。'}`;
 return {title:`${axis.persona}的${axis.angle}·${axis.style}`,content,hashtags:[store.name,axis.angle],source:'fallback'};
}
const active=new Set<number>();
export async function generate(storeId:number,n=config.quota,daily=false) {
 if(active.has(storeId)) throw Error('该门店正在生成，请稍候');
 const store=one('SELECT * FROM stores WHERE id=?',storeId);if(!store) throw Error('门店不存在');active.add(storeId);
 let added=0;
 try {
 const platforms=['douyin_publish','douyin_publish','douyin_publish','redbook_ic_publish','redbook_ic_publish','dianping'];
 let batch:any[]=[],batchPlatform='';
 for(let i=0;i<n;i++) {
  const platform=platforms[i%6];
  if(batchPlatform!==platform) {batch=[];batchPlatform=platform;}
  const target=Array.from({length:n},(_,j)=>platforms[j%6]).filter(p=>p===platform).length;
  if(daily && one('SELECT count(*) n FROM copies WHERE store_id=? AND platform=? AND substr(created_at,1,10)=?',storeId,platform,day()).n>=target) continue;
  const axis=axisFor(storeId),recent=all('SELECT title,content,content_hash FROM copies WHERE store_id=? ORDER BY id DESC LIMIT 500',storeId),dropped:string[]=[];
  let accepted:any=null,attempts=0;
  for(;attempts<3 && !accepted;attempts++) {
   try {
    if(!batch.length && process.env.DEEPSEEK_API_KEY) {
     const response=await fetch(`${process.env.DEEPSEEK_BASE_URL||'https://api.deepseek.com/v1'}/chat/completions`,{method:'POST',signal:AbortSignal.timeout(40000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.DEEPSEEK_API_KEY}`},body:JSON.stringify({model:process.env.DEEPSEEK_MODEL||'deepseek-chat',temperature:1.25,response_format:{type:'json_object'},messages:[{role:'system',content:'生成中文门店推广草稿，不编造亲身体验、价格或服务事实。仅返回 JSON {items:[{title,content,hashtags:字符串数组}]}。抖音≤60字3话题；小红书150–260字5话题；点评80–140字。每条角度和句式不同。'},{role:'user',content:JSON.stringify({store,platform,axis,count:3,avoid:recent.slice(0,200).map(r=>({title:r.title,first:r.content.slice(0,80)}))})}]})});
     if(!response.ok) throw Error(`DeepSeek HTTP ${response.status}`);const body:any=await response.json();batch=JSON.parse(body.choices[0].message.content).items;
     if(!Array.isArray(batch)) {batch=[];throw Error('AI JSON 缺少 items');}
    }
    const candidate=batch.shift();if(!candidate) break;
    if(typeof candidate.title!=='string'||typeof candidate.content!=='string'||!candidate.title.trim()||!candidate.content.trim()||candidate.title.length>80||!Array.isArray(candidate.hashtags)||!candidate.hashtags.every((t:any)=>typeof t==='string'&&t.length<=40)) throw Error('AI 文案字段无效');
    const length=[...candidate.content].length,[min,max]=platform==='redbook_ic_publish'?[150,260]:platform==='dianping'?[80,140]:[1,60];
    if(length<min||length>max) throw Error('AI 文案长度不符合平台规范');
    if(recent.some(r=>r.content_hash===hash(candidate.content)||jaccard(r.content,candidate.content)>0.82)||recent.slice(0,200).some(r=>titleSimilarity(r.title,candidate.title)>0.9)) throw Error('重复文案');
    accepted={...candidate,source:'ai'};
   } catch(e:any) {batch=[];dropped.push(e.message);}
  }
  if(!accepted) {
   for(let f=0;f<480;f++) {
    const a=f?axisFor(storeId):axis,c=fallback(store,a,randomInt(fallbackLines.length**2));
    if(!recent.some(r=>r.content_hash===hash(c.content)||jaccard(r.content,c.content)>0.82)&&!recent.slice(0,200).some(r=>titleSimilarity(r.title,c.title)>0.9)) {accepted={...c,axis:a};break;}
   }
  }
  transaction(()=>{
   if(accepted) {
    const a=accepted.axis||axis;
    run('INSERT INTO copies(store_id,platform,title,content,hashtags_json,axis_json,content_hash,source,model,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',storeId,platform,accepted.title,accepted.content,JSON.stringify(accepted.hashtags),JSON.stringify(a),hash(accepted.content),accepted.source,accepted.source==='ai'?(process.env.DEEPSEEK_MODEL||'deepseek-chat'):'template',`${day()}T${new Date().toISOString().slice(11)}`);
    run('INSERT OR IGNORE INTO used_axes VALUES(?,?,?)',storeId,JSON.stringify(a),day());added++;
   }
   run('INSERT INTO gen_logs(store_id,platform,ok,attempts,dropped_json,err,created_at) VALUES(?,?,?,?,?,?,?)',storeId,platform,Number(!!accepted),attempts,JSON.stringify(dropped),accepted?'':'模板重复，需添加门店事实或新模板',new Date().toISOString());
  });
 }
 return {added,requested:n};
 } finally {active.delete(storeId);}
}
export function pickCopy(storeId:number,platform:string) {
 const row=one('SELECT * FROM copies WHERE store_id=? AND platform=? AND status=1 ORDER BY used_count,random() LIMIT 1',storeId,platform);
 if(row) {run('UPDATE copies SET used_count=used_count+1 WHERE id=?',row.id);return {...row,hashtags:JSON.parse(row.hashtags_json)};}
 return {id:null,title:'',content:'',hashtags:[]};
}
