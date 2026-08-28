# projectM

私人豆瓣：记录看过的电影、读过的书、玩过的游戏。

## 运行

```bash
npm install
copy .env.example .env
```

在 `.env` 里填入对应 API Key（没有 Key 的类型搜索时会提示未配置，不会假装成功）：

- `TMDB_API_KEY` — 电影
- `GOOGLE_BOOKS_API_KEY` — 书
- `STEAM_API_KEY` — 游戏（[申请](https://steamcommunity.com/dev/apikey)，Domain 可填 `localhost`）

```bash
npx prisma migrate dev
npm run dev
```

浏览器打开 http://localhost:3000

## 说明

- 数据：TMDB / Google Books / Steam，不爬豆瓣、不爬小黑盒
- Key 只放环境变量，只在服务端请求
- 大纲：`docs/PLAN.md`
