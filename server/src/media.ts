import { readdir, stat, mkdir, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.ts';
import { all, one, run, mediaUrl } from './db.ts';
const exec = promisify(execFile);
export function assetView(a:any) { return {...a,url:mediaUrl(a.rel_path),cover_url:a.cover_rel_path?mediaUrl(a.cover_rel_path):null}; }
export async function probeFile(file:string,kind:string) {
 const result=await exec('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file],{timeout:30000});
 const data=JSON.parse(result.stdout),probe=data.streams.find((s:any)=>s.codec_type==='video');
 if(!probe?.width || !probe?.height) throw Error('未发现有效的图像/视频流');
 if(kind==='video' && probe.codec_name!=='h264') throw Error('视频必须为 H.264 MP4');
 if(kind==='image' && !['png','mjpeg'].includes(probe.codec_name)) throw Error('图片必须为 JPEG 或 PNG');
 return {...probe,duration_ms:Math.round(Number(data.format.duration||0)*1000)};
}
export async function scan(storeId?:number) {
 let count=0;const canonicalRoot=await realpath(config.media);
 for(const store of all('SELECT id FROM stores'+(storeId===undefined?'':' WHERE id=?'),...(storeId===undefined?[]:[storeId]))) {
  for(const kind of ['image','video']) {
   const root=join(config.media,String(store.id),kind); await mkdir(root,{recursive:true});
   for(const entry of await readdir(root,{recursive:true,withFileTypes:true})) {
    if(!entry.isFile() || entry.isSymbolicLink()) continue;
    const file=join(entry.parentPath,entry.name), canonical=await realpath(file);
    if(!canonical.startsWith(canonicalRoot+sep)) continue;
    const ext=extname(file).toLowerCase();
    if(!(kind==='video'?['.mp4']:['.png','.jpg','.jpeg']).includes(ext)) continue;
    const rel=relative(config.media,file).split(sep).join('/'), info=await stat(file);
    const digest=createHash('sha256');for await(const chunk of createReadStream(file)) digest.update(chunk);const hash=digest.digest('hex');
    const duplicate=one('SELECT id FROM assets WHERE store_id=? AND content_hash=? AND rel_path!=?',store.id,hash,rel);
    if(duplicate) continue;
    let status=1,error='',cover:string|null=null,probe:any={};
    try {
     probe=await probeFile(file,kind);
     if(kind==='video') {
      if(info.size>500*1024*1024) throw Error('视频超过 500MB');
      cover=`${store.id}/covers/${hash.slice(0,16)}.jpg`;
      await mkdir(join(config.media,String(store.id),'covers'),{recursive:true});
      await exec('ffmpeg',['-y','-protocol_whitelist','file,pipe','-i',file,'-frames:v','1','-update','1',join(config.media,cover)],{timeout:30000});
     }
    } catch(e:any) { status=e.code==='ENOENT'?0:2; error=e.code==='ENOENT'?'请安装 ffprobe / ffmpeg 后重新扫描':e.message; }
    run(`INSERT INTO assets(store_id,kind,rel_path,content_hash,status,error,cover_rel_path,duration_ms,width,height,bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(rel_path) DO UPDATE SET content_hash=excluded.content_hash,status=excluded.status,error=excluded.error,cover_rel_path=excluded.cover_rel_path,duration_ms=excluded.duration_ms,width=excluded.width,height=excluded.height,bytes=excluded.bytes`,store.id,kind,rel,hash,status,error,cover,probe?.duration_ms||0,probe?.width||0,probe?.height||0,info.size); count++;
   }
  }
 }
 for(const a of all('SELECT id,rel_path FROM assets')) { try {await stat(join(config.media,a.rel_path));} catch {run("UPDATE assets SET status=2,error='文件不存在' WHERE id=?",a.id);} }
 return {scanned:count};
}
export function pick(storeId:number,kind:string,n:number) {
 const rows=all('SELECT * FROM assets WHERE store_id=? AND kind=? AND status=1 ORDER BY last_used_at ASC, random() LIMIT ?',storeId,kind,n);
 for(const a of rows) run('UPDATE assets SET last_used_at=? WHERE id=?',Date.now(),a.id);
 return rows.map(assetView);
}
