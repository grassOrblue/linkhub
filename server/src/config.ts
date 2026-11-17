import { existsSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
if (existsSync('.env')) process.loadEnvFile('.env');
const e = process.env;
if (e.FFMPEG_BIN_DIR) process.env.PATH = resolve(e.FFMPEG_BIN_DIR) + delimiter + (process.env.PATH || '');
export const config = {
  port: Number(e.PORT || 8787), host: e.HOST || '0.0.0.0',
  base: (e.PUBLIC_BASE_URL || 'http://localhost:8787').replace(/\/$/, ''),
  data: resolve(e.DATA_DIR || 'data'), media: resolve(e.MEDIA_DIR || 'media'),
  adminBind: e.ADMIN_BIND || '127.0.0.1', adminToken: e.ADMIN_TOKEN || '',
  cron: e.COPY_CRON || '0 3 * * *', quota: Number(e.COPY_PER_STORE || 6),
};
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw Error('PORT 无效');
if (!Number.isInteger(config.quota) || config.quota < 1 || config.quota > 100) throw Error('COPY_PER_STORE 应为 1–100');
if (!['http:', 'https:'].includes(new URL(config.base).protocol)) throw Error('PUBLIC_BASE_URL 必须是 HTTP(S)');
if (config.adminBind !== '127.0.0.1' && config.adminToken.length < 24) throw Error('远程后台需要至少24位 ADMIN_TOKEN');
