/**
 * The viewer's recent searches, kept in this browser only (a convenience, not
 * account data). Storage can be unavailable (private mode, blocked site data),
 * so every access is guarded and the UI simply shows nothing.
 */
import { useSyncExternalStore } from "react";
import { isKnownAirport } from "@/domain/airports";
import { isValidDateKey } from "./persian";

export interface RecentSearch {
  from: string;
  to: string;
  date?: string;
  ret?: string;
  /** Epoch ms of the latest visit. */
  at: number;
}

const STORAGE_KEY = "pvz:recent-searches:v1";
const CHANGE_EVENT = "pvz:recent-searches";
export const MAX_RECENT = 6;

const identity = (s: Pick<RecentSearch, "from" | "to" | "date" | "ret">) =>
  `${s.from}|${s.to}|${s.date ?? ""}|${s.ret ?? ""}`;

/** Newest first, de-duplicated, capped. */
export function withSearch(list: RecentSearch[], entry: RecentSearch): RecentSearch[] {
  const id = identity(entry);
  return [entry, ...list.filter((s) => identity(s) !== id)].slice(0, MAX_RECENT);
}

export function withoutSearch(list: RecentSearch[], entry: RecentSearch): RecentSearch[] {
  const id = identity(entry);
  return list.filter((s) => identity(s) !== id);
}

/** Validate what came out of storage: it may be stale, hand-edited or from an older version. */
export function parseStored(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (s): s is RecentSearch =>
          typeof s === "object" &&
          s !== null &&
          isKnownAirport((s as RecentSearch).from) &&
          isKnownAirport((s as RecentSearch).to) &&
          (s as RecentSearch).from !== (s as RecentSearch).to &&
          typeof (s as RecentSearch).at === "number",
      )
      .map((s) => ({
        from: s.from,
        to: s.to,
        at: s.at,
        date: isValidDateKey(s.date) ? s.date : undefined,
        ret: isValidDateKey(s.ret) ? s.ret : undefined,
      }))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

let cachedRaw: string | null = null;
let cachedList: RecentSearch[] = [];

function read(): RecentSearch[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  // useSyncExternalStore needs a stable snapshot for unchanged storage.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parseStored(raw);
  }
  return cachedList;
}

function write(list: RecentSearch[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: recent searches are optional.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function recordSearch(entry: Omit<RecentSearch, "at">) {
  write(withSearch(read(), { ...entry, at: Date.now() }));
}

export function removeSearch(entry: RecentSearch) {
  write(withoutSearch(read(), entry));
}

export function clearSearches() {
  write([]);
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const EMPTY: RecentSearch[] = [];

export function useRecentSearches(): RecentSearch[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
