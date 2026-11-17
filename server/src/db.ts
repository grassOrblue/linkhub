import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';
mkdirSync(config.data, {recursive:true}); mkdirSync(config.media, {recursive:true});
export const db = new DatabaseSync(join(config.data, 'linkhub.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS stores(id INTEGER PRIMARY KEY,name TEXT NOT NULL,logo TEXT DEFAULT '',address TEXT DEFAULT '',phone TEXT DEFAULT '',dianping_shop_uuid TEXT DEFAULT '',douyin_poi_id TEXT DEFAULT '',brand_brief TEXT DEFAULT '',flagship_items_json TEXT DEFAULT '[]',selling_points_json TEXT DEFAULT '[]');
CREATE TABLE IF NOT EXISTS pages(uuid TEXT PRIMARY KEY,store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,title TEXT,subtitle TEXT,staff_uuid TEXT DEFAULT '',enabled_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS assets(id INTEGER PRIMARY KEY,store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,kind TEXT NOT NULL,rel_path TEXT NOT NULL UNIQUE,content_hash TEXT NOT NULL,status INTEGER DEFAULT 0,error TEXT DEFAULT '',cover_rel_path TEXT,duration_ms INTEGER,width INTEGER,height INTEGER,bytes INTEGER,last_used_at INTEGER DEFAULT 0,UNIQUE(store_id,content_hash));
CREATE INDEX IF NOT EXISTS asset_pick ON assets(store_id,kind,status,last_used_at);
CREATE TABLE IF NOT EXISTS copies(id INTEGER PRIMARY KEY,store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,platform TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,hashtags_json TEXT NOT NULL,axis_json TEXT,content_hash TEXT NOT NULL,source TEXT NOT NULL,model TEXT,prompt_version TEXT DEFAULT '1',status INTEGER DEFAULT 1,used_count INTEGER DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(store_id,content_hash));
CREATE TABLE IF NOT EXISTS used_axes(store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,axis_key TEXT,used_on TEXT,PRIMARY KEY(store_id,axis_key,used_on));
CREATE TABLE IF NOT EXISTS gen_logs(id INTEGER PRIMARY KEY,store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,platform TEXT,ok INTEGER,attempts INTEGER,dropped_json TEXT,err TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,uuid TEXT,key TEXT,ua TEXT,is_wechat INTEGER,result TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS oauth_jobs(state TEXT PRIMARY KEY,uuid TEXT,asset_id INTEGER,copy_id INTEGER,expires INTEGER,status TEXT DEFAULT 'waiting',result TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS token_cache(platform TEXT PRIMARY KEY,value TEXT,expires INTEGER);
`);
export const all = (sql:string,...args:any[]):any[] => db.prepare(sql).all(...args);
export const one = (sql:string,...args:any[]):any => db.prepare(sql).get(...args);
export const run = (sql:string,...args:any[]) => db.prepare(sql).run(...args);
export function transaction<T>(fn:()=>T):T { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(e) { db.exec('ROLLBACK'); throw e; } }
export function mediaUrl(path:string) { return `${config.base}/media/${path.split('/').map(encodeURIComponent).join('/')}`; }
