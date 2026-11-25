"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

let cache = null;

// Categories, styles, units and so on come from the server so the two never disagree.
export function useOptions() {
  const [options, setOptions] = useState(cache);
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    api("/materials/options")
      .then((data) => {
        cache = data;
        if (!cancelled) setOptions(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}
