# 在自己电脑上跑 projectM

这是一份给**第一次拿到仓库**的人看的教程。做完后，浏览器打开本机地址就能用。数据只存在你这台电脑上。

产品做什么、各页有哪些功能：见 [README.md](../README.md)。

整站是单用户、本地运行。不需要公网、不需要注册本站账号。

已经会用终端、只想抄命令的，看下面「熟手」。第一次装 Node 的从第 0 步顺着做。

---

## 熟手

Windows 可直接跑脚本（会 `npm install`、建 `local/`、迁移数据库，再用 `npm.cmd` 避开 PowerShell 拦脚本）：

```bat
scripts\dev.cmd
```

长期开着、少占资源用生产模式：

```bat
scripts\prod.cmd
```

也可以自己敲命令。先 `npm install`（PowerShell 若报禁止运行脚本，改用 `npm.cmd install`）。

把 `.env.example` 复制为 `local/.env` 并填 Key（没有 `local` 就先建）：

- Windows：`New-Item -ItemType Directory -Force -Path local; Copy-Item .env.example local\.env`
- macOS / Linux：`mkdir -p local && cp .env.example local/.env`

```bash
npx prisma migrate deploy
npm run dev
```

浏览器打开 http://localhost:3000

换电脑：`git pull`，把另一台的 `local/` 整个放到工程根目录（和 `package.json` 同级），再 `npm install`、`npm run dev`。`local/` 不进 git，里面是 Key、数据库、Steam 备份。

各项 Key 的申请方式见第 3 节。

---

## 你将得到什么

- 本机网页：`http://localhost:3000`
- 一份 SQLite 数据库（电影、书、游戏记录）
- 可选：接上 TMDB / Google Books / Steam，才能搜索真实资料

没有填某类 API Key 时，对应类型的搜索会提示「未配置」，不会假装成功。可以先把网站跑起来，再慢慢补 Key。

---

## 0. 准备软件

需要两样（都免费）：

| 软件 | 用来干什么 | 建议版本 |
|------|------------|----------|
| [Node.js](https://nodejs.org/) | 跑这个网站 | **20.9 或更高**（LTS 即可） |
| [Git](https://git-scm.com/) | 下载仓库（也可改用网页下载 ZIP） | 任意近期版本 |

安装 Node.js 时勾选把 `npm` 加进 PATH。装完**新开一个**终端，检查：

```bash
node -v
npm -v
```

应分别看到 `v20` / `v22` 之类，以及一个 npm 版本号。如果提示找不到命令，多半是没重开终端，或安装时没加 PATH。

Windows 用 **PowerShell** 或 **命令提示符** 都行；下面 Windows 命令按 PowerShell 写。macOS / Linux 用终端。

---

## 1. 拿到代码

### 方式 A：Git 克隆（推荐）

把下面的地址换成你实际拿到的仓库地址：

```bash
git clone <仓库地址> projectM
cd projectM
```

### 方式 B：下载 ZIP

在 GitHub / Gitea 等页面下载 ZIP，解压到任意目录（路径里尽量不要有中文和空格），进入解压后的工程根目录——能看到 `package.json` 的那一层。

---

## 2. 安装依赖

在工程根目录执行：

```bash
npm install
```

第一次会下一小会儿。成功后会出现 `node_modules` 文件夹。

---

## 3. 创建 `local` 并填写配置

密钥、数据库、Steam 备份都放在工程根目录下的 **`local/`** 里。这一夹**不要提交 git**，也不要发给别人。

### 3.1 生成配置文件

**Windows（PowerShell）：**

```powershell
New-Item -ItemType Directory -Force -Path local
Copy-Item .env.example local\.env
```

**macOS / Linux：**

```bash
mkdir -p local
cp .env.example local/.env
```

用记事本、VS Code 等打开 `local/.env`。每一行是 `名字=值`，不要加空格，不要加引号（除非值本身需要）。

### 3.2 各项含义

| 变量 | 要不要填 | 作用 |
|------|----------|------|
| `TMDB_API_KEY` | 想搜电影或电视剧就填 | 电影 / 电视剧资料（中文名、海报、年份） |
| `GOOGLE_BOOKS_API_KEY` | 想搜书就填 | 书名 / ISBN |
| `STEAM_API_KEY` | 想搜游戏就填 | Steam 商店搜索 |
| `STEAM_STEAMID` | 想用游戏页资料栏就填 | 公开资料、库存、最近游玩 |
| `STEAM_ACCESS_TOKEN` | 可选 | 家庭库列表和时长；大约一天过期 |
| `STEAM_REFRESH_TOKEN` | 可选 | 用来自动换新的 access token，约一年有效 |

下面按「电影 → 书 → 游戏」写申请步骤。只想先看界面的，可以全留空，跳到第 4 步。

### 3.3 电影：TMDB

1. 打开 [https://www.themoviedb.org/](https://www.themoviedb.org/) 注册并登录。
2. 进入账号设置里的 [API](https://www.themoviedb.org/settings/api)，申请开发者密钥。
3. 复制 **API Key（v3 auth）**，不要用 v4 Read Access Token。
4. 填进 `local/.env`：

```
TMDB_API_KEY=这里粘贴
```

国内访问 TMDB 有时不稳定。本站请求的是官方 `api.tmdb.org`。若搜索电影一直「连不上」，先检查本机能否打开 TMDB 网站。

### 3.4 书：Google Books

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，登录 Google 账号。
2. 新建一个项目（或选已有项目）。
3. 在「API 和服务 → 库」里搜索 **Books API**，启用它。
4. 「API 和服务 → 凭据 → 创建凭据 → API 密钥」。
5. 把密钥填进 `local/.env`：

```
GOOGLE_BOOKS_API_KEY=这里粘贴
```

建议在凭据里把该密钥限制为仅「Books API」，避免被滥用。个人自用、密钥不外传即可。

### 3.5 游戏：Steam

**Web API Key（搜索游戏用）**

1. 用 Steam 账号打开 [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)。
2. Domain 可填 `localhost`。
3. 填进 `local/.env`：

```
STEAM_API_KEY=这里粘贴
```

**SteamID（游戏页：资料、库存、最近游玩）**

要填 **17 位 SteamID64**，或资料页里设过的**自定义主页名**。

查 SteamID64 的一种办法：浏览器打开自己的 Steam 社区资料，看地址栏。若是 `https://steamcommunity.com/profiles/7656119......../`，斜杠里那串数字就是。若是 `https://steamcommunity.com/id/你的名字/`，把 `你的名字` 填进 `STEAM_STEAMID` 也可以（资料需公开）。

```
STEAM_STEAMID=7656119........
```

库存、游戏时长、最近游玩依赖 Steam 资料的公开设置。若页面提示找不到公开资料，到 Steam 隐私设置里把「游戏详情」设为公开后再试。

**家庭库（可选，可先不填）**

- `STEAM_ACCESS_TOKEN`：浏览器登录 [Steam 商店](https://store.steampowered.com/) 后打开 [这页](https://store.steampowered.com/pointssummary/ajaxgetasyncconfig)，把 JSON 里的 `webapi_token` 整段贴过来。大约一天过期，过期再复制一次。
- `STEAM_REFRESH_TOKEN`：Steam 客户端 / 令牌里的 `refresh_token`（有效期约一年）。填了之后本站会自动换新的 access token，不必每天更新。**商店页复制的 `webapi_token` 不是 refresh_token，不要填在这一项。**

令牌等同登录凭证。只放在你自己电脑的 `local/.env` 里，不要提交、不要截图发群。

---

## 4. 初始化数据库

仍在工程根目录：

```bash
npx prisma migrate deploy
```

会在 `local/dev.db` 生成 SQLite 库（没有 `local` 文件夹时先做第 3 步）。看到迁移成功即可。

若提示找不到 `prisma`，先确认第 2 步 `npm install` 已完成。

---

## 5. 启动网站

日常自用，开发模式就够：

```bash
npm run dev
```

终端出现类似 `Local: http://localhost:3000` 后，用浏览器打开：

[http://localhost:3000](http://localhost:3000)

**不要关这个终端窗口**，关了网站就停了。要停掉：在该终端按 `Ctrl+C`。

下次开机再用：进入工程目录，再执行一次 `npm run dev`（一般不必重新 `npm install`，除非你 `git pull` 之后依赖变了）。

### 可选：生产模式

占用更少、更接近「部署」。先停掉 `npm run dev`，然后跑 `scripts\prod.cmd`，或自己执行：

```bash
npm run build
npm start
```

同样打开 [http://localhost:3000](http://localhost:3000)。改代码后要重新 `build` 才会生效；自用改着玩时继续用 `npm run dev` 更方便。

### 局域网里用手机访问（可选）

默认只监听本机。若手机和电脑在同一 Wi-Fi，可在电脑上执行：

```bash
npx next dev -H 0.0.0.0
```

然后用电脑的局域网 IP（例如 `http://192.168.1.8:3000`）在手机打开。这不是公网部署，外网打不开。Windows 若访问失败，检查防火墙是否放行 3000 端口。

---

## 6. 怎么确认成功

1. 首页能打开，能切换电影 / 电视剧 / 图书 / 游戏。
2. 配置了对应 Key 后：打开「搜索」，能搜到真实结果，可加入。
3. 加入后刷新仍在（数据在 `local/dev.db`）。
4. 游戏页：填了 `STEAM_STEAMID` 且资料公开时，能看到库存 / 最近游玩等。本地还没有备份时会请求 Steam，并写入 `local/steam-cache.json`；之后默认读这份备份。

---

## 7. 日常备份与换电脑

`local/` 整夹就是你的私人数据：

| 文件 | 内容 |
|------|------|
| `.env` | API Key、Steam 令牌 |
| `dev.db` | 你的条目和打分短评 |
| `steam-cache.json` | Steam 资料、库存、完美、游戏详情备份 |
| `snapshots/` | 自动滚动备份：`dev.db` + Steam 备份，有更新才写，最多 5 份 |

备份：把 `local` 拷到 U 盘或网盘（不要公开分享）。

换电脑：

1. 在新电脑按第 1～2 步拿到代码并 `npm install`
2. 把旧电脑的 **整个 `local` 文件夹**放到工程根目录（和 `package.json` 同级）
3. `npm run dev`

不要只拷 `.env` 而丢掉 `dev.db`，否则记录会空。

---

## 8. 更新代码

你是用 git 克隆的：

```bash
git pull
npm install
npx prisma migrate deploy
npm run dev
```

`npm install` 和 `migrate` 在没有新依赖、没有新数据库变更时多跑也无妨。ZIP 用户则重新下载解压，再把原来的 `local` 文件夹覆盖进去。

---

## 9. 常见问题

**`node` / `npm` 不是内部或外部命令**  
Node.js 没装好，或装完没重开终端。

**`npm install` 很慢或失败**  
网络问题。可换 [npmmirror](https://npmmirror.com/) 后再装：

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

**端口 3000 被占用**

```bash
npx next dev -p 3001
```

改用 `http://localhost:3001`。

**搜索提示「未配置」**  
对应 Key 没写进 `local/.env`，或写错了变量名。改完 `.env` 后**重启** `npm run dev`（环境变量在启动时读取）。

**电影搜不到 / 连不上 TMDB**  
Key 无效，或本机访问 TMDB 被阻断。先在浏览器打开 [https://www.themoviedb.org/](https://www.themoviedb.org/) 试网络。

**游戏页没有库存**  
检查 `STEAM_STEAMID` 是否正确；Steam 隐私里「游戏详情」是否公开。家庭库还需要有效的 access / refresh token。

**`prisma migrate` 报错找不到 `local/dev.db`**  
先做第 3 步，确保已有 `local` 目录。

**误把 `local` 提交到 git**  
立刻作废已暴露的 API Key 和 Steam 令牌（各平台控制台 / Steam 重新生成），本地从 git 里拿掉后再推送。密钥一旦进过远程仓库，只改 `.gitignore` 不够。

---

## 不要做什么

- 不要爬取或调用豆瓣、小黑盒及非官方代理。
- 不要把 `local/.env`、数据库、Steam 令牌发到公开仓库或聊天里。
- 这是个人记录站，没有账号系统，也不适合当成给很多人同时用的公网服务。
