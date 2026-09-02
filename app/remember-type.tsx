"use client";

import { useEffect } from "react";
import { rememberMediaType } from "@/lib/list-href";

export function RememberType({ type }: { type: string }) {
  useEffect(() => {
    rememberMediaType(type);
  }, [type]);
  return null;
}
