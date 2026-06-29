/* ============================================================
   store.js — Veri katmanı + localStorage kalıcılığı
   ============================================================ */
(function () {
  "use strict";
  var App = (window.App = window.App || {});

  var STORAGE_KEY = "arnould.gym.v1";

  /* Çalışma bölgeleri — anahtar, etiket ve renk */
  var REGIONS = [
    { key: "gogus", label: "Göğüs", color: "var(--r-gogus)" },
    { key: "sirt", label: "Sırt", color: "var(--r-sirt)" },
    { key: "omuz", label: "Omuz", color: "var(--r-omuz)" },
    { key: "kol", label: "Kol", color: "var(--r-kol)" },
    { key: "bacak", label: "Bacak", color: "var(--r-bacak)" },
    { key: "karin", label: "Karın / Core", color: "var(--r-karin)" },
    { key: "kardiyo", label: "Kardiyo", color: "var(--r-kardiyo)" },
    { key: "full", label: "Tüm Vücut", color: "var(--r-full)" },
  ];
  var REGION_MAP = {};
  REGIONS.forEach(function (r) { REGION_MAP[r.key] = r; });

  function defaultState() {
    return {
      version: 1,
      settings: { theme: "dark", view: "month", seeded: false },
      workouts: {}, // "YYYY-MM-DD" -> { title, completed, exercises:[] }
    };
  }

  var state = defaultState();

  /* ---------- Yükle / Kaydet ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed);
        state.settings = Object.assign(defaultState().settings, parsed.settings || {});
        state.workouts = parsed.workouts || {};
        // Bozuk/elle değiştirilmiş depo: workouts düz bir nesne değilse sıfırla
        if (typeof state.workouts !== "object" || state.workouts === null || Array.isArray(state.workouts)) {
          state.workouts = {};
        }
      }
    } catch (e) {
      console.warn("ARNOULD: veriler okunamadı, sıfırdan başlanıyor.", e);
      state = defaultState();
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("ARNOULD: kaydedilemedi.", e);
      if (App.UI && App.UI.toast) App.UI.toast("Kaydedilemedi — tarayıcı deposu dolu olabilir.");
    }
  }

  /* ---------- Tarih yardımcıları ---------- */
  function pad(n) { return String(n).padStart(2, "0"); }
  function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  /* ---------- Antrenman erişimi ---------- */
  function getWorkout(key) { return state.workouts[key] || null; }

  function ensureWorkout(key) {
    if (!state.workouts[key]) {
      state.workouts[key] = { title: "", completed: false, exercises: [] };
    }
    return state.workouts[key];
  }

  /* Boş bir antrenmanı temizle (kayıt şişmesini önler) */
  function pruneIfEmpty(key) {
    var w = state.workouts[key];
    if (w && (!w.exercises || w.exercises.length === 0) && !w.title && !w.completed) {
      delete state.workouts[key];
    }
  }

  // Çakışmasız id üreteci: mevcut tüm id'lerdeki en büyük sıra numarasını
  // tarayıp bir fazlasını verir. İçe aktarma/seed sonrası kendini onarır.
  function scanMaxSeq() {
    var max = 0;
    Object.keys(state.workouts).forEach(function (k) {
      var w = state.workouts[k];
      if (w && w.exercises) w.exercises.forEach(function (e) {
        var m = /(\d+)$/.exec(String(e.id || ""));
        if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
      });
    });
    return max;
  }
  function newId() {
    state.__seq = Math.max(state.__seq || 0, scanMaxSeq()) + 1;
    return "ex_" + state.__seq;
  }

  function clampInt(v, min, max) {
    var n = parseInt(v, 10);
    if (isNaN(n)) n = 0;
    return Math.max(min, Math.min(max, n));
  }

  function addExercise(key, ex) {
    var w = ensureWorkout(key);
    ex.id = newId();
    w.exercises.push(ex);
    save();
    return ex;
  }

  function updateExercise(key, id, patch) {
    var w = state.workouts[key];
    if (!w) return;
    var ex = w.exercises.find(function (e) { return e.id === id; });
    if (ex) { Object.assign(ex, patch); save(); }
  }

  function deleteExercise(key, id) {
    var w = state.workouts[key];
    if (!w) return;
    w.exercises = w.exercises.filter(function (e) { return e.id !== id; });
    pruneIfEmpty(key);
    save();
  }

  function setDayTitle(key, title) {
    var w = ensureWorkout(key);
    w.title = title;
    pruneIfEmpty(key);
    save();
  }

  function toggleComplete(key, value) {
    var w = ensureWorkout(key);
    w.completed = value;
    pruneIfEmpty(key);
    save();
  }

  /* Bir günün toplam süresi (dk) ve set sayısı */
  function dayTotals(key) {
    var w = state.workouts[key];
    if (!w || !w.exercises.length) return { minutes: 0, sets: 0, count: 0, regions: [] };
    var minutes = 0, sets = 0, regions = [];
    w.exercises.forEach(function (e) {
      minutes += Number(e.duration) || 0;
      sets += Number(e.sets) || 0;
      if (regions.indexOf(e.region) === -1) regions.push(e.region);
    });
    return { minutes: minutes, sets: sets, count: w.exercises.length, regions: regions };
  }

  /* ---------- Yedekleme ---------- */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  // İçe aktarma: gelen veriye asla güvenme. Yalnızca bilinen alanları,
  // tür dönüşümü yaparak ve id'leri yeniden üreterek temiz bir duruma kopyala.
  function importJSON(text) {
    var parsed = JSON.parse(text); // hata fırlatabilir — çağıran yakalar
    if (!parsed || typeof parsed !== "object" || typeof parsed.workouts !== "object" ||
        parsed.workouts === null || Array.isArray(parsed.workouts)) {
      throw new Error("Geçersiz dosya");
    }
    var clean = defaultState();
    if (parsed.settings && typeof parsed.settings === "object") {
      clean.settings.theme = parsed.settings.theme === "light" ? "light" : "dark";
      clean.settings.view = parsed.settings.view === "week" ? "week" : "month";
      clean.settings.seeded = !!parsed.settings.seeded;
    }
    var seq = 0;
    Object.keys(parsed.workouts).forEach(function (key) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      var src = parsed.workouts[key];
      if (!src || typeof src !== "object") return;
      var srcEx = Array.isArray(src.exercises) ? src.exercises : [];
      var exercises = [];
      srcEx.forEach(function (e) {
        if (!e || typeof e !== "object") return;
        exercises.push({
          id: "ex_" + (++seq),
          name: String(e.name == null ? "" : e.name).slice(0, 80),
          region: REGION_MAP[e.region] ? e.region : "full",
          sets: clampInt(e.sets, 0, 99),
          reps: String(e.reps == null ? "" : e.reps).slice(0, 20),
          duration: clampInt(e.duration, 0, 999),
          notes: String(e.notes == null ? "" : e.notes).slice(0, 140),
        });
      });
      clean.workouts[key] = {
        title: String(src.title == null ? "" : src.title).slice(0, 60),
        completed: !!src.completed,
        exercises: exercises,
      };
    });
    clean.__seq = seq;
    state = clean;
    save();
  }

  function resetAll() {
    state = defaultState();
    save();
  }

  function getSettings() { return state.settings; }
  function setSetting(key, value) { state.settings[key] = value; save(); }
  function getState() { return state; }

  App.Store = {
    REGIONS: REGIONS,
    REGION_MAP: REGION_MAP,
    load: load,
    save: save,
    dateKey: dateKey,
    pad: pad,
    getWorkout: getWorkout,
    ensureWorkout: ensureWorkout,
    addExercise: addExercise,
    updateExercise: updateExercise,
    deleteExercise: deleteExercise,
    setDayTitle: setDayTitle,
    toggleComplete: toggleComplete,
    dayTotals: dayTotals,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
    getSettings: getSettings,
    setSetting: setSetting,
    getState: getState,
  };
})();
