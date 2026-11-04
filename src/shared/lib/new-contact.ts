"use client";

import { useSyncExternalStore } from "react";

const KEY = "aded:new-contact";
const EVENT = "aded-new-contact";

function read() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function publish() {
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** The orange circle on the home word. It is a signal, not a button. */
export function markNewContact() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode: the circle lives for this view */
  }
  publish();
}

export function clearNewContact() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* already gone */
  }
  publish();
}

export function useNewContact() {
  return useSyncExternalStore(subscribe, read, () => false);
}
