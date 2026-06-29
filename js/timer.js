/* ============================================================
   timer.js — Geri sayım + kronometre
   Zaman damgasına sabitlenmiş (drift-free) sayım. setInterval
   tabanlı olduğundan sekme arka plana alınsa bile çalışmaya
   devam eder; ekran tekrar açıldığında doğru süreye atlar.
   ============================================================ */
(function () {
  "use strict";
  var App = (window.App = window.App || {});

  var mode = "countdown";        // "countdown" | "stopwatch"
  var running = false;
  var intervalId = null;

  var durationMs = 30000;        // geri sayım hedefi
  var pausedRemaining = 30000;   // duraklatıldığında kalan (countdown)
  var pausedElapsed = 0;         // duraklatıldığında geçen (stopwatch)
  var anchor = 0;                // son start anındaki zaman damgası
  var pristine = true;           // hiç başlatılmadı (HAZIR durumu)

  var onUpdate = function () {};
  var onFinish = function () {};
  var audioCtx = null;

  function now() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : new Date().getTime();
  }

  function currentRemaining() {
    return running ? Math.max(0, pausedRemaining - (now() - anchor)) : pausedRemaining;
  }
  function currentElapsed() {
    return running ? pausedElapsed + (now() - anchor) : pausedElapsed;
  }

  function snapshot() {
    if (mode === "countdown") {
      var ms = currentRemaining();
      return { mode: mode, running: running, ms: ms, total: durationMs, ratio: durationMs ? ms / durationMs : 0, pristine: pristine };
    }
    return { mode: mode, running: running, ms: currentElapsed(), total: 0, ratio: 0, pristine: pristine };
  }

  function tick() {
    if (!running) return;
    if (mode === "countdown" && currentRemaining() <= 0) {
      pausedRemaining = 0;
      running = false;
      stopInterval();
      onUpdate(snapshot());
      beep();
      vibrate();
      onFinish();
      return;
    }
    onUpdate(snapshot());
  }

  function startInterval() {
    stopInterval();
    intervalId = setInterval(tick, 100);
  }
  function stopInterval() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function start() {
    if (running) return;
    if (mode === "countdown" && pausedRemaining <= 0) pausedRemaining = durationMs;
    running = true;
    pristine = false;
    anchor = now();
    startInterval();
    onUpdate(snapshot());
  }

  function pause() {
    if (!running) { onUpdate(snapshot()); return; }
    if (mode === "countdown") pausedRemaining = currentRemaining();
    else pausedElapsed = currentElapsed();
    running = false;
    stopInterval();
    onUpdate(snapshot());
  }

  function toggle() { running ? pause() : start(); }

  function reset() {
    running = false;
    pristine = true;
    stopInterval();
    if (mode === "countdown") pausedRemaining = durationMs;
    else pausedElapsed = 0;
    onUpdate(snapshot());
  }

  function setDuration(ms) {
    durationMs = Math.max(0, ms);
    pausedRemaining = durationMs;
    pristine = true;
    if (running) anchor = now();
    onUpdate(snapshot());
  }

  function addTime(ms) {
    if (mode !== "countdown") return;
    var rem = currentRemaining() + ms;
    pausedRemaining = Math.max(0, rem);
    if (running) anchor = now();
    durationMs = Math.max(durationMs, pausedRemaining);
    onUpdate(snapshot());
  }

  function setMode(m) {
    if (m === mode) return;
    pause();
    mode = m;
    pristine = true;
    if (mode === "countdown") pausedRemaining = durationMs;
    else pausedElapsed = 0;
    onUpdate(snapshot());
  }

  /* ---------- Ses ---------- */
  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep() {
    try {
      ensureAudio();
      if (!audioCtx) return;
      [0, 0.22, 0.44].forEach(function (offset, i) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = i === 2 ? 1320 : 880;
        var t0 = audioCtx.currentTime + offset;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.2);
      });
    } catch (e) { /* ses engellenmişse sessizce geç */ }
  }

  function vibrate() {
    if (navigator.vibrate) { try { navigator.vibrate([120, 60, 120]); } catch (e) {} }
  }

  App.Timer = {
    setCallbacks: function (u, f) { onUpdate = u || onUpdate; onFinish = f || onFinish; },
    start: start,
    pause: pause,
    toggle: toggle,
    reset: reset,
    setDuration: setDuration,
    addTime: addTime,
    setMode: setMode,
    snapshot: snapshot,
    ensureAudio: ensureAudio,
    isRunning: function () { return running; },
    getMode: function () { return mode; },
  };
})();
