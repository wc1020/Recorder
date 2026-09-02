-- 旧记录的在看/看完可能早于加入本站当天，想看不能反而更晚
UPDATE "entries"
SET "wishlist_on" = "started_on"
WHERE "wishlist_on" IS NOT NULL AND "started_on" IS NOT NULL AND "started_on" < "wishlist_on";

UPDATE "entries"
SET "wishlist_on" = "finished_on"
WHERE "wishlist_on" IS NOT NULL AND "finished_on" IS NOT NULL AND "finished_on" < "wishlist_on";
