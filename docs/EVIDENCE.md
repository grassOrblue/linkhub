# 线上实测证据（脱敏 scheme / 接口样本）

> 采集对象：`https://xiaomotui.com`（小魔推）顾客端页面 + `https://api.pyp.canzan.com`
> 采集方式：静态资源全量抓取（635 个 JS chunk，7.6 MB）+ 直接复现后端跳转接口
> 用途：作为 linkhub 的 **scheme 快照测试 fixture** 与实现参照。仓库版已将应用标识、会话、签名及素材地址替换为占位示例，只保留协议结构。自己的应用资质必须在对应开放平台申请。

---

## 1. 关键接口

### 1.1 跳转配置接口（前端唯一入口）

```
POST https://api.pyp.canzan.com/mobile/touch/redirect_url
Content-Type: application/json
Referer: https://xiaomotui.com/

{
  "key": "douyin_publish",          // 目标平台
  "uuid": "88c0302a-...",           // 门店页 uuid
  "open_id": "<encrypted-open-id>",         // AES 加密的微信身份（iv/value/mac/tag）
  "staff_uuid": "",                 // 员工归因
  "need_scheme": 0,                 // 仅 redbook_publish 传 1
  "ext_params": {}
}
```

源码位置（对方站点）：`static/index/js/mobile-32be91c9.js`

```js
const n = t => e({
  url: 'mobile/touch/redirect_url',
  method: 'POST',
  data: { ...t, extra: r, ...(task_token ? { task_token } : {}) }
})
```

### 1.2 页面配置接口

```
GET https://api.pyp.canzan.com/mobile/touch/get_page_layout?uuid=<uuid>&open_id=<open_id>
→ { code:0, data:{ page_title, page_subtitle, store_title, store_logo, page_layout:{...}, h5_phone, ... } }
```

### 1.3 其他相关

| 端点 | 用途 |
|---|---|
| `mobile/video_task/info?token=` | 任务页信息 |
| `mobile/touch/transfer_auth` | 微信收款授权（红包场景） |
| `mobile/touch/e_driving` | e代驾表单（返回 `h5_url`） |
| `mobile/marketing/activity/*` | 营销活动 |

---

## 2. 各平台真实返回（可作 fixture）

> 以下结构来自采集响应，但标识、nonce、签名和素材 URL 已脱敏，不能用于调用原站或直接唤起发布。

### 2.1 `douyin_publish` — 抖音发布

```json
{
  "status": 1,
  "share_id": "1882090367206408",
  "couponUrl": false,
  "scheme": "snssdk1128://openplatform/share?share_type=h5&client_key=example-douyin-client-key&nonce_str=00000000000000000000000000000000&timestamp=1794901251&state=1882090367206408&image_path=&video_path=https%3A%2F%2Fmedia.example.com%2Foutput%2F1%2F1%2F44446%2F871555920538937.mp4&share_to_publish=1&title=%F0%9F%8C%BF%E7%8E%AF%E5%A2%83...&short_title=...&poi_id=6816965329281910798&title_hashtag_list=%5B%7B%22name%22%3A%22%5Cu70e4%5Cu9e2d%22%2C%22start%22%3A100%7D%2C...%5D&signature=00000000000000000000000000000000"
}
```

**参数清单（顺序无关，但字段名必须一致）**

| 参数 | 说明 |
|---|---|
| `share_type` | 固定 `h5` |
| `client_key` | 抖音开放平台应用标识 |
| `nonce_str` | 32 位 hex 随机串 |
| `timestamp` | Unix 秒 |
| `state` | `share_id`，用于回查 |
| `image_path` | 图文场景用，视频留空 |
| `video_path` | **公网可直接拉取的 mp4 URL**，需 urlencode |
| `share_to_publish` | `1` = 直达发布页（关键） |
| `title` / `short_title` | 正文 / 20 字以内短标题 |
| `poi_id` | 抖音 POI，带门店定位 |
| `title_hashtag_list` | `[{"name":"烤鸭","start":100}]` 的 JSON 再 urlencode |
| `signature` | 32 位 hex，服务端按官方分享签名规则计算 |

`title_hashtag_list` 解码后形如：

```json
[{"name":"烤鸭","start":100},{"name":"现烤现卖","start":100},{"name":"新鲜出炉","start":100},{"name":"北京烤鸭","start":100}]
```

### 2.2 `kwai_publish` — 快手发布

```json
{
  "status": 1,
  "share_id": "...",
  "scheme": "https://open.kuaishou.com/oauth2/authorize?app_id=example-kuaishou-app-id&response_type=code&scope=user_info%2Cuser_video_publish%2Cuser_video_info&redirect_uri=https%3A%2F%2Fapi.pyp.canzan.com%2Fcallback..."
}
```

前端二次包装：

```js
window.location.href = `kwai://webview?url=${encodeURIComponent(t.scheme)}`
```

**说明**：快手这条不是「带内容跳转」，而是 `OAuth 授权 → 服务端拿 access_token → 调发布接口代发`。`scope` 必须含 `user_video_publish`。

### 2.3 `redbook_publish` — 小红书视频（`need_scheme=1`）

```json
{
  "status": 1,
  "scheme": "xhsdiscover://miniapp/example-xhs-miniapp-id/pages/post/post?uuid=00000000-0000-4000-8000-000000000000&staff_uuid=&open_id=<加密串>%3D%3D&key=redbook_publish&timestamp=1794901279",
  "ext": []
}
```

**说明**：跳的是**对方自建的小红书小程序**，scheme 里只带 `uuid`，素材在小程序内取。

### 2.4 `redbook_ic_publish` — 小红书图文

```json
{
  "status": 1,
  "scheme": "",
  "ext": {
    "write_stream": false,
    "write_code": "",
    "title": "救我！这家烤鸭让我疯狂安利给所有人！",
    "content": "宝子们！挖到一家让我疯狂心动的烤鸭店！！...",
    "images": [
      "https://media.example.com/1/1/material/20250427/jpeg/00000000000000000000000000000000.jpeg?x-oss-process=image/auto-orient,1/strip",
      "..."
    ],
    "appKey": "example-xhs-app-key",
    "nonce": "00000000000000000000000000000000",
    "timestamp": 1794901280000,
    "signature": "0000000000000000000000000000000000000000000000000000000000000000",
    "miniappSessionInfo": { "share_id": "example-share-id" },
    "tags": "脆皮烤鸭,新鲜出炉,烤鸭",
    "poi_id": ""
  }
}
```

**说明**：`scheme` 为空 → 前端走官方 growth SDK，`ext` 里的 5 个字段就是 `verifyConfig`。

### 2.5 `sph_publish` — 微信视频号（走不通）

```json
{
  "status": 1,
  "scheme": "wx://",
  "ext": {
    "title": "🌿环境:...",
    "content": "🌿环境:... #北京烤鸭 #新鲜出炉",
    "video": "https://media.example.com/output/1/1/44446/871555922993881.mp4"
  }
}
```

**结论**：`wx://` 是无效占位，`window.location.href = 'wx://'` 打不开任何东西。视频号发布这条路前端走不通，`ext` 里的内容也无法自动带入。

### 2.6 `pyq_publish` — 朋友圈

```json
{
  "write_stream": false,
  "write_code": "",
  "picData": ["https://...png", "https://...jpg", "https://...jpg"],
  "content": "🌿环境:...",
  "scheme": "wx://"
}
```

**说明**：无可用 scheme，纯半自动（存图 + 复制）。

### 2.7 `big_three_people_punch` / `big_three_people_only_punch` — 大众点评

```json
{
  "write_stream": false,
  "write_code": "",
  "scheme": "dianping://shopinfo?shopuuid=G82hLbsWHbzzS7jo",
  "picData": ["https://...jpg", "https://...jpeg", "https://...png"],
  "content": "家庭聚餐点了整只烤鸭🥰..."
}
```

只到店铺页，文案/图片靠剪贴板 + 长按保存。

### 2.8 其他打卡类（本次不实现，仅备查）

| key | scheme |
|---|---|
| `meituan_punch` | `imeituan://www.meituan.com/food/poi/detail?id=193367618` |
| `gaode_punch` | `amapuri://poi/detail?poiid=B0FFMFN5CW&poiname=%E5%8C%97%E4%BA%AC%E7%83%A4%E9%B8%AD...&lat=34.810558&lon=113.518231` |
| `baidu_punch` | `baidumap://map/place/detail?show_type=detail_bar&uid=0828f5fc36d92d4fdbeced78` |
| `douyin_punch` | `snssdk1128://poi/detail/?id=6816965329281910798` |
| `xiecheng_collect` / `xiecheng_business_comment` | `""`（只有 picData + content） |

### 2.9 关注 / 工具类（本次不实现，仅备查）

| key | 返回 |
|---|---|
| `douyin_follow` | `snssdk1128://webview?url=https%3A%2F%2Fv.douyin.com%2FL7GQuFr9itA%2F&from=webview&refer=web` |
| `ks_follow` | `kwai://profile/2071666943` |
| `red_book_follow` | `xhsdiscover://user/60deae1900000000010041d7` |
| `sph_follow` | `weixin://dl/business/?appid=example-wechat-app-id&path=pages/attention/attention&query=sphid%3DsphSonsw43TUER5&env_version=release` |
| `sph_video_id` | `weixin://dl/business/?appid=example-wechat-app-id&path=pages/attention/attention&query=sphvideoid%3D...%26sphid%3D...&env_version=release` |
| `official_account_follow` | `https://mp.weixin.qq.com/s/JF8x_xioxglREhTf3MRh_A` |
| `wifi` | `weixin://dl/business/?appid=example-wechat-app-id&path=pages/wifi/index&query=uuid%3D...&env_version=release` |
| `wx_card` | `weixin://dl/business/?appid=example-wechat-app-id&path=pages/card/index&query=uuid%3D...&env_version=release` |
| `douyin_video_url` | `https://v.douyin.com/4NUR1LeIfMk/` |
| `e_driving` / `custom_path` | `""` |

### 2.10 错误样本

```json
{ "code": 500, "message": "未获取到图片信息" }     // big_three_people_ic
{ "code": 500, "message": "请配置携程地点信息" }   // xc_note_publish
```

---

## 3. 该门店实际开启的平台

`get_page_layout` 返回 `page_layout` 中值为 `1` 的键：

```
douyin_publish, kwai_publish, redbook_publish, sph_publish, pyq_publish,
redbook_ic_publish, big_three_people_punch, meituan_punch, gaode_punch,
baidu_punch, douyin_punch, douyin_follow, ks_follow, red_book_follow,
wifi, wx_card, custom_path, meituan_group, douyin_group, sph_follow,
sph_video_id, douyin_video_url, dzdp_group, official_account_follow, e_driving
```

页面文案：`page_title=碰一碰 领福利` / `page_subtitle=烤鸭皮脆肉嫩，满口留香` / `store_title=北京烤鸭`。

---

## 4. 前端执行器源码（对方站点，可作为实现参照）

文件：`static/index/js/mobilePerviewOne-45e009ca.js`

```js
// 抖音：轮询等素材就绪，再跳 scheme
sendDy(){
  let t=this, e=null, p=0, g=60, i=3000;
  const c=()=>{
    p++, e&&clearTimeout(e);
    t.getConfig('douyin_publish').then(({redirect_url:m})=>{
      m.status==1
        ? (t.dyRedirectLoading=t.isDouyinRedPacketPublishUrl(m.scheme),
           t.loading=!1, t.loadingText='',
           t.markVisited('douyin_publish'),
           window.location.href=m.scheme)
        : p<g ? e=setTimeout(c,i) : (clearTimeout(e), k.warning('发布视频获取超时'))
    })
  };
  c();
}

// 快手：包一层 kwai://webview
sendKs(){
  this.getConfig('kwai_publish').then(({redirect_url:t})=>{
    this.loading=!1; this.loadingText='';
    t.scheme && (this.markVisited('kwai_publish'),
                 window.location.href=`kwai://webview?url=${encodeURIComponent(t.scheme)}`)
  })
}

// 小红书视频：有 scheme 直跳，否则走 SDK
sendXhs(){ /* status!=1 时 3s×60 轮询；m.scheme ? location.href : xhsSDK(m.ext).then(h=>location.href=h.urlSchema) */ }

// 小红书图文：剪贴板 + SDK
sendXhsIc(){
  this.getConfig('redbook_ic_publish').then(({redirect_url:t})=>{
    if(t.scheme){ location.href=t.scheme; return }
    if(this.isWechat()){ this.maskBoolean=!1; this.weixinBoolean=!0; return }
    const {content:e, images:p, appKey:g, nonce:i, timestamp:c, signature:m} = t.ext;
    pt.confirm('已复制笔记内容','提示',{confirmButtonText:'确定',showCancelButton:!1,type:'success'})
      .then(()=>{
        this.$copyText(e);
        xhs.share({
          shareInfo:{ type:'normal', title:'', content:'', images:p },
          verifyConfig:{ appKey:g, nonce:i, timestamp:c, signature:m },
          success:h=>{ this.markVisited('redbook_ic_publish'); window.location.href=h.urlSchema },
          fail:h=>k.error('发布图文失败')
        })
      })
  })
}

// 打卡/点评：拿 picData + content + scheme，安卓自动复制
punch(t,e){
  if(this.isWechat()){ this.maskBoolean=!1; this.weixinBoolean=!0; return }
  this.currentPunch={key:t,name:e};
  this.getConfig(t).then(({redirect_url:p})=>{
    this.punchData={ picData:p.picData, content:p.content };
    this.punchData.scheme=p.scheme;
    this.punchData.name=e;
    this.showImage=!0;
    !this.isIos() && this.copyToClipboard(this.punchData.content);
  })
}

// 微信判定
isWechat(){ return navigator.userAgent.toLowerCase().indexOf('micromessenger') !== -1 }
isIos(){ return /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase()) }
```

模板细节：
- 弹层第一步标题「第一步」+ 右侧「一键复制」；第二步「点开图片，长按保存」
- Android 多一行提示「提示：文案自动复制」，iOS 不显示
- `dyRedirectLoading` 时整页 loading 文案改为「正在进入抖音发布页...」

---

## 5. 小红书官方 growth SDK 关键常量

文件：`https://api.pyp.canzan.com/static/js/xhs-1.0.1.js`（版本 3.7.5，24 KB）

```js
UNIVERSAL_LINK:  'https://oia.xiaohongshu.com/oia'
URL_SCHEMA:      'xhsdiscover://js_share_sdk'
APP_STORE_LINK:  'http://www.xiaohongshu.com/web_api/sns/v1/catalan/ios/5b61227acd30d845a70d3107'
YINGYONGBAO:     'http://a.app.qq.com/o/simple.jsp?pkgname=com.xingin.xhs'
TIMEOUT:         1000

// 换 share_code
POST //edith.xiaohongshu.com/api/sns/v1/ext/check/token
body: { app_key, nonce, timestamp, signature, data: base64(JSON(payload)) }
→ { success: true, data: { data_code } }

// 组装
urlSchema    = `xhsdiscover://js_share_sdk?share_code=${code}&app_key=${appKey}&session_id=${sid}`
universalLink= `https://oia.xiaohongshu.com/oia?deeplink=${encodeURIComponent(urlSchema)}`
```

唤起分支：

```js
iOS:     支持 Universal Link ? location.href = universalLink
                            : (location.href = urlSchema, 1s 后跳 App Store)
Android: location.href = urlSchema, 1s 后走应用宝
           `${YINGYONGBAO}?android_schema=${encodeURIComponent(urlSchema)}`
```

**注**：对方站点把 SDK 里的自动跳转注释掉了（`// ot({...})`），改为自己拿 `urlSchema` 跳，便于插埋点。

---

## 6. 该页面的技术栈（供选型参照）

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + Pinia + vue-router（hash 模式） |
| UI | Element Plus + Lottie |
| 构建 | 路由级 code splitting，635 个 chunk |
| 后端 | `api.pyp.canzan.com`（nginx + 自研 API） |
| 素材 | 阿里云 OSS（`media.example.com`）+ `x-oss-process` 图片处理 |
| 埋点 | 百度统计 + 自研 `mobile/marketing/*` |

---

## 7. 用这些证据做什么

1. `server/test/*.spec.ts`：把 §2 的响应体作为 fixture，断言我们的 builder 产出的 scheme **字段名、编码、必带参数**与线上一致。
2. `server/src/platforms/douyin.ts`：直接照 §2.1 的参数表实现，`share_to_publish=1` 与 `title_hashtag_list` 是最容易漏的两项。
3. `server/src/platforms/xhs.ts`：`ext` 的 5 个字段名（`appKey/nonce/timestamp/signature` + `content/images`）必须与 SDK 的 `verifyConfig` 对齐，否则 `check/token` 会拒绝。
4. 不要在代码里硬编码对方站点的 `client_key` / `app_id` / miniapp id —— 这些是对方资质，必须替换为自己申请的值。
