# linkhub 实施计划

> H5 唤起 App 并携带内容：视频发布（抖音/快手/小红书）· 大众点评收藏 · 图文发布（小红书/朋友圈）
> 配套：DeepSeek 每日定时文案生成 + 商家素材随机挑选 + 本地后台（可迁移服务器）

文档版本：v1.0 · 历史实施计划，非验收结果；当前实现状态与偏差见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)，开放平台与真机验收待配置 · 证据来源见 [EVIDENCE.md](./EVIDENCE.md)

---

## 1. 落地位置与现状

| 项 | 值 |
|---|---|
| 代码根 | 仓库根目录（起始为空目录） |
| Node | v24.11.0 |
| 包管理 | pnpm 10.28.2 |
| 其他 | Python 3.12.1 / git 2.40.0 |
| AI 配置约定 | 沿用 `program/ziwei-doushu/.env.example`：`AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY` |

历史采集文件仅本地留档，不作为项目源码提交。

---

## 2. 能力边界

| 能力 | 技术路线 | 资质门槛 | 内容能力 |
|---|---|---|---|
| 抖音视频 | `snssdk1128://openplatform/share?...&share_to_publish=1` | 抖音开放平台应用 `client_key` + 服务端签名 | 视频/标题/话题/POI 全带，直达发布页 |
| 快手视频 | `kwai://webview?url=<open.kuaishou.com/oauth2/authorize>` → 回调 → 服务端代发 | 快手开放平台应用 + `user_video_publish` scope | 服务端直发，无需手动传文件 |
| 小红书视频 | `xhsdiscover://miniapp/<appid>/pages/post/post` | 小红书小程序 | 小程序内选素材发布 |
| 小红书图文 | 剪贴板 + `xhs.share({type:'normal',images})` → `xhsdiscover://js_share_sdk?share_code=` | 小红书开放平台 `appKey` | 文案走剪贴板，图片走 SDK |
| 朋友圈图文 | 无 scheme：`picData[] + content` | 无 | 半自动：存图 + 复制文案 |
| 点评收藏 | `dianping://shopinfo?shopuuid=` + 剪贴板 + 长按存图 | 商户 `shopuuid` | 只带店面，内容半自动 |

**明确不做**：百度/高德/美团打卡、微信视频号（实测 scheme 为 `wx://` 占位，走不通）、WiFi、关注类、e代驾、红包营销。视频号若日后要，唯一路径是自建微信小程序 + `weixin://dl/business/?appid=&path=&query=&env_version=release`（P2）。

---

## 3. 目标与验收标准

**目标**：商家把视频/图片丢进服务器目录 → 系统每天用 DeepSeek 自动生成一批不重复文案入库 → 生成带 uuid 的 H5 链接 → 顾客手机打开点按钮，随机挑素材 + 匹配文案直达各 App。

**验收（iOS Safari + Android Chrome 真机各一遍）**：

1. `/p/<uuid>` 展示门店页与三组动作：发视频（抖音/快手/小红书）、发图文（小红书/朋友圈）、点评收藏。
2. 点「发抖音」→ 抖音发布页已载入随机视频 + 对应文案 + 话题 + POI，用户只需点发布。
3. 点「发快手」→ 弹授权 → 授权后服务端直发，H5 显示「已发布」。
4. 点「发小红书图文」→ 剪贴板有完整文案（toast 提示）→ 小红书出现随机 3~9 张图。
5. 点「点评收藏」→ 打开对应店铺页；Android 剪贴板已自动带文案，iOS 弹层给「一键复制」+「长按保存图片」。
6. 微信内置浏览器点任意按钮 → 显示「右上角 → 在浏览器打开」引导图，不发起跳转。
7. 每天 03:00 自动生成 6 条/店文案；连续 7 天抽检，两两 3-gram Jaccard ≤ 0.82，无完全重复。
8. 后台 `http://127.0.0.1:8787/admin` 可建店、扫素材、看文案、手动补生成、出二维码。

---

## 4. 项目结构与技术栈

```
program/linkhub/
├─ .env.example
├─ package.json                  # pnpm workspaces
├─ README.md                     # 本地跑 / 部署两套流程
├─ docs/
│  ├─ PLAN.md                    # 本文档
│  └─ EVIDENCE.md                # 线上实测证据（scheme 原文 / 响应样本）
├─ server/
│  ├─ src/index.ts               # Express 启动，装配路由与 cron
│  ├─ src/config.ts              # env 读取与校验（缺失即 fail-fast）
│  ├─ src/db.ts                  # better-sqlite3 + 迁移
│  ├─ src/routes/
│  │   ├─ page.ts                # GET  /api/page/:uuid
│  │   ├─ redirect.ts            # POST /api/redirect          ← 核心
│  │   ├─ oauth.ts               # GET  /api/kuaishou/callback
│  │   ├─ events.ts              # POST /api/events
│  │   └─ admin.ts               # /api/admin/*
│  ├─ src/platforms/
│  │   ├─ registry.ts            # key -> handler
│  │   ├─ douyin.ts              # buildShareScheme + sign
│  │   ├─ kuaishou.ts            # authorizeUrl + publishVideo
│  │   ├─ xhs.ts                 # checkToken→shareCode / miniapp deeplink
│  │   ├─ dianping.ts            # shopinfo scheme + clipboard payload
│  │   └─ moments.ts             # picData + content
│  ├─ src/sign/                  # 各家签名实现（按官方文档）
│  ├─ src/media/
│  │   ├─ scan.ts                # 扫描 MEDIA_DIR 增量入库 + hash 去重
│  │   ├─ probe.ts               # ffprobe 时长/尺寸、ffmpeg 抽封面（缺失降级）
│  │   └─ pick.ts                # 随机挑选（最久未用优先）
│  ├─ src/copy/
│  │   ├─ deepseek.ts            # OpenAI 兼容客户端，json_object 输出
│  │   ├─ prompt.ts              # 维度池 + 已用样本护栏 + prompt 版本号
│  │   ├─ dedupe.ts              # sha256 + 3-gram Jaccard + 标题编辑距离
│  │   ├─ generator.ts           # 生成→过滤→重试→落库
│  │   └─ fallback.ts            # 模板池兜底（无 key/限流时）
│  └─ test/*.spec.ts             # vitest
├─ web/                          # Vite + Vue3 + TS
│  ├─ src/pages/Page.vue         # 顾客页（对应 mobilePerviewOne）
│  ├─ src/components/{ActionGroup,ClipboardSheet,WechatMask,AspectModal}.vue
│  ├─ src/jump.ts                # isWechat/isIOS/awaitScheme/openUrl
│  └─ src/admin/{Index,Stores,Assets,Copies}.vue
├─ data/                         # SQLite（DATA_DIR，可整目录拷走）
├─ media/<store_id>/video|image/ # 商家自备素材（MEDIA_DIR）
└─ deploy/                       # systemd unit + nginx 反代 + pm2 ecosystem
```

**栈**：Express 5 + better-sqlite3（零外部服务、单文件可迁移）+ Vue3/Vite。素材生产期走本地静态服务，上线换 OSS/CDN，只改 `PUBLIC_BASE_URL`。

---

## 5. 配置（.env.example）

```ini
PORT=8787
PUBLIC_BASE_URL=http://192.168.1.20:8787   # 真机测试必须是手机可达的局域网 IP；生产换域名
DATA_DIR=./data
MEDIA_DIR=./media
ADMIN_BIND=127.0.0.1                       # 后台只监听本机；部署时改 0.0.0.0 + ADMIN_TOKEN
ADMIN_TOKEN=change-me

AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
COPY_CRON=0 3 * * *                        # 每天 03:00（Asia/Shanghai）
COPY_PER_STORE=6                           # 每天每店生成条数

# 平台凭证（留空 → 对应按钮自动置灰）
DOUYIN_CLIENT_KEY=
DOUYIN_SIGN_SECRET=
KUAISHOU_APP_ID=
KUAISHOU_APP_SECRET=
XHS_APP_KEY=
XHS_APP_SECRET=
XHS_MINIAPP_ID=
```

**硬约束**：抖音的 `video_path`、小红书的 `images` 必须手机能直接拉到。本地联调 `PUBLIC_BASE_URL` 用局域网 IP，不能写 `localhost`，否则手机端拿到的素材地址不可达。

---

## 6. 数据模型（SQLite）

```sql
CREATE TABLE stores (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT, address TEXT, phone TEXT,
  dianping_shop_uuid TEXT,          -- 必填项：点评店铺页
  douyin_poi_id TEXT,               -- 抖音发布带定位
  xhs_location TEXT, kuaishou_poi TEXT,
  brand_brief TEXT,                 -- 喂给 AI 的品牌档案
  flagship_items_json TEXT,         -- 招牌/主打
  selling_points_json TEXT,         -- 环境/服务/性价比卖点
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE assets (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  kind TEXT NOT NULL CHECK (kind IN ('video','image')),
  rel_path TEXT NOT NULL,           -- 相对 MEDIA_DIR
  url TEXT NOT NULL,                -- PUBLIC_BASE_URL + rel_path
  cover_rel_path TEXT, cover_url TEXT,
  duration_ms INTEGER, width INTEGER, height INTEGER, bytes INTEGER,
  content_hash TEXT NOT NULL UNIQUE,-- 文件 sha256 前 16 位
  status INTEGER DEFAULT 0,         -- 0=待探测 1=就绪 2=异常
  created_at TEXT DEFAULT (datetime('now','localtime')),
  last_used_at TEXT
);
CREATE INDEX idx_assets_pick ON assets(store_id, kind, status, last_used_at);

CREATE TABLE copies (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  platform TEXT NOT NULL,           -- douyin_publish / redbook_ic_publish / dianping
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  hashtags_json TEXT,
  axis_json TEXT,                   -- {angle, persona, length, style}
  content_hash TEXT NOT NULL UNIQUE,-- 归一化后 sha256
  sim_signature TEXT,               -- 3-gram 指纹
  model TEXT, prompt_version TEXT,
  source TEXT DEFAULT 'ai',         -- ai | fallback | manual
  status INTEGER DEFAULT 1,         -- 1=可用 0=停用
  used_count INTEGER DEFAULT 0,
  asset_ids_json TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_copies_pick ON copies(store_id, platform, status, used_count);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  staff_uuid TEXT,
  title TEXT, subtitle TEXT, bg_img TEXT,
  enabled_json TEXT,                -- {"douyin_publish":1,...}
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  uuid TEXT, key TEXT, ua TEXT,
  is_wechat INTEGER, result TEXT,   -- ok | no_app | blocked | error
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE creds (
  platform TEXT PRIMARY KEY,
  app_key TEXT, app_secret TEXT,
  extra_json TEXT, enabled INTEGER DEFAULT 1
);

CREATE TABLE used_axes (
  store_id INTEGER, axis_key TEXT, used_on TEXT,
  PRIMARY KEY (store_id, axis_key, used_on)
);

CREATE TABLE gen_logs (
  id INTEGER PRIMARY KEY,
  store_id INTEGER, platform TEXT,
  ok INTEGER, attempts INTEGER,
  dropped_json TEXT, err TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

---

## 7. AI 文案日更子系统

### 7.1 产出配额
每店每天 6 条：`douyin_publish 3 / redbook_ic_publish 2 / dianping 1`（`COPY_PER_STORE` 可调）。

### 7.2 四道去重闸

**闸一：维度池配额**
- 角度：口味 / 环境 / 服务 / 性价比 / 打卡 / 家庭聚餐 / 朋友聚会 / 工作餐 / 夜宵 / 回头客
- 人称：我 / 我们 / 朋友安利 / 老客复盘
- 风格：抖音短句口播（≤60 字 + 3 话题）/ 小红书种草（150–260 字 + emoji + 5 话题）/ 点评中评（80–140 字，配 1 图）
- `used_axes` 记录近 30 天已用组合，抽组合时排除，保证角度不撞。

**闸二：Prompt 护栏**
把「同店最近 30 天的 title + 首句」塞进 prompt，明确要求「禁止复用下列表达与句式」。

**闸三：生成后过滤**
| 规则 | 阈值 | 命中处理 |
|---|---|---|
| 完全重复 | 归一化（去空白/标点/emoji）后 sha256 命中唯一索引 | 丢弃 |
| 近重复 | 字符 3-gram Jaccard 与同店最近 500 条比较 > 0.82 | 丢弃 |
| 标题重复 | 与近 200 条标题编辑距离相似度 > 0.9 | 丢弃 |

命中即重试，单条最多 3 次；3 次仍重 → `fallback.ts` 模板池补位并标 `source='fallback'`。

**闸四：落库审计**
`gen_logs` 记录每次丢弃原因与 attempts，便于事后调阈值。

### 7.3 DeepSeek 调用

```ts
POST ${DEEPSEEK_BASE_URL}/chat/completions
{
  model: DEEPSEEK_MODEL,                       // deepseek-chat
  messages: [
    { role: 'system', content: 人设 + 平台规范 + 禁止项 },
    { role: 'user',   content: 商家档案 + 指定 axes + 近期已用文案 }
  ],
  temperature: 1.25,
  top_p: 0.95,
  response_format: { type: 'json_object' }
}
// 期望 items: [{ platform, title, content, hashtags: string[], angle }]
```

- 一次请求生成一批（batch=3~5）省 token
- JSON 解析失败 → 整批重试
- 连续失败 3 次 → `fallback.ts`（预置 40 条骨架句随机组合），保证日更不断档

### 7.4 调度
- `node-cron` 按 `COPY_CRON` 跑，`timezone: 'Asia/Shanghai'`
- 幂等：当天该店该平台已达配额则跳过（按 `created_at` 日期统计）
- 手动补：`POST /api/admin/copies/generate { store_id, n }`
- 串行 + 200ms 间隔，避免 429

### 7.5 文案如何被消费
`POST /api/redirect` 时按 `key` 取该店该平台 `status=1` 且 `used_count` 最小的一条（同档随机），`used_count++`，避免同一链接反复出同一条。

---

## 8. 素材子系统

1. 商家把文件丢进 `media/<store_id>/video/`、`media/<store_id>/image/`（生产为服务器挂载目录）
2. `scan.ts`：递归扫描 → 文件 `sha256` 前 16 位作 `content_hash`，唯一索引去重 → 入库
3. `probe.ts`：`ffprobe` 取时长/宽高、`ffmpeg` 抽首帧做封面；两者缺失则 `status=0` 占位并告警，不阻塞主流程
4. 触发：启动扫一次 + `POST /api/admin/assets/scan` 手动增量
5. **随机挑选**：`crypto.randomInt`，优先取 `last_used_at` 最旧（近 30 天未用过权重最高）的一批；视频 1 条、图片 3~9 张；选中即更新 `last_used_at`
6. URL：`${PUBLIC_BASE_URL}/media/<rel_path>`，生产替换 CDN 前缀只改配置
7. 合规校验：视频需 `mp4/h264` 且不超平台单文件限制；超标在后台标红并跳过

---

## 9. API 契约

```ts
GET  /api/page/:uuid
  → { store, assets: { videos: [], images: [] }, enabled }

POST /api/redirect
  body { key, uuid, staff_uuid?, need_scheme?: 0|1 }
  → { status: 1, scheme }                                              // 抖音/快手/点评/朋友圈跳转
  | { status: 0 }                                                      // 素材未就绪 → 前端 3s×60 轮询
  | { status: 1, ext: { content, images, appKey, nonce, timestamp, signature } }  // 小红书图文
  | { status: 1, picData: string[], content, scheme }                   // 点评/朋友圈弹层
  | { code: 500, message }                                              // 缺配置（如 shopuuid）

GET  /api/kuaishou/callback?code=&state=    # OAuth → token → 发布 → 落 events
POST /api/events
POST /api/admin/stores | assets/scan | copies/generate | pages
```

`need_scheme=1` 只对 `redbook_publish` 生效（与实测一致）。

---

## 10. 三个功能的实现细节

### 10.1 视频发布

**抖音**（`server/src/platforms/douyin.ts`）

```
snssdk1128://openplatform/share
  ?share_type=h5
  &client_key=<DOUYIN_CLIENT_KEY>
  &nonce_str=<16hex>
  &timestamp=<unix>
  &state=<share_id>
  &image_path=
  &video_path=<urlencode(公网 https mp4)>
  &share_to_publish=1
  &title=<urlencode(文案)>
  &short_title=<urlencode(前 20 字)>
  &poi_id=<douyin_poi_id>
  &title_hashtag_list=<urlencode(JSON[{name,start}])>
  &signature=<按官方分享签名规则计算>
```

要点：
- 素材 `status!==1` 直接返回 `{status:0}`，前端轮询
- 签名密钥只在服务端 `creds` 表，绝不下发
- `share_to_publish=1` 是「直达发布页」的关键，漏了就只分享不发布

**快手**（`kuaishou.ts`）

```
authorize = https://open.kuaishou.com/oauth2/authorize
  ?app_id=<KUAISHOU_APP_ID>
  &response_type=code
  &scope=user_info,user_video_publish,user_video_info
  &redirect_uri=<PUBLIC_BASE_URL>/api/kuaishou/callback
  &state=<uuid>
前端跳： kwai://webview?url=<encodeURIComponent(authorize)>
回调后：code → access_token → photo/start_upload → photo/publish → 落 events
```

`kwai://webview` 这层包装是快手内打开授权页的必要条件。

**小红书视频**（`xhs.ts`）
优先 `xhsdiscover://miniapp/<XHS_MINIAPP_ID>/pages/post/post?uuid=&key=redbook_publish&timestamp=`；无小程序则退 growth SDK `type:'video'`。

### 10.2 点评收藏

```ts
// dianping.ts
scheme  = `dianping://shopinfo?shopuuid=${store.dianping_shop_uuid}`
payload = { picData: pickImages(storeId, 3), content: pickCopy(storeId,'dianping'), scheme }
```

前端（`ClipboardSheet.vue`）：
- 弹层显示文案 + 「一键复制」+ 第二步「点开图片，长按保存」
- `!isIOS() && copyToClipboard(content)`（Android 自动写；iOS 需用户手势，故改手动按钮）
- 底部「跳转大众点评」→ `location.href = scheme`
- `shopuuid` 为空 → `{code:500, message:'未配置点评店铺ID'}`，按钮置灰

### 10.3 图文发布

**小红书图文**：后端返回 `ext{content,images,appKey,nonce,timestamp,signature}` →
1. 前端 `$copyText(content)` → toast「文案已复制」
2. `xhs.share({ shareInfo:{ type:'normal', title:'', content:'', images }, verifyConfig })`
3. 拿 `urlSchema` → `location.href`（SDK 内部 `POST //edith.xiaohongshu.com/api/sns/v1/ext/check/token` 换 `share_code`）
4. 失败降级：只复制文案 + 提示手动发

**朋友圈**：`{picData[], content}`，页面给三步图文引导（保存图片 → 复制文案 → 去朋友圈粘贴），纯半自动。

---

## 11. 前端平台差异

```ts
const isWechat = () => /micromessenger/i.test(navigator.userAgent)
const isIOS    = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

if (isWechat()) return showWechatMask()   // 任意动作都拦，显示引导图
```

- **iOS**：不自动写剪贴板；`location.href = scheme` 后用 `visibilitychange` 判断是否成功唤起，没唤起提示「请确认已安装 App」
- **Android**：自动写剪贴板；抖音可选 `intent://` 兜底（部分 ROM 拦截 scheme）
- **轮询**：`status===0` 时 3s × 60 次，loading 文案「正在准备素材…」

---

## 12. 后台（本地优先，随时可搬）

- 入口 `http://127.0.0.1:8787/admin`，`ADMIN_BIND=127.0.0.1` 只本机可达
- 页面：门店 CRUD（`shopuuid` / `douyin_poi_id` / 品牌卖点）、素材扫描与预览、文案列表（来源/平台/使用次数，可停用/重生成）、页面配置与二维码
- 部署：`ADMIN_BIND=0.0.0.0` + `ADMIN_TOKEN` Bearer 保护；`deploy/` 提供 systemd unit、nginx 反代（`/media` 直出、`/api` 反代）、pm2 ecosystem
- 迁移：整目录拷 `data/` + `media/` 即可，无外部依赖

---

## 13. 失败模式与降级

| 情形 | 行为 |
|---|---|
| 缺 `client_key` / `appKey` / `shopuuid` | `{code:500}` + 具体缺项；前端置灰「该渠道未配置」 |
| 素材未就绪 / 探测失败 | `{status:0}` 轮询 → 超时 toast；后台标红 |
| DeepSeek 无 key / 429 / JSON 坏 | 整批重试 3 次 → `fallback.ts` 模板池兜底，`source='fallback'` |
| 生成结果近重复 | 丢弃重试，`gen_logs` 记原因；3 次后兜底 |
| 微信内 | 引导图，不跳转 |
| App 未安装 | `events.result='no_app'` + 提示安装 |
| 快手授权拒绝 / token 过期 | 回 H5 toast 错误，可重试 |
| scheme 被 ROM 拦截 | `intent://` 兜底或引导手动打开 |

---

## 14. 测试方案

1. **单测（vitest）**：5 个 scheme builder 快照测试，fixture 用 [EVIDENCE.md](./EVIDENCE.md) 里的真实响应；`dedupe.ts` 用构造样本验证阈值；`pick.ts` 抽样验证随机分布
2. **去重实测**：一次跑 42 条（模拟 7 天），断言两两 Jaccard ≤ 0.82、hash 无碰撞
3. **集成**：`/api/redirect` 每个 key 的响应形状 + `status:0` 分支 + 缺配置 500
4. **E2E（Playwright）**：UA 切换验证微信拦截、iOS/Android 剪贴板分支、点评弹层
5. **真机矩阵**：每平台 iOS+Android 各一条记录，落 `docs/real-device-matrix.md`

---

## 15. 假设与范围外

**假设**
- 具备或可申请抖音开放平台、快手开放平台、小红书开放平台/小程序资质；都没有时仍可跑通「点评收藏 + 朋友圈图文」两条零资质链路，其余按钮自动降级为「复制文案 + 手动发布」
- 有手机可达的 HTTPS 或局域网地址用于 H5 与素材直链
- 商家素材格式合规（mp4/h264、jpg/png）

**范围外**
- 百度/高德/美团打卡、视频号、关注类、WiFi、红包营销
- 多商户 SaaS 化（暂按单商户多门店）
- 商家后台的完整权限体系（仅本地 token 保护）

---

## 16. 里程碑

| 里程碑 | 内容 | 估时 |
|---|---|---|
| M0 | 清根目录垃圾；初始化 `linkhub/`（pnpm + Express + Vue3 + SQLite + .env） | 0.5d |
| M1 | 素材子系统：扫描/探测/入库/随机挑选 + 后台素材页 | 0.8d |
| M2 | 文案子系统：DeepSeek 客户端 + 维度池 + 四道去重闸 + cron + 兜底 | 1.2d |
| M3 | 顾客页 + `/api/page` `/api/redirect` 框架 + 点评收藏 + 微信拦截 + 剪贴板组件 | 1.2d |
| M4 | 抖音视频发布（签名 + 轮询） | 1d |
| M5 | 小红书视频 + 图文（SDK/miniapp + 降级） | 1.5d |
| M6 | 快手 OAuth + 服务端代发 | 1.5d |
| M7 | 本地后台完善 + 部署件 + 单测/E2E/真机表 | 1d |

合计约 **8.7 人日**。

- **M2 结束**：可看到每天自动产出的文案
- **M3 结束**：可真机演示「点评收藏 + 朋友圈图文」两条零资质链路
