-- AlterTable
ALTER TABLE "entries" ADD COLUMN "wishlist_on" TEXT;

-- Backfill: 加入当天当作想看时间（加入时默认就是想看）
UPDATE "entries" SET "wishlist_on" = date("created_at") WHERE "wishlist_on" IS NULL;
