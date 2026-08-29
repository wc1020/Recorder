-- CreateTable
CREATE TABLE "steam_paid_prices" (
    "appid" INTEGER NOT NULL PRIMARY KEY,
    "paid_fen" INTEGER NOT NULL,
    "updated_at" DATETIME NOT NULL
);
