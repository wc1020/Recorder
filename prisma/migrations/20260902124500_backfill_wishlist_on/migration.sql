-- created_at 在 SQLite 里是毫秒时间戳，date(created_at) 无效
UPDATE "entries"
SET "wishlist_on" = date("created_at" / 1000.0, 'unixepoch', 'localtime')
WHERE "wishlist_on" IS NULL AND "created_at" IS NOT NULL;
