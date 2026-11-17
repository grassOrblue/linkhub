# Linkhub

手机门店分享页 + 本地商家后台，支持素材上传、文案生成与平台跳转。依据 [实施计划](docs/PLAN.md) 与 [脱敏接口证据](docs/EVIDENCE.md) 实现。

> 项目处于开发验证阶段：签名、授权上传、素材和后台代码已实现；真实平台携带素材发布仍需自有开放平台资质、公网 HTTPS 及真机验收，不应将自动测试通过视为发布能力验收完成。

| 渠道 | 实现路线 | 使用前提 |
|---|---|---|
| 抖音视频 | H5 分享 scheme、ticket 签名、视频/话题/POI | 自有开放平台应用与权限 |
| 快手视频 | OAuth 授权、分片上传、提交发布 | 自有应用、发布权限、HTTPS 回调 |
| 小红书图文/视频 | 官方 SDK 双次签名，或自有小程序入口 | 自有应用；小程序需另外实现 |
| 大众点评收藏 | 打开门店页，用户自行收藏 | 门店 shopuuid |
| 朋友圈 | 保存图片、编辑并复制文案 | 用户手动发布 |

后台提供门店资料、素材上传与探测、文案管理、页面配置和二维码。缺平台资质时可使用手动发布降级流程。

## 启动

需要 Node >=24.11、npm、ffmpeg（含 ffprobe，加入 PATH，或在 `.env` 设置 `FFMPEG_BIN_DIR` 为二者所在目录）。采用 Node 自带 SQLite，减少 Windows 原生模块编译；数据仍是可迁移的 SQLite 文件。使用 npm lockfile 代替依赖 corepack 下载的 pnpm。

```bash
git clone https://github.com/grassOrblue/linkhub.git
cd linkhub
npm ci
```

首次安装时复制环境模板：Windows PowerShell 使用 `Copy-Item .env.example .env`，Linux/macOS 使用 `cp .env.example .env`。已有 `.env` 时保留原配置。

编辑 `.env`，至少将 `PUBLIC_BASE_URL` 改成手机可访问的地址，如 `http://192.168.1.20:8787`；`FFMPEG_BIN_DIR` 可指向 ffmpeg/ffprobe 所在目录，如 Windows 的 `C:/tools/ffmpeg/bin`。

```bash
npm run build
npm start
```

后台：`http://127.0.0.1:8787/admin`。默认仅允许本机访问；配置 ADMIN_TOKEN 后需在后台输入口令。开发时 `npm run dev` 自动重启服务，修改前端后重新 `npm run build`。

1. 建立门店，填写真实介绍、点评 shopuuid、抖音 POI。ID 由后台分配。
2. 打开后台“素材管理”，选择上传所属门店，上传 JPG/PNG 图片或 H.264 MP4 视频。每次最多9个文件，单张图片≤10MB，单个视频≤500MB；自动去重、探测并生成封面。也可继续把文件放入 `media/<ID>/image/` 或 `media/<ID>/video/` 后点击扫描。
3. 在素材管理中确认“就绪”；进入“文案管理”生成文案，核对草稿中的门店信息。素材、文案和分享页面均可按门店筛选。
4. 创建页面、选择渠道，后台生成链接和二维码；手机与电脑连接同一局域网，访问 `/p/<uuid>`。Windows 防火墙须允许所用端口。
5. 正式发布配置公网 HTTPS 域名。App 厂商服务器拉取素材时无法访问私网地址；局域网仅用于 H5 和保存图片的联调。

## 平台接入

- **抖音**：自有应用开通 `h5.share` 与 `open.get.ticket`；设置 `DOUYIN_CLIENT_KEY`、`DOUYIN_CLIENT_SECRET`。服务端缓存 client token/ticket，使用官方 nonce/ticket/timestamp MD5 签名。也可临时提供有效 `DOUYIN_SHARE_TICKET`；计划中的 `DOUYIN_SIGN_SECRET` 并非正确签名参数，已替换。
- **快手**：设置自有 `KUAISHOU_APP_ID`、`KUAISHOU_APP_SECRET`，配置回调 `${PUBLIC_BASE_URL}/api/kuaishou/callback`，申请视频发布权限。用户明确选择此动作并授权后，回调执行分片上传和发布。随机 state 绑定已选素材与文案，10 分钟过期且只能消费一次。重复回调不会重复发作品。平台返回受理时显示“已提交”，只有明确 pending=false 才显示“已发布”；如结果不确定，先查看快手作品列表再重试。
- **小红书**：设置自有 `XHS_APP_KEY`、`XHS_APP_SECRET`，登记实际域名。服务端先获取 access_token，再用 token 生成第二次 SHA-256 签名；官方 SDK 负责媒体分享。标题、正文不自动填充，用户需复制后粘贴。设置 `XHS_MINIAPP_ID` 时视频改走自有小程序；该小程序必须自行实现 `pages/post/post`，按 query 中 `api_base`、`session` 调用 `/api/xhs/session/:session` 获取本次素材，不能填入参考站的小程序 ID。
- **点评**：填写自己的 `dianping_shop_uuid`，仅打开店铺页，收藏由用户完成。图片和文案通过弹层保存、复制。
- **朋友圈**：无直接发布 scheme。保存图片、复制文案，用户自行打开微信发布。不使用证据中的无效 `wx://`。

缺资质渠道展示“未配置”，点击可保存门店图片后手动发布；接口仍明确报告缺失配置。微信内所有分享动作先显示外部浏览器引导。异步准备后提供第二次点击打开 App，保留用户手势；页面离开只代表观察到切后台，不能证明已发布或已安装 App。

顾客弹层中的文案可在复制前编辑，仅影响本次分享；小红书 SDK 分享按钮也复制编辑后的内容。修改不会回写商家文案库或其他顾客的草稿。

## 文案与素材

每天上海时间 03:00 按门店生成 6 条（3 抖音、2 小红书、1 点评）；当天达到配额则跳过。DeepSeek 使用环境变量，不读取其他项目密钥。批量 JSON 请求、最多3次尝试；无 key/失败使用明确标注 `fallback` 的推广备忘草稿。近30天维度排除、最近500条3-gram Jaccard≤0.82、最近200条标题相似度≤0.9、归一化 hash 唯一索引。有限模板池耗尽时记录缺额，不用重复文案伪装成功；后台可查看日志和补生成。

素材按门店与内容 hash 去重，优先使用最久未用素材，同档随机。图片每次最多3张（不足时返回现有数量），视频1条。缺 ffprobe/ffmpeg 会标为未就绪，安装后重新扫描。移动素材到其他目录后要重新扫描。停止服务后复制整个 `data/` 与 `media/` 即可迁移；URL 每次按 PUBLIC_BASE_URL 重新生成。

## 验证

```powershell
npm run check
npm test
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
npm audit
```

接口测试隔离使用临时数据库；E2E 数据在 `.tmp/`。包含签名与编码、OAuth state、缺配置/缺素材、渠道停用、鉴权、42条去重、每日幂等、微信拦截、iOS/Android复制分支、手机宽度与后台渲染。UA 模拟不等于 iOS Safari 实机；实际验收见 [真机矩阵](docs/real-device-matrix.md)。

## 部署

提供 `deploy/linkhub.service`、`deploy/nginx.conf`、`deploy/ecosystem.config.cjs`。构建后启动 Node 服务；部署路径按文件中的 `/opt/linkhub` 修改，环境放 `.env` 并限制为运行用户可读。单进程运行 SQLite 和定时任务，勿启用 PM2 cluster。反代默认禁止后台公开访问，使用 SSH 本机端口转发管理。确需远程后台时设置 `ADMIN_BIND=0.0.0.0`、至少24位随机 ADMIN_TOKEN，并自行限制反代来源；不要把无口令的后台通过本机代理暴露到公网。

PUBLIC_BASE_URL 必须是对外 HTTPS origin；开放平台登记的回调与域名白名单应一致。服务端会缓存平台短期 token 于 SQLite，备份数据库与 `.env` 时应按密钥文件保护。没有真实资质、商家素材和手机设备，不能宣称已完成各 App 实机发布验收。

## 目录与版本管理

```text
server/src/       服务端、渠道接口、素材和文案处理
server/test/      接口与核心逻辑测试
web/src/          Vue3 顾客页与商家后台
web/test/         Playwright 页面测试
deploy/          systemd、nginx、PM2 示例
docs/            计划、脱敏证据与验收记录
```

`.env`、本地数据库、商家素材、导入记录、依赖、构建产物及测试截图均不提交 Git。首次启动自动建立 `data/` 和 `media/`。仓库不包含测试商家的真实资料和素材，也不包含 FFmpeg 二进制，需自行配置。

最近本地验证：13项接口测试、7项浏览器测试、类型检查与生产构建通过；另有真实 H.264 视频上传、封面与去重自检通过。平台网络接口使用模拟响应，iOS/Android 的真实发布结果以 [真机矩阵](docs/real-device-matrix.md) 为准。若使用已有 Chromium，可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 后执行 E2E。
