"use client";
import { useSyncExternalStore } from "react";
import { DEMO_SCENARIOS, type DemoScenarioId } from "./types";

// Demo mode lives in localStorage so the footer switch and the home page stay in sync.
const KEY = "accesspath.demo";
const EVENT = "accesspath:demo-change";
const SCENARIOS: DemoScenarioId[] = DEMO_SCENARIOS;

function read(): DemoScenarioId | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return SCENARIOS.find((s) => s === value) ?? null;
  } catch {
    return null;
  }
}

export function setDemoScenario(next: DemoScenarioId | null): void {
  if (next) window.localStorage.setItem(KEY, next);
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDemoScenario(): DemoScenarioId | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
