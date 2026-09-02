"use client";

import { useState } from "react";
import { deleteItem } from "./actions";

export function DeleteItemButton({
  itemId,
  title,
}: {
  itemId: number;
  title: string;
}) {
  const [ask, setAsk] = useState(false);

  if (!ask) {
    return (
      <div className="item-delete">
        <button
          className="btn btn-ghost btn-danger"
          type="button"
          onClick={() => setAsk(true)}
        >
          删除
        </button>
      </div>
    );
  }

  return (
    <form className="item-delete item-delete-confirm" action={deleteItem}>
      <input type="hidden" name="itemId" value={itemId} />
      <p className="item-delete-hint">确定删除「{title}」？评分和短评也会去掉。</p>
      <div className="item-delete-actions">
        <button className="btn btn-ghost" type="button" onClick={() => setAsk(false)}>
          取消
        </button>
        <button className="btn btn-ghost btn-danger" type="submit">
          确定删除
        </button>
      </div>
    </form>
  );
}
