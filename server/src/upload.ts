import type { Request, Response } from 'express';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, unlink, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { one } from './db.ts';
import { probeFile, scan, assetView } from './media.ts';

export async function uploadAsset(req:Request,res:Response) {
 const storeId=Number(req.query.store_id),filename=req.query.filename;
 if(!Number.isSafeInteger(storeId)||storeId<1||!one('SELECT id FROM stores WHERE id=?',storeId)) return res.status(400).json({message:'请选择有效门店'});
 if(typeof filename!=='string'||filename.length>180||/[\\/\x00-\x1f]/.test(filename)) return res.status(400).json({message:'文件名无效'});
 const ext=extname(filename).toLowerCase(),kind=ext==='.mp4'?'video':'image';
 if(!['.jpg','.jpeg','.png','.mp4'].includes(ext)||!req.is('application/octet-stream')) return res.status(400).json({message:'仅支持 JPG、PNG 和 H.264 MP4 文件'});
 const limit=(kind==='video'?500:10)*1024*1024;
 if(Number(req.headers['content-length'])>limit) return res.status(413).json({message:kind==='video'?'视频不能超过500MB':'图片不能超过10MB'});
 const incoming=join(config.media,'.incoming');await mkdir(incoming,{recursive:true});
 const temp=join(incoming,randomUUID()+ext),digest=createHash('sha256');let size=0,header=Buffer.alloc(0);
 const meter=new Transform({transform(chunk:Buffer,_encoding,done){
  size+=chunk.length;if(size>limit) return done(Error('文件超过上传大小限制'));
  if(header.length<32) header=Buffer.concat([header,chunk.subarray(0,32-header.length)]);
  digest.update(chunk);done(null,chunk);
 }});
 // 只把校验后的完整文件移入素材目录，扫描器看不到上传中的文件。
 try {
  await pipeline(req,meter,createWriteStream(temp,{flags:'wx'}));
  const valid=kind==='video'?header.subarray(4,8).toString()==='ftyp':ext==='.png'?header.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):header.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
  if(!size||!valid) return res.status(400).json({message:'文件内容与格式不符，请上传真实图片或MP4'});
  await probeFile(temp,kind);
  const hash=digest.digest('hex'),duplicate=one('SELECT * FROM assets WHERE store_id=? AND content_hash=?',storeId,hash);
  if(duplicate) {
   const existing=join(config.media,duplicate.rel_path);
   try {await stat(existing);} catch(e:any) {if(e.code!=='ENOENT')throw e;await mkdir(dirname(existing),{recursive:true});await rename(temp,existing);}
   await scan(storeId);return res.json({duplicate:true,asset:assetView(one('SELECT * FROM assets WHERE id=?',duplicate.id))});
  }
  const folder=join(config.media,String(storeId),kind);await mkdir(folder,{recursive:true});
  const name=randomUUID()+ext;await rename(temp,join(folder,name));
  await scan(storeId);
  const asset=one('SELECT * FROM assets WHERE rel_path=?',`${storeId}/${kind}/${name}`);
  if(!asset) throw Error('素材登记失败，请重新扫描');
  return res.json({duplicate:false,asset:assetView(asset)});
 } catch(e:any) {
  if(!res.destroyed) return res.status(size>limit?413:400).json({message:e.code==='ENOENT'?'请先安装 ffprobe / ffmpeg 并配置工具目录':'上传失败：'+e.message});
 } finally {await unlink(temp).catch(()=>{});}
}
