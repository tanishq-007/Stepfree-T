"use client";
import { useSyncExternalStore } from "react";
import { DEMO_SCENARIOS, type DemoScenarioId } from "./types";

// Demo mode lives in localStorage so the footer switch, the presenter bar and the home page stay in sync.
const KEY = "accesspath.demo";
const EVENT = "accesspath:demo-change";
const SCENARIOS: DemoScenarioId[] = DEMO_SCENARIOS;

// Presenter bar visibility is separate from the scenario so a presenter can flip back to the real trip
// ("Off") and still have the controls on screen.
const PRESENTER_KEY = "accesspath.presenter";

function read(): DemoScenarioId | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return SCENARIOS.find((s) => s === value) ?? null;
  } catch {
    return null;
  }
}

function readPresenter(): boolean {
  try {
    return window.localStorage.getItem(PRESENTER_KEY) === "1";
  } catch {
    return false;
  }
}

function emit(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function setDemoScenario(next: DemoScenarioId | null): void {
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode or storage disabled: demo mode simply does not persist.
  }
  emit();
}

export function setPresenter(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(PRESENTER_KEY, "1");
    else window.localStorage.removeItem(PRESENTER_KEY);
  } catch {
    // ignore
  }
  emit();
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

/** True when the presenter bar should be shown (presenter flag set, or a scenario is active). */
export function usePresenter(): boolean {
  return useSyncExternalStore(subscribe, () => readPresenter() || read() !== null, () => false);
}
