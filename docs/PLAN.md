# projectM 大纲

个人媒体记录站：电影、书、游戏。体验接近豆瓣的「想看 / 在看 / 看过 + 打分 + 短评」，数据用正规 API 搜索入库，不爬豆瓣、不爬小黑盒。

**当前进度：** 阶段 0、阶段 1 已完成。游戏页资料栏固定，内部分类：最近游玩 / 全部游玩 / 完美通关 / 库存 / 家庭库 / 想玩。游戏卡片统一尺寸：封面、标题、总时长、近两周、成就、购入价/原价（未填购入价则按原价）。库存购入价在详情页填写。刷新时用登录 token 拉取 Steam 私人游戏名单并排除。本会话第一次打开游戏页会拉 Steam 并写入 `local/steam-cache.json`；切 tab 只用这份备份；点「刷新」才再请求。Steam 连不上时也用这份备份。换电脑时整夹拷走 `local/`（Key、数据库、Steam 备份），不进 git。下一步是阶段 2（标签、片单、排序、手动添加）。

---

## 1. 产品

单用户、本地或自托管。核心循环：

1. 按类型搜索（片名 / 书名 / 游戏名）
2. 从结果里选一条，把元数据快照写入本地
3. 标记状态、打分、写短评、记日期
4. 在列表里按类型、状态筛选回看

不做：关注、动态、他人评论、算法推荐、多租户。

### 状态（所有类型共用）

| 值 | 电影 | 书 | 游戏 |
|----|------|----|------|
| `wishlist` | 想看 | 想读 | 想玩 |
| `in_progress` | 在看 | 在读 | 在玩 |
| `done` | 看过 | 读过 | 玩过 |
| `dropped` | 弃了 | 弃了 | 弃了 |

评分：五星，允许半星（存 0–10 的整数，1 = 半星）。短评可选。开始/结束日期可选。

---

## 2. 可扩展怎么做

不要按媒体类型拆三套表、三套 CRUD。

- **Item**：一条作品（类型 + 外部来源 ID + 标题/封面等快照）
- **Entry**：我对这条作品的记录（状态、分、评、日期）
- **Provider**：一种类型怎么搜、怎么拉详情

加「剧集」= 加 `tv` Provider + 枚举值，页面复用同一套列表和详情。

封面：存外部 URL；需要离线再另说，第一版不下载图片。

---

## 3. 数据模型

### Item

| 字段 | 说明 |
|------|------|
| id | 本地主键 |
| type | `movie` \| `book` \| `game` |
| source | `tmdb` \| `google_books` \| `open_library` \| `igdb` \| `steam` |
| source_id | 对方系统里的 ID |
| title | 主标题（优先中文） |
| original_title | 原名，可空 |
| year | 可空 |
| cover_url | 可空 |
| description | 简介快照，可空 |
| extra_json | 类型专有字段（作者、ISBN、平台等），第一版尽量少用 |
| created_at / updated_at | |

唯一约束：`(type, source, source_id)`。同一作品只存一条 Item。

### Entry（一人一条，第一版）

| 字段 | 说明 |
|------|------|
| id | 主键 |
| item_id | 外键，一对一 |
| status | 上表四个值 |
| rating | 0–10，空 = 没打分 |
| review | 短评，可空 |
| started_on | 日期，可空 |
| finished_on | 日期，可空 |
| created_at / updated_at | |

阶段 2 再加 Tag、List。阶段 1 不要做。

---

## 4. Provider

统一接口（名字可变，语义不要变）：

```
search(query) -> [{ source_id, title, year, cover_url, subtitle }]
getDetail(source_id) -> Item 快照字段
```

| type | source | 搜什么 |
|------|--------|--------|
| movie | TMDB | 电影；语言 `zh-CN` |
| book | Google Books | 书名或 ISBN |
| game | steam | 游戏；Steam Web API，语言简中 |

规则：

- 只在服务端请求，API Key 仅环境变量
- 用户选中后再 `getDetail` 并 upsert Item
- 外部挂了：提示失败，不要假数据
- 禁止：豆瓣页面解析、小黑盒接口、非官方豆瓣代理

环境变量（实现时建 `.env.example`，实际填进 `local/.env`）：

```
TMDB_API_KEY=
GOOGLE_BOOKS_API_KEY=
STEAM_API_KEY=
STEAM_STEAMID=
STEAM_ACCESS_TOKEN=
STEAM_REFRESH_TOKEN=
```

没有 Key 的类型：搜索返回明确「未配置」，不要静默跳过。

---

## 5. 页面（阶段 1）

| 路由 | 做什么 |
|------|--------|
| `/` | 电影 / 书：类型 + 状态筛选。游戏：资料栏 + 最近游玩 / 全部游玩 / 完美通关 / 库存（购入价） / 家庭库 / 想玩 |
| `/search` | 类型 + 关键词；结果可「加入」；已入库的标出来 |
| `/steam/[appid]` | 库存游戏详情：现价、商店评价、我的成就 |

第一版不要：注册登录、设置页大全、深色主题纠结、响应式做到极致。能用、信息清楚即可。

---

## 6. 技术

已定：

- Next.js App Router + TypeScript
- SQLite + 一种 ORM（Prisma 或 drizzle，选一个用到底）
- 外部 HTTP 只放在 `lib/providers/`（或同等目录）
- 样式：简单 CSS 或 Tailwind，选一个用到底

目录（落地时可微调，职责不要散）：

```
app/                  页面与 route handlers
lib/providers/        tmdb / google-books / steam
lib/db.ts             数据库
prisma/ 或 drizzle/   schema
```

---

## 7. 实现顺序

做完一步再下一步。不要平行铺开「完美架构」。

### 阶段 0 — 能跑起来

- `create-next-app`（TS、App Router）
- SQLite + ORM
- `.env.example`、`.gitignore`（含 `.env`、`.db`）
- 首页一句「projectM」证明能启动

### 阶段 1 — 最小闭环（当前目标）

- Item / Entry schema 与迁移
- 三个 Provider：`search` + `getDetail`
- `/search` 搜索并加入
- `/item/[id]` 编辑 Entry
- `/` 列表 + 类型/状态筛选

验收：搜一部电影、一本书、一个游戏，各加入并打分写评，首页能按类型看到。

### 阶段 2 — 更好用

- 标签、片单
- 列表排序（加入时间、评分、年份）
- 手动添加（搜不到时自己填标题）

### 阶段 3 — 迁移与扩展

- CSV / JSON 导入（标题匹配 Provider，匹配不上就待确认）
- 新类型（如 `tv`）只加 Provider + 枚举
- 仍不爬豆瓣/小黑盒；导入用文件，匹配用正规 API

---

## 8. 验收对照（阶段 1）

- [ ] 三种类型都能搜到真实结果（配置了对应 Key）
- [ ] 加入后本地有 Item，不会因再搜同一部再插一条
- [ ] 状态、评分、短评能改能存，刷新还在
- [ ] 首页能按类型、状态筛
- [ ] 仓库里没有爬虫、没有豆瓣/小黑盒请求

---

## 9. 明确不做（除非用户以后改大纲）

- 爬虫、抓包、绕过反爬
- 用户系统、OAuth、多设备同步
- 评论社区、关注、动态
- 把海报文件存进 git
- 为三种媒体复制三套业务代码
