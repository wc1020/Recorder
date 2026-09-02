# local — 换电脑时整夹拷走

这一份**不要提交 git**。U 盘、网盘、直接拷都行。

另一台电脑：

1. `git pull`
2. 把这个 `local` 文件夹放到工程根目录（和 `package.json` 同级）
3. `npm install`
4. `npm run dev`

里面是：

| 文件 | 是什么 |
|------|--------|
| `.env` | API Key / Steam 令牌 |
| `dev.db` | 你的电影、书、游戏记录 |
| `steam-cache.json` | Steam 资料、库存、完美、游戏详情备份 |
| `snapshots/` | 自动滚动备份（有更新才写，最多 5 份） |

第一次从零开始、没有这只文件夹时：按仓库里的 [docs/DEPLOY.md](../docs/DEPLOY.md) 做。或把 `.env.example` 复制为 `local/.env`，填上 Key，再执行 `npx prisma migrate deploy`。
