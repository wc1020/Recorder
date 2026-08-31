# projectM

私人豆瓣：记录看过的电影、读过的书、玩过的游戏。

**第一次在自己电脑上跑：** 按 [docs/DEPLOY.md](docs/DEPLOY.md) 从安装 Node.js 做到打开网页。下面是已经会用终端的人看的短步骤。

## 运行

```bash
npm install
```

把 `.env.example` 复制为 `local/.env` 并填 Key（没有 `local` 文件夹就先建一个）：

- Windows：`New-Item -ItemType Directory -Force -Path local; Copy-Item .env.example local\.env`
- macOS / Linux：`mkdir -p local && cp .env.example local/.env`

换电脑：`git pull`，把另一台的 `local` 文件夹整个放到工程根目录（和 `package.json` 同级），再 `npm install`、`npm run dev`。`local` 不进 git，里面是 Key、数据库、Steam 备份。

在 `local/.env` 里填入对应 API Key（没有 Key 的类型搜索时会提示未配置，不会假装成功）：

- `TMDB_API_KEY` — 电影
- `GOOGLE_BOOKS_API_KEY` — 书
- `STEAM_API_KEY` — 游戏搜索（[申请](https://steamcommunity.com/dev/apikey)，Domain 可填 `localhost`）
- `STEAM_STEAMID` — 游戏 Tab 拉公开资料 / 库存 / 最近游玩（17 位 SteamID64，或自定义主页名）
- `STEAM_ACCESS_TOKEN` — 可选，家庭库列表和时长。浏览器登录 [Steam 商店](https://store.steampowered.com/) 后打开 [这页](https://store.steampowered.com/pointssummary/ajaxgetasyncconfig)，把 `webapi_token` 贴进来。大约一天过期，过期再复制一次。
- `STEAM_REFRESH_TOKEN` — 可选。Steam 客户端 / 令牌里的 refresh_token（有效期约一年）。填了之后本站会调用 `GenerateAccessTokenForApp` 自动换新的 access_token，不必每天更新。商店页复制的 `webapi_token` 不是 refresh_token，请不要填在这一项。

```bash
npx prisma migrate deploy
npm run dev
```

浏览器打开 http://localhost:3000

## 说明

- 数据：TMDB / Google Books / Steam，不爬豆瓣、不爬小黑盒
- Key 只放环境变量，只在服务端请求
- 大纲：`docs/PLAN.md`
