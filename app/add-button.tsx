"use client";

import { useActionState } from "react";
import { addItem } from "./actions";

export function AddButton({ type, sourceId }: { type: string; sourceId: string }) {
  const [state, action, pending] = useActionState(addItem, null);

  return (
    <form action={action} className="add-form">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "加入中…" : "加入"}
      </button>
      {state?.error ? <p className="error">{state.error}</p> : null}
    </form>
  );
}
