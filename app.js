// Fullscreen-first landscape Trick Shot Hockey Scoreboard
// Gestures:
// - Tap HOME/AWAY score to +1
// - Tap TIME to -2:00
// - Tap PERIOD to cycle 1 -> 2 -> 3 -> OT -> 1 (clock resets to 20:00)
// Controls are hidden behind a menu button to maximize screen space.
// Global Undo/Redo makes "undo is score down" behavior.

(() => {
  const $ = (sel) => document.querySelector(sel);

  const PERIODS = ["1", "2", "3", "OT"];
  const DEFAULT_STATE = Object.freeze({
    period: "1",
    clockSeconds: 20 * 60,
    homeScore: 0,
    awayScore: 0,
  });

  const STORAGE_KEY = "trickshot_scoreboard_v3_fullscreen";

  let state = clone(DEFAULT_STATE);
  let undoStack = [];
  let redoStack = [];

  // Main controls
  const homeScoreBtn = $("#homeScoreBtn");
  const awayScoreBtn = $("#awayScoreBtn");
  const clockBtn = $("#clockBtn");
  const periodBtn = $("#periodBtn");

  // HUD / controls panel
  const menuBtn = $("#menuBtn");
  const controls = $("#controls");
  const backdrop = $("#controlsBackdrop");
  const closeControlsBtn = $("#closeControlsBtn");

  const undoBtn = $("#undoBtn");
  const redoBtn = $("#redoBtn");
  const resetClockBtn = $("#resetClockBtn");
  const newGameBtn = $("#newGameBtn");
  const noteEl = $("#note");

  const wakeMini = $("#wakeMini");

  function clone(obj) {
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function format2(n) { return String(n).padStart(2, "0"); }

  function formatClock(totalSeconds) {
    const s = clamp(totalSeconds, 0, 20 * 60);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  function buzz(ms = 10) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
  }

  // ----- History (global) -----
  function pushUndo(prevState) {
    undoStack.push(clone(prevState));
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }

  function applyUpdate(mutatorFn) {
    const prev = clone(state);
    mutatorFn(state);
    pushUndo(prev);
    render();
    persist();
  }

  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack.pop();
    redoStack.push(clone(state));
    state = prev;
    render();
    persist();
    buzz(12);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(clone(state));
    state = next;
    render();
    persist();
    buzz(12);
  }

  // ----- Actions -----
  function addScore(team) {
    applyUpdate((s) => {
      if (team === "home") s.homeScore = clamp(s.homeScore + 1, 0, 99);
      if (team === "away") s.awayScore = clamp(s.awayScore + 1, 0, 99);
    });
    buzz(8);
  }

  function stepClock() {
    applyUpdate((s) => {
      s.clockSeconds = clamp(s.clockSeconds - 2 * 60, 0, 20 * 60);
    });
    buzz(10);
  }

  function resetClock() {
    applyUpdate((s) => { s.clockSeconds = 20 * 60; });
    buzz(8);
  }

  function cyclePeriod() {
    applyUpdate((s) => {
      const idx = PERIODS.indexOf(s.period);
      s.period = PERIODS[(idx + 1) % PERIODS.length];
      s.clockSeconds = 20 * 60;
    });
    buzz(8);
  }

  function newGame() {
    applyUpdate((s) => {
      s.period = "1";
      s.clockSeconds = 20 * 60;
      s.homeScore = 0;
      s.awayScore = 0;
    });
    buzz(14);
  }

  // ----- Controls panel -----
  function openControls() {
    controls.classList.remove("controls--hidden");
    // next frame to allow transition
    requestAnimationFrame(() => controls.classList.add("controls--open"));
  }

  function closeControls() {
    controls.classList.remove("controls--open");
    // after transition, hide
    setTimeout(() => controls.classList.add("controls--hidden"), 180);
  }

  // ----- Render -----
  function render() {
    homeScoreBtn.textContent = format2(state.homeScore);
    awayScoreBtn.textContent = format2(state.awayScore);
    clockBtn.textContent = formatClock(state.clockSeconds);
    periodBtn.textContent = state.period;

    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  // ----- Persistence -----
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, undoStack, redoStack }));
    } catch {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      if (!payload?.state) return false;

      const s = payload.state;
      state = {
        period: PERIODS.includes(s.period) ? s.period : "1",
        clockSeconds: clamp(Number(s.clockSeconds ?? 1200), 0, 1200),
        homeScore: clamp(Number(s.homeScore ?? 0), 0, 99),
        awayScore: clamp(Number(s.awayScore ?? 0), 0, 99),
      };
      undoStack = Array.isArray(payload.undoStack) ? payload.undoStack : [];
      redoStack = Array.isArray(payload.redoStack) ? payload.redoStack : [];
      return true;
    } catch { return false; }
  }

  // ----- Wake Lock (best effort) -----
  let wakeLock = null;
  const wakeSupported = "wakeLock" in navigator;

  function setWakeMini(mode) {
    // mode: on/off/unsupported/error
    if (mode === "on") {
      wakeMini.style.background = "rgba(0, 210, 122, 0.95)";
      wakeMini.style.boxShadow = "0 0 0 4px rgba(0,210,122,0.15)";
      return;
    }
    if (mode === "unsupported") {
      wakeMini.style.background = "rgba(255, 209, 74, 0.9)";
      wakeMini.style.boxShadow = "0 0 0 4px rgba(255,209,74,0.12)";
      return;
    }
    if (mode === "error") {
      wakeMini.style.background = "rgba(255,42,42,0.9)";
      wakeMini.style.boxShadow = "0 0 0 4px rgba(255,42,42,0.12)";
      return;
    }
    wakeMini.style.background = "rgba(255,255,255,0.25)";
    wakeMini.style.boxShadow = "0 0 0 4px rgba(255,255,255,0.07)";
  }

  async function requestWakeLock() {
    if (!wakeSupported) {
      setWakeMini("unsupported");
      noteEl.textContent = "Wake lock unsupported on this browser. If needed, temporarily set Auto-Lock to Never.";
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      setWakeMini("on");
      noteEl.textContent = "Wake lock active (where supported).";
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
        setWakeMini("off");
      });
    } catch {
      setWakeMini("error");
      noteEl.textContent = "Wake lock request failed. Try opening controls and tapping again.";
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !wakeLock) requestWakeLock();
  });

  // ----- Orientation lock (best effort) -----
  async function lockLandscape() {
    try {
      const o = screen.orientation;
      if (o && typeof o.lock === "function") await o.lock("landscape");
    } catch {}
  }

  // ----- Fullscreen API (best effort) -----
  async function requestFullscreen() {
    // Works in many Android browsers; iOS Safari does not reliably support for PWAs.
    try {
      if (document.fullscreenElement) return;
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
    } catch {}
  }

  // Kick: first user gesture (needed for wake lock, and often for orientation/fullscreen)
  let kickStarted = false;
  async function kickOnce() {
    if (kickStarted) return;
    kickStarted = true;
    await lockLandscape();
    await requestFullscreen();
    await requestWakeLock();
  }

  // ----- Service Worker -----
  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try { await navigator.serviceWorker.register("./service-worker.js"); } catch {}
  }

  // ----- Events -----
  function wireEvents() {
    document.addEventListener("pointerdown", kickOnce, { passive: true, capture: true });

    homeScoreBtn.addEventListener("click", () => addScore("home"));
    awayScoreBtn.addEventListener("click", () => addScore("away"));
    clockBtn.addEventListener("click", stepClock);
    periodBtn.addEventListener("click", cyclePeriod);

    menuBtn.addEventListener("click", () => {
      openControls();
      buzz(6);
    });
    closeControlsBtn.addEventListener("click", closeControls);
    backdrop.addEventListener("click", closeControls);

    undoBtn.addEventListener("click", undo);
    redoBtn.addEventListener("click", redo);
    resetClockBtn.addEventListener("click", resetClock);
    newGameBtn.addEventListener("click", newGame);

    // keyboard for desktop testing
    document.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      if (key === "escape") closeControls();
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if (key === " ") { e.preventDefault(); stepClock(); }
      if (key === "p") { e.preventDefault(); cyclePeriod(); }
      if (key === "h") { e.preventDefault(); addScore("home"); }
      if (key === "a") { e.preventDefault(); addScore("away"); }
      if (key === "m") { e.preventDefault(); openControls(); }
    });
  }

  function init() {
    const ok = restore();
    render();
    wireEvents();
    setWakeMini(wakeSupported ? "off" : "unsupported");
    registerServiceWorker();
    if (!ok) persist();
  }

  init();
})();