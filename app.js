(() => {
  const $ = (sel) => document.querySelector(sel);

  const PERIODS = ["1", "2", "3", "OT"];
  const DEFAULT_STATE = Object.freeze({
    period: "1",
    clockSeconds: 20 * 60,
    homeScore: 0,
    awayScore: 0,
  });

  const STORAGE_KEY = "trickshot_scoreboard_v7_red_solid";

  let state = clone(DEFAULT_STATE);
  let undoStack = [];
  let redoStack = [];

  const homeScoreBtn = $("#homeScoreBtn");
  const awayScoreBtn = $("#awayScoreBtn");
  const clockBtn = $("#clockBtn");
  const periodBtn = $("#periodBtn");

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

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
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
    if (undoStack.length > 200) undoStack.shift();
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
    requestAnimationFrame(() => controls.classList.add("controls--open"));
  }

  function closeControls() {
    controls.classList.remove("controls--open");
    setTimeout(() => controls.classList.add("controls--hidden"), 180);
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

  // ----- Auto-fit digits (CLOCK much bigger than SCORE) -----
  function fitText(el, maxPx, minPx = 18) {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w <= 0 || h <= 0) return;

    let lo = minPx;
    let hi = Math.max(minPx, maxPx);
    let best = lo;

    for (let i = 0; i < 13; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = mid + "px";
      // fits if scroll does not exceed box
      const fits = (el.scrollWidth <= w) && (el.scrollHeight <= h);
      if (fits) { best = mid; lo = mid; } else { hi = mid; }
    }
    el.style.fontSize = Math.floor(best) + "px";
  }

  function fitAllDigits() {
    requestAnimationFrame(() => {
      // SCORE: deliberately smaller (roughly half of prior)
      const scoreMax = Math.min(homeScoreBtn.clientWidth * 0.48, homeScoreBtn.clientHeight * 0.52);
      fitText(homeScoreBtn, scoreMax, 18);
      fitText(awayScoreBtn, scoreMax, 18);

      // CLOCK: deliberately larger (roughly double of prior)
      const clockMax = Math.min(clockBtn.clientWidth * 0.98, clockBtn.clientHeight * 0.98);
      fitText(clockBtn, clockMax, 44);
    });
  }

  // ----- Render -----
  function render() {
    homeScoreBtn.textContent = format2(state.homeScore);
    awayScoreBtn.textContent = format2(state.awayScore);
    clockBtn.textContent = formatClock(state.clockSeconds);
    periodBtn.textContent = state.period;

    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;

    fitAllDigits();
  }

  // ----- Double tap handling (no accidental +1) -----
  function makeTapHandler({ onSingleTap, onDoubleTap, thresholdMs = 260 }) {
    let timer = null;
    return () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        onDoubleTap?.();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        onSingleTap?.();
      }, thresholdMs);
    };
  }

  // ----- Wake Lock (best effort) -----
  let wakeLock = null;
  const wakeSupported = "wakeLock" in navigator;

  function setWakeMini(mode) {
    if (mode === "on") {
      wakeMini.style.background = "rgba(0, 210, 122, 0.95)";
      wakeMini.style.boxShadow = "0 0 0 4px rgba(0,210,122,0.15)";
      return;
    }
    if (mode === "unsupported") {
      wakeMini.style.background = "rgba(255, 209, 74, 0.95)";
      wakeMini.style.boxShadow = "0 0 0 4px rgba(255,209,74,0.18)";
      noteEl.textContent = "Wake lock unsupported on this browser. If needed, temporarily set Auto-Lock to Never.";
      return;
    }
    if (mode === "error") {
      wakeMini.style.background = "rgba(255,42,42,0.95)";
      wakeMini.style.boxShadow = "0 0 0 4px rgba(255,42,42,0.18)";
      return;
    }
    wakeMini.style.background = "rgba(255,255,255,0.40)";
    wakeMini.style.boxShadow = "0 0 0 4px rgba(0,0,0,0.12)";
  }

  async function requestWakeLock() {
    if (!wakeSupported) {
      setWakeMini("unsupported");
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
      noteEl.textContent = "Wake lock request failed. Try again after a tap.";
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !wakeLock) requestWakeLock();
  });

  // ----- Fullscreen API (best effort) -----
  async function requestFullscreen() {
    try {
      if (document.fullscreenElement) return;
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
    } catch {}
  }

  // Kick: first user gesture (needed for wake lock + sometimes fullscreen)
  let kickStarted = false;
  async function kickOnce() {
    if (kickStarted) return;
    kickStarted = true;
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

    const homeTap = makeTapHandler({ onSingleTap: () => addScore("home"), onDoubleTap: undo });
    const awayTap = makeTapHandler({ onSingleTap: () => addScore("away"), onDoubleTap: undo });
    homeScoreBtn.addEventListener("click", homeTap);
    awayScoreBtn.addEventListener("click", awayTap);

    clockBtn.addEventListener("click", stepClock);
    periodBtn.addEventListener("click", cyclePeriod);

    menuBtn.addEventListener("click", () => { openControls(); buzz(6); });
    closeControlsBtn.addEventListener("click", closeControls);
    backdrop.addEventListener("click", closeControls);

    undoBtn.addEventListener("click", undo);
    redoBtn.addEventListener("click", redo);
    resetClockBtn.addEventListener("click", resetClock);
    newGameBtn.addEventListener("click", newGame);

    window.addEventListener("resize", fitAllDigits, { passive: true });
    screen?.orientation?.addEventListener?.("change", () => setTimeout(fitAllDigits, 120));
  }

  function init() {
    const ok = restore();
    render();
    wireEvents();
    setWakeMini(wakeSupported ? "off" : "unsupported");
    registerServiceWorker();
    if (!ok) persist();

    setTimeout(fitAllDigits, 100);
    setTimeout(fitAllDigits, 280);
  }

  init();
})();