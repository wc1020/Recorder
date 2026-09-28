"use client";

import { useActionState } from "react";
import { addManualItem } from "./actions";

export function ManualAddForm({
  type,
  title = "",
}: {
  type: string;
  title?: string;
}) {
  const [state, action, pending] = useActionState(addManualItem, null);
  const isBook = type === "book";

  return (
    <form action={action} className="manual-form">
      <input type="hidden" name="type" value={type} />
      <label>
        标题
        <input name="title" required defaultValue={title} maxLength={200} />
      </label>
      <label>
        原名 / 副标题
        <input name="originalTitle" defaultValue="" />
      </label>
      {isBook ? (
        <>
          <label>
            作者
            <input name="authors" placeholder="多个用顿号或逗号分隔" />
          </label>
          <label>
            ISBN
            <input name="isbn" placeholder="978…" inputMode="numeric" />
          </label>
          <label>
            出版社
            <input name="publisher" />
          </label>
        </>
      ) : null}
      <label>
        年份
        <input name="year" inputMode="numeric" pattern="[0-9]{4}" />
      </label>
      <label>
        封面 URL
        <input name="coverUrl" type="url" placeholder="https://" />
      </label>
      <label className="manual-desc">
        简介
        <textarea name="description" rows={3} />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "加入中…" : isBook ? "加入图书" : "手动加入"}
      </button>
      {state?.error ? <p className="error">{state.error}</p> : null}
    </form>
  );
}
