/* ============================================================
   app.js — Başlatma, olay bağlama, örnek program
   ============================================================ */
(function () {
  "use strict";
  var App = window.App;
  var Store = App.Store, UI = App.UI, Timer = App.Timer;

  var focus = new Date();          // odaklanılan ay/hafta
  var view = "month";              // "month" | "week"
  var activeDate = null;           // modalda açık olan gün (Date)
  var editingId = null;            // düzenlenen hareket id'si

  /* ---------- Örnek program şablonları (Pzt=0 .. Paz=6) ---------- */
  var TEMPLATES = {
    0: { title: "İtiş Günü", exercises: [
      { name: "Bench Press", region: "gogus", sets: 4, reps: "6-8", duration: 12 },
      { name: "Eğimli Dumbbell Press", region: "gogus", sets: 3, reps: "8-12", duration: 10 },
      { name: "Omuz Press (Barbell)", region: "omuz", sets: 3, reps: "8-10", duration: 10 },
      { name: "Yan Lateral Raise", region: "omuz", sets: 3, reps: "12-15", duration: 8 },
      { name: "Triceps Pushdown", region: "kol", sets: 3, reps: "12-15", duration: 7 },
    ]},
    1: { title: "Çekiş Günü", exercises: [
      { name: "Deadlift", region: "sirt", sets: 4, reps: "5", duration: 15 },
      { name: "Barfiks (Pull-up)", region: "sirt", sets: 4, reps: "8-10", duration: 12 },
      { name: "Barbell Row", region: "sirt", sets: 3, reps: "8-10", duration: 10 },
      { name: "Face Pull", region: "omuz", sets: 3, reps: "15", duration: 6 },
      { name: "Barbell Curl", region: "kol", sets: 3, reps: "10-12", duration: 8 },
    ]},
    2: { title: "Bacak Günü", exercises: [
      { name: "Squat", region: "bacak", sets: 4, reps: "6-8", duration: 15 },
      { name: "Romanian Deadlift", region: "bacak", sets: 3, reps: "10", duration: 12 },
      { name: "Leg Press", region: "bacak", sets: 3, reps: "12", duration: 10 },
      { name: "Leg Curl", region: "bacak", sets: 3, reps: "12-15", duration: 8 },
      { name: "Calf Raise", region: "bacak", sets: 4, reps: "15-20", duration: 6 },
    ]},
    4: { title: "Üst Vücut", exercises: [
      { name: "Eğimli Bench Press", region: "gogus", sets: 3, reps: "8-10", duration: 10 },
      { name: "Lat Pulldown", region: "sirt", sets: 3, reps: "10-12", duration: 10 },
      { name: "Dumbbell Shoulder Press", region: "omuz", sets: 3, reps: "10", duration: 9 },
      { name: "Cable Curl", region: "kol", sets: 3, reps: "12", duration: 7 },
      { name: "Plank", region: "karin", sets: 3, reps: "45 sn", duration: 6 },
    ]},
    5: { title: "Kardiyo & Core", exercises: [
      { name: "HIIT Koşu", region: "kardiyo", sets: 1, reps: "20 dk", duration: 20 },
      { name: "Bisiklet", region: "kardiyo", sets: 1, reps: "15 dk", duration: 15 },
      { name: "Crunch", region: "karin", sets: 3, reps: "20", duration: 6 },
      { name: "Russian Twist", region: "karin", sets: 3, reps: "20", duration: 6 },
      { name: "Plank", region: "karin", sets: 3, reps: "60 sn", duration: 6 },
    ]},
  };

  function seedSampleData(baseDate) {
    var state = Store.getState();
    var base = baseDate || new Date();
    var y = base.getFullYear(), m = base.getMonth();
    var todayKey = Store.dateKey(new Date());
    var days = new Date(y, m + 1, 0).getDate();
    var added = 0;
    for (var dnum = 1; dnum <= days; dnum++) {
      var d = new Date(y, m, dnum);
      var tpl = TEMPLATES[(d.getDay() + 6) % 7];
      if (!tpl) continue;
      var key = Store.dateKey(d);
      var ex = state.workouts[key];
      // Mevcut kullanıcı verisini ASLA ezme — yalnızca boş günleri doldur
      if (ex && ((ex.exercises && ex.exercises.length) || ex.title || ex.completed)) continue;
      var exercises = tpl.exercises.map(function (e, i) {
        return { id: "seed_" + key + "_" + i, name: e.name, region: e.region, sets: e.sets, reps: e.reps, duration: e.duration, notes: "" };
      });
      state.workouts[key] = { title: tpl.title, completed: key < todayKey, exercises: exercises };
      added++;
    }
    state.settings.seeded = true;
    Store.save();
    return added;
  }

  /* ---------- Tema ---------- */
  function applyTheme() {
    var theme = Store.getSettings().theme || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    var tb = document.getElementById("themeBtn");
    if (tb) tb.setAttribute("aria-pressed", String(theme === "light"));
    // Tam ekran (standalone) PWA'da durum çubuğu rengini temaya uydur
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#eef1ef" : "#0b0d0e");
  }
  function toggleTheme() {
    var cur = Store.getSettings().theme || "dark";
    Store.setSetting("theme", cur === "dark" ? "light" : "dark");
    applyTheme();
  }

  /* ---------- Render ---------- */
  function refresh() {
    document.getElementById("periodLabel").textContent = UI.periodLabel(focus, view);
    UI.renderStats(focus, view);

    var monthEl = document.getElementById("calendar");
    var weekEl = document.getElementById("weekboard");
    var headEl = document.getElementById("weekdayHead");

    if (view === "week") {
      monthEl.hidden = true; weekEl.hidden = false; headEl.style.display = "none";
      UI.renderWeek(focus);
    } else {
      monthEl.hidden = false; weekEl.hidden = true; headEl.style.display = "";
      UI.renderCalendar(focus);
    }

    var vm = document.getElementById("viewMonth"), vw = document.getElementById("viewWeek");
    vm.classList.toggle("is-active", view === "month");
    vw.classList.toggle("is-active", view === "week");
    vm.setAttribute("aria-selected", String(view === "month"));
    vw.setAttribute("aria-selected", String(view === "week"));
  }

  function setView(v) {
    if (view === v) return;
    view = v;
    Store.setSetting("view", v);
    refresh();
  }

  function navigate(dir) {
    if (view === "week") {
      focus = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + dir * 7);
    } else {
      focus = new Date(focus.getFullYear(), focus.getMonth() + dir, 1);
    }
    refresh();
  }

  /* ---------- Odak yönetimi (erişilebilirlik) ---------- */
  var lastFocus = null;
  function setBgInert(on) {
    [".topbar", ".stats-strip", ".board"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) el.inert = on;
    });
  }
  function focusFirst(modal) {
    var el = modal.querySelector("[data-close]") ||
      modal.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (el) el.focus();
  }
  function currentModal() {
    if (!document.getElementById("timerOverlay").hidden) return document.querySelector("#timerOverlay .modal");
    if (!document.getElementById("dayOverlay").hidden) return document.querySelector("#dayOverlay .modal");
    return null;
  }
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    var modal = currentModal();
    if (!modal) return;
    var nodes = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var list = Array.prototype.filter.call(nodes, function (el) {
      return !el.disabled && !el.hidden && el.offsetParent !== null;
    });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- Gün modalı ---------- */
  function parseDate(str) {
    var p = str.split(",").map(Number);
    return new Date(p[0], p[1], p[2]);
  }
  function openDay(date) {
    lastFocus = document.activeElement;
    activeDate = date;
    editingId = null;
    hideForm();
    UI.fillDayModal(date);
    document.getElementById("dayOverlay").hidden = false;
    document.body.style.overflow = "hidden";
    setBgInert(true);
    focusFirst(document.querySelector("#dayOverlay .modal"));
  }
  function closeDay() {
    var key = activeDate ? Store.dateKey(activeDate) : null;
    document.getElementById("dayOverlay").hidden = true;
    document.body.style.overflow = "";
    setBgInert(false);
    activeDate = null;
    refresh();
    // Odağı, modalı açan gün hücresine geri ver
    var cell = key && document.querySelector('[data-key="' + key + '"]');
    if (cell && cell.focus) cell.focus();
    else if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  function hideForm() {
    document.getElementById("exForm").hidden = true;
    editingId = null;
  }
  function showForm(ex) {
    var form = document.getElementById("exForm");
    form.hidden = false;
    document.getElementById("formTitle").textContent = ex ? "Hareketi Düzenle" : "Yeni Hareket";
    document.getElementById("formSave").textContent = ex ? "Güncelle" : "Ekle";
    document.getElementById("fName").value = ex ? ex.name : "";
    document.getElementById("fRegion").value = ex ? ex.region : "gogus";
    document.getElementById("fSets").value = ex ? ex.sets : 3;
    document.getElementById("fReps").value = ex ? ex.reps : "10";
    document.getElementById("fDur").value = ex ? ex.duration : 10;
    document.getElementById("fNotes").value = ex ? (ex.notes || "") : "";
    editingId = ex ? ex.id : null;
    document.getElementById("fName").focus();
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function submitForm(e) {
    e.preventDefault();
    if (!activeDate) return;
    var key = Store.dateKey(activeDate);
    var name = document.getElementById("fName").value.trim();
    if (!name) { document.getElementById("fName").focus(); return; }
    var data = {
      name: name,
      region: document.getElementById("fRegion").value,
      sets: Math.max(1, parseInt(document.getElementById("fSets").value, 10) || 1),
      reps: document.getElementById("fReps").value.trim() || "—",
      duration: Math.max(0, parseInt(document.getElementById("fDur").value, 10) || 0),
      notes: document.getElementById("fNotes").value.trim(),
    };
    if (editingId) {
      Store.updateExercise(key, editingId, data);
      UI.toast("Hareket güncellendi");
    } else {
      Store.addExercise(key, data);
      UI.toast("Hareket eklendi");
    }
    hideForm();
    UI.renderExerciseList(key);
  }

  /* ---------- Yedekleme menüsü ---------- */
  function download(filename, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function handleMenu(action) {
    document.getElementById("menuPop").hidden = true;
    document.getElementById("menuBtn").setAttribute("aria-expanded", "false");
    if (action === "export") {
      var d = new Date();
      var name = "arnould-antrenman-" + d.getFullYear() + "-" + Store.pad(d.getMonth() + 1) + "-" + Store.pad(d.getDate()) + ".json";
      download(name, Store.exportJSON());
      UI.toast("Veriler dışa aktarıldı");
    } else if (action === "import") {
      document.getElementById("importFile").click();
    } else if (action === "seed") {
      if (confirm("Görüntülenen ayın BOŞ günlerine örnek antrenman programı eklenecek. Mevcut kayıtların korunur. Devam edelim mi?")) {
        var added = seedSampleData(focus);
        refresh();
        UI.toast(added ? "Örnek program eklendi (" + added + " gün)" : "Eklenecek boş gün bulunamadı");
      }
    } else if (action === "reset") {
      if (confirm("TÜM antrenman verilerin kalıcı olarak silinecek. Emin misin?")) {
        Store.resetAll();
        applyTheme();
        focus = new Date();
        view = "month";
        refresh();
        UI.toast("Tüm veriler sıfırlandı");
      }
    }
  }

  function importFromFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        Store.importJSON(String(reader.result));
        applyTheme();
        view = Store.getSettings().view || "month";
        refresh();
        UI.toast("Veriler içe aktarıldı");
      } catch (err) {
        UI.toast("İçe aktarma başarısız: geçersiz dosya");
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Zamanlayıcı ---------- */
  function setPresetActive(sec) {
    document.querySelectorAll("#presets button").forEach(function (b) {
      b.classList.toggle("is-active", Number(b.dataset.sec) === sec);
    });
  }
  function openTimer(restoreTo) {
    lastFocus = restoreTo || document.activeElement;
    document.getElementById("timerOverlay").hidden = false;
    document.body.style.overflow = "hidden";
    setBgInert(true);
    UI.renderTimer(Timer.snapshot());
    focusFirst(document.querySelector("#timerOverlay .modal"));
  }
  function closeTimer() {
    document.getElementById("timerOverlay").hidden = true;
    document.body.style.overflow = "";
    setBgInert(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }
  function setCountdownTab(isCountdown) {
    Timer.setMode(isCountdown ? "countdown" : "stopwatch");
    var tc = document.getElementById("tabCountdown"), ts = document.getElementById("tabStopwatch");
    tc.classList.toggle("is-active", isCountdown);
    ts.classList.toggle("is-active", !isCountdown);
    tc.setAttribute("aria-selected", String(isCountdown));
    ts.setAttribute("aria-selected", String(!isCountdown));
    document.getElementById("presets").style.display = isCountdown ? "" : "none";
    document.getElementById("customTime").style.display = isCountdown ? "" : "none";
    document.getElementById("tAdd").style.visibility = isCountdown ? "" : "hidden";
  }

  /* ---------- Olaylar ---------- */
  function wire() {
    document.getElementById("prevBtn").onclick = function () { navigate(-1); };
    document.getElementById("nextBtn").onclick = function () { navigate(1); };
    document.getElementById("todayBtn").onclick = function () { focus = new Date(); refresh(); };
    document.getElementById("viewMonth").onclick = function () { setView("month"); };
    document.getElementById("viewWeek").onclick = function () { setView("week"); };
    document.getElementById("themeBtn").onclick = toggleTheme;

    // Menü
    var menuBtn = document.getElementById("menuBtn");
    var menuPop = document.getElementById("menuPop");
    function setMenuOpen(open) {
      menuPop.hidden = !open;
      menuBtn.setAttribute("aria-expanded", String(open));
    }
    menuBtn.onclick = function (e) { e.stopPropagation(); setMenuOpen(menuPop.hidden); };
    menuPop.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-action]");
      if (b) handleMenu(b.dataset.action);
    });
    document.addEventListener("click", function (e) {
      if (!menuPop.hidden && !menuPop.contains(e.target) && e.target !== menuBtn) setMenuOpen(false);
    });
    document.addEventListener("keydown", trapFocus);
    document.getElementById("importFile").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importFromFile(e.target.files[0]);
      e.target.value = "";
    });

    // Takvim & hafta tıklamaları (delegasyon)
    function cellOpener(e) {
      var cell = e.target.closest("[data-date]");
      if (cell) openDay(parseDate(cell.dataset.date));
    }
    document.getElementById("calendar").addEventListener("click", cellOpener);
    document.getElementById("weekboard").addEventListener("click", cellOpener);
    function cellKey(e) {
      if (e.repeat) return;
      if (e.key === "Enter" || e.key === " ") {
        var cell = e.target.closest("[data-date]");
        if (cell) { e.preventDefault(); openDay(parseDate(cell.dataset.date)); }
      }
    }
    document.getElementById("calendar").addEventListener("keydown", cellKey);
    document.getElementById("weekboard").addEventListener("keydown", cellKey);

    // Gün modalı
    document.getElementById("dayOverlay").addEventListener("click", function (e) {
      if (e.target.id === "dayOverlay" || e.target.closest("[data-close]")) closeDay();
    });
    document.getElementById("dayTitleInput").addEventListener("change", function () {
      if (activeDate) Store.setDayTitle(Store.dateKey(activeDate), this.value.trim());
    });
    document.getElementById("dayDoneInput").addEventListener("change", function () {
      if (activeDate) Store.toggleComplete(Store.dateKey(activeDate), this.checked);
    });
    document.getElementById("addExBtn").onclick = function () { showForm(null); };
    document.getElementById("formCancel").onclick = hideForm;
    document.getElementById("exForm").addEventListener("submit", submitForm);
    document.getElementById("exList").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-action]");
      if (!btn || !activeDate) return;
      var key = Store.dateKey(activeDate);
      var w = Store.getWorkout(key);
      if (!w) return;
      var ex = w.exercises.find(function (x) { return x.id === btn.dataset.id; });
      if (btn.dataset.action === "edit" && ex) {
        showForm(ex);
      } else if (btn.dataset.action === "del" && ex) {
        if (confirm('"' + ex.name + '" hareketi silinsin mi?')) {
          Store.deleteExercise(key, btn.dataset.id);
          UI.renderExerciseList(key);
          UI.toast("Hareket silindi");
        }
      }
    });
    document.getElementById("startDayTimer").onclick = function () {
      var ret = lastFocus;
      closeDayKeepData();
      openTimer(ret || null);
    };

    // Zamanlayıcı
    document.getElementById("openTimerBtn").onclick = openTimer;
    document.getElementById("timerOverlay").addEventListener("click", function (e) {
      if (e.target.id === "timerOverlay" || e.target.closest("[data-close]")) closeTimer();
    });
    document.getElementById("tabCountdown").onclick = function () { setCountdownTab(true); };
    document.getElementById("tabStopwatch").onclick = function () { setCountdownTab(false); };
    document.getElementById("presets").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-sec]");
      if (!b) return;
      var sec = Number(b.dataset.sec);
      Timer.setDuration(sec * 1000);
      setPresetActive(sec);
      document.getElementById("cdMin").value = Math.floor(sec / 60);
      document.getElementById("cdSec").value = sec % 60;
    });
    document.getElementById("cdSet").onclick = function () {
      var mn = Math.max(0, parseInt(document.getElementById("cdMin").value, 10) || 0);
      var sc = Math.min(59, Math.max(0, parseInt(document.getElementById("cdSec").value, 10) || 0));
      Timer.setDuration((mn * 60 + sc) * 1000);
      setPresetActive(-1);
    };
    document.getElementById("tStart").onclick = function () { Timer.ensureAudio(); Timer.toggle(); };
    document.getElementById("tReset").onclick = function () { Timer.reset(); };
    document.getElementById("tAdd").onclick = function () { Timer.addTime(15000); };

    // Klavye
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!document.getElementById("timerOverlay").hidden) closeTimer();
        else if (!document.getElementById("dayOverlay").hidden) closeDay();
        else if (!menuPop.hidden) setMenuOpen(false);
      }
    });
  }

  // Modal'ı veri yenilemeden kapat (timer'a geçişte takvimi de tazele)
  function closeDayKeepData() {
    document.getElementById("dayOverlay").hidden = true;
    document.body.style.overflow = "";
    setBgInert(false);
    activeDate = null;
    refresh();
  }

  /* ---------- Başlat ---------- */
  function init() {
    Store.load();
    var settings = Store.getSettings();
    if (!settings.seeded && Object.keys(Store.getState().workouts).length === 0) {
      seedSampleData();
    }
    view = settings.view || "month";
    applyTheme();

    UI.renderWeekdayHead();
    UI.fillRegionSelect();
    Timer.setCallbacks(UI.renderTimer, function () { UI.toast("Süre doldu!"); });
    Timer.setDuration(30000);
    setPresetActive(30);
    setCountdownTab(true);

    wire();
    refresh();
    UI.renderTimer(Timer.snapshot());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
