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
      workouts: {}, // "YYYY-MM-DD" -> { title, completed, exercises:[], auto?, autoVersion? }
      schedule: null,   // tekrarlayan haftalık program: { weekly:{0..6:program|null}, updatedAt }
      clipboard: null,  // kopyala-yapıştır panosu: { type:"day"|"week", payload }
      updatedAt: 0,     // son gerçek değişiklik zamanı (bulut senkronu uzlaşması için)
    };
  }

  var state = defaultState();
  var saveHook = null; // sync.js kaydolur: her gerçek değişiklikte buluta iter
  function setSaveHook(fn) { saveHook = fn; }

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
        state.schedule = sanitizeSchedule(parsed.schedule);
        state.clipboard = sanitizeClipboard(parsed.clipboard);
      }
    } catch (e) {
      console.warn("ARNOULD: veriler okunamadı, sıfırdan başlanıyor.", e);
      state = defaultState();
    }
    return state;
  }

  // save(): gerçek kullanıcı değişikliği — updatedAt'i ilerlet ve buluta it.
  // save(true): sessiz — seed/materyalizasyon/uzaktan benimseme; damga ve push yok.
  function save(silent) {
    if (!silent) state.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("ARNOULD: kaydedilemedi.", e);
      if (App.UI && App.UI.toast) App.UI.toast("Kaydedilemedi — tarayıcı deposu dolu olabilir.");
    }
    if (!silent && saveHook) { try { saveHook(); } catch (e) {} }
  }

  // Buluttan gelen durumu benimse: yereli değiştir, sessizce kaydet (push yok).
  function applyRemote(obj) {
    if (!obj || typeof obj !== "object") return;
    var clean = defaultState();
    if (obj.settings && typeof obj.settings === "object") {
      clean.settings.theme = obj.settings.theme === "light" ? "light" : "dark";
      clean.settings.view = obj.settings.view === "week" ? "week" : "month";
      clean.settings.seeded = !!obj.settings.seeded;
    }
    if (obj.workouts && typeof obj.workouts === "object" && !Array.isArray(obj.workouts)) {
      clean.workouts = obj.workouts;
    }
    clean.schedule = sanitizeSchedule(obj.schedule);
    clean.clipboard = sanitizeClipboard(obj.clipboard);
    clean.updatedAt = Number(obj.updatedAt) || 0;
    clean.__seq = Number(obj.__seq) || 0;
    state = clean;
    save(true); // sessiz: damga ilerletme ve push yok
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

  // Bir gün elle düzenlendiğinde otomatik (tekrarlayan programdan gelen) etiketi
  // kaldır: o gün artık "kullanıcıya ait"tir ve program değişse de üzerine yazılmaz.
  function detach(w) {
    if (w && w.auto) { w.auto = false; delete w.autoVersion; }
  }

  function addExercise(key, ex) {
    var w = ensureWorkout(key);
    detach(w);
    ex.id = newId();
    w.exercises.push(ex);
    save();
    return ex;
  }

  function updateExercise(key, id, patch) {
    var w = state.workouts[key];
    if (!w) return;
    var ex = w.exercises.find(function (e) { return e.id === id; });
    if (ex) { detach(w); Object.assign(ex, patch); save(); }
  }

  function deleteExercise(key, id) {
    var w = state.workouts[key];
    if (!w) return;
    detach(w);
    w.exercises = w.exercises.filter(function (e) { return e.id !== id; });
    pruneIfEmpty(key);
    save();
  }

  function setDayTitle(key, title) {
    var w = ensureWorkout(key);
    detach(w);
    w.title = title;
    pruneIfEmpty(key);
    save();
  }

  function toggleComplete(key, value) {
    var w = ensureWorkout(key);
    detach(w);
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

  /* ============================================================
     Kopyala-yapıştır + tekrarlayan haftalık program
     ============================================================ */

  /* Hareket listesini id'siz, temiz bir kopyaya indir (pano/şablon için) */
  function stripExercises(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (e) {
      return {
        name: String(e.name == null ? "" : e.name).slice(0, 80),
        region: REGION_MAP[e.region] ? e.region : "full",
        sets: clampInt(e.sets, 0, 99),
        reps: String(e.reps == null ? "" : e.reps).slice(0, 20),
        duration: clampInt(e.duration, 0, 999),
        notes: String(e.notes == null ? "" : e.notes).slice(0, 140),
      };
    });
  }
  /* Bir günü program nesnesine çevir (title + id'siz hareketler); boşsa null */
  function programFrom(w) {
    if (!w || !w.exercises || !w.exercises.length) {
      return (w && w.title) ? { title: w.title, exercises: [] } : null;
    }
    return { title: w.title || "", exercises: stripExercises(w.exercises) };
  }
  /* Programı yeni id'li gerçek hareketlere genişlet */
  function withNewIds(arr) {
    return stripExercises(arr).map(function (e) {
      e.id = newId();
      return e;
    });
  }
  function weekdayIndex(d) { return (d.getDay() + 6) % 7; } // 0=Pzt..6=Paz
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  /* ---------- Pano (kopyala / yapıştır) ---------- */
  function copyDay(key) {
    state.clipboard = { type: "day", payload: programFrom(state.workouts[key]) || { title: "", exercises: [] } };
    save();
  }
  function copyWeek(weekStart) {
    var days = [];
    for (var i = 0; i < 7; i++) days.push(programFrom(state.workouts[dateKey(addDays(weekStart, i))]));
    state.clipboard = { type: "week", payload: days };
    save();
  }
  function getClipboard() { return state.clipboard; }

  /* Bir programı bir güne yaz (id'ler yenilenir, completed sıfırlanır, kullanıcıya ait) */
  function writeProgram(key, program) {
    if (!program || !program.exercises || !program.exercises.length) {
      // boş program: yalnızca başlık varsa onu koru, yoksa hiç dokunma
      if (program && program.title) state.workouts[key] = { title: program.title, completed: false, exercises: [], auto: false };
      return;
    }
    state.workouts[key] = { title: program.title || "", completed: false, exercises: withNewIds(program.exercises), auto: false };
  }
  function pasteDay(key) {
    if (!state.clipboard || state.clipboard.type !== "day") return false;
    writeProgram(key, state.clipboard.payload);
    pruneIfEmpty(key);
    save();
    return true;
  }
  function pasteWeek(weekStart) {
    if (!state.clipboard || state.clipboard.type !== "week") return false;
    var arr = state.clipboard.payload || [];
    for (var i = 0; i < 7; i++) {
      // Pano gününde içerik varsa hedefe yaz; boşsa hedefi olduğu gibi bırak
      if (arr[i] && arr[i].exercises && arr[i].exercises.length) writeProgram(dateKey(addDays(weekStart, i)), arr[i]);
    }
    save();
    return true;
  }

  /* ---------- Tekrarlayan haftalık program ---------- */
  function hasRecurring() { return !!(state.schedule && state.schedule.weekly); }
  function getSchedule() { return state.schedule; }

  /* Bir haftayı (Pzt başlangıç) tekrarlayan program olarak kaydet */
  function setRecurring(weekStart) {
    var weekly = {};
    var any = false;
    for (var i = 0; i < 7; i++) {
      var p = programFrom(state.workouts[dateKey(addDays(weekStart, i))]);
      weekly[i] = (p && p.exercises && p.exercises.length) ? p : null;
      if (weekly[i]) any = true;
    }
    if (!any) return false; // tamamen boş haftadan program yapılmaz
    state.schedule = { weekly: weekly, updatedAt: Date.now() };
    save();
    return true;
  }
  function clearRecurring() { state.schedule = null; save(); }

  /* Bugünden ileriye doğru boş/otomatik günleri programa göre doldur.
     - Boş gün: programdan otomatik (auto) oluştur.
     - Eski sürümlü otomatik gün: yeni programa göre tazele.
     - Kullanıcıya ait (auto=false) gün: asla dokunma.
     - Geçmiş günler: hiç dokunma. */
  function materialize(fromDate, weeks) {
    if (!hasRecurring()) return 0;
    var ver = state.schedule.updatedAt;
    var total = (weeks || 12) * 7, changed = 0;
    for (var i = 0; i < total; i++) {
      var d = addDays(fromDate, i);
      var key = dateKey(d);
      var tpl = state.schedule.weekly[weekdayIndex(d)];
      var ex = state.workouts[key];
      if (tpl) {
        if (!ex) {
          state.workouts[key] = { title: tpl.title || "", completed: false, exercises: withNewIds(tpl.exercises), auto: true, autoVersion: ver };
          changed++;
        } else if (ex.auto && ex.autoVersion !== ver) {
          ex.title = tpl.title || ""; ex.exercises = withNewIds(tpl.exercises); ex.completed = false; ex.autoVersion = ver;
          changed++;
        }
      } else if (ex && ex.auto && ex.autoVersion !== ver) {
        delete state.workouts[key]; // program o günü dinlenme yaptı: eski otomatik günü temizle
        changed++;
      }
    }
    if (changed) save(true); // sessiz: türetilen günler buluta itilmez (her cihaz kendi türetir)
    return changed;
  }

  /* ---------- İçe aktarma doğrulayıcıları ---------- */
  function sanitizeProgram(p) {
    if (!p || typeof p !== "object") return null;
    var ex = stripExercises(p.exercises);
    if (!ex.length && !p.title) return null;
    return { title: String(p.title == null ? "" : p.title).slice(0, 60), exercises: ex };
  }
  function sanitizeSchedule(s) {
    if (!s || typeof s !== "object" || !s.weekly || typeof s.weekly !== "object") return null;
    var weekly = {}, any = false;
    for (var i = 0; i < 7; i++) {
      weekly[i] = sanitizeProgram(s.weekly[i]);
      if (weekly[i]) any = true;
    }
    if (!any) return null;
    var ver = Number(s.updatedAt);
    return { weekly: weekly, updatedAt: isFinite(ver) ? ver : Date.now() };
  }
  function sanitizeClipboard(c) {
    if (!c || typeof c !== "object") return null;
    if (c.type === "day") { var p = sanitizeProgram(c.payload); return p ? { type: "day", payload: p } : null; }
    if (c.type === "week" && Array.isArray(c.payload)) {
      return { type: "week", payload: c.payload.slice(0, 7).map(sanitizeProgram) };
    }
    return null;
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
      var wk = {
        title: String(src.title == null ? "" : src.title).slice(0, 60),
        completed: !!src.completed,
        exercises: exercises,
      };
      if (src.auto) { wk.auto = true; wk.autoVersion = Number(src.autoVersion) || 0; }
      clean.workouts[key] = wk;
    });
    clean.__seq = seq;
    clean.schedule = sanitizeSchedule(parsed.schedule); // tekrarlayan programı da getir
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
    copyDay: copyDay,
    copyWeek: copyWeek,
    pasteDay: pasteDay,
    pasteWeek: pasteWeek,
    getClipboard: getClipboard,
    setRecurring: setRecurring,
    clearRecurring: clearRecurring,
    hasRecurring: hasRecurring,
    getSchedule: getSchedule,
    materialize: materialize,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
    getSettings: getSettings,
    setSetting: setSetting,
    getState: getState,
    setSaveHook: setSaveHook,
    applyRemote: applyRemote,
  };
})();
