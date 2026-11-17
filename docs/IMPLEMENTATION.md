# 实现状态

当前交付：Vue3 顾客页与商家后台、Express API、Node 内置 SQLite、素材扫描及上传、每日文案调度与去重、渠道分享接口、二维码及部署示例。

## 与历史计划的差异

- 使用 npm 和 lockfile 管理一个应用，不引入 workspace；Node >=24.11 自带 SQLite，避免本机原生模块编译。
- 抖音通过 client secret 换取 ticket，或使用有效短期 ticket；不把 app secret 当作 H5 分享签名密钥。
- 小红书先换 access_token，再生成 SDK 分享签名；文案通过剪贴板传递。自有小程序入口所需的小程序本体不在此仓库中。
- 异步准备完成后由用户点击打开 App。页面切后台只视为唤起观察，不视为发布成功。
- 快手返回 pending 时只显示已提交；使用一次性 state 降低重复回调造成重复发布的风险。
- 图片当前每次最多3张；不足3张返回现有数量。朋友圈仍为手动保存图片与粘贴文案。
- 平台密钥从服务端环境变量读取，短期 token 缓存于本地数据库。

## 已验证

- TypeScript 检查与生产构建通过。
- 13项接口测试：签名参数、双次签名、授权 state、后台鉴权、42条去重、每日幂等、素材扫描与上传校验、去重及门店隔离。
- 7项无界面浏览器测试：手机布局、微信引导、复制分支、后台导航筛选、图片上传、文案编辑与 SDK 复制。
- 本地真实 H.264 编码、视频上传、ffprobe 探测、封面生成及重复上传去重自检通过。

自动测试中的开放平台接口采用模拟响应；当前尚不能宣称各平台真实发布已验收。设备验收见 [真机矩阵](real-device-matrix.md)。

## 平台资料

- [抖音 H5 分享](https://open.douyin.com/platform/resource/docs/develop/share/H5)
- [小红书 JS SDK](https://agora.xiaohongshu.com/doc/js)
- [快手 OAuth](https://open.kuaishou.com/platformDocs/openAbility/kwaiLogin)
- [快手视频上传与发布](https://open.kuaishou.com/platformDocs/openAbility/contentManagement/createAVideo.html)

本地导入记录、商家素材和原始采集备份均不进入仓库。产品管理、手动目标链接配置和 AI 配置表单尚未合入。
