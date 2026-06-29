/* ============================================================
   ui.js — Render katmanı (takvim, hafta, istatistik, modal, timer)
   ============================================================ */
(function () {
  "use strict";
  var App = (window.App = window.App || {});
  var Store = App.Store;

  var MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var WD_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  var WD_LONG = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

  var RING_CIRC = 2 * Math.PI * 108;

  /* JS getDay(): 0=Pazar..6=Cmt → Pazartesi-başlangıçlı index (0=Pzt..6=Paz) */
  function mondayIndex(jsDay) { return (jsDay + 6) % 7; }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatMinutes(min) {
    min = Math.round(min);
    if (min < 60) return min + " dk";
    var h = Math.floor(min / 60), m = min % 60;
    return h + " sa" + (m ? " " + m + " dk" : "");
  }

  function regionLabel(key) {
    var r = Store.REGION_MAP[key];
    return r ? r.label : key;
  }
  function regionColor(key) {
    var r = Store.REGION_MAP[key];
    return r ? r.color : "var(--text-dim)";
  }

  /* ---------------- Dönem etiketi ---------------- */
  function periodLabel(focus, view) {
    if (view === "week") {
      var mon = startOfWeek(focus);
      var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      if (mon.getMonth() === sun.getMonth()) {
        return mon.getDate() + "–" + sun.getDate() + " " + MONTHS[mon.getMonth()] + " " + mon.getFullYear();
      }
      return mon.getDate() + " " + MONTHS[mon.getMonth()] + " – " + sun.getDate() + " " + MONTHS[sun.getMonth()] + " " + sun.getFullYear();
    }
    return MONTHS[focus.getMonth()] + " " + focus.getFullYear();
  }

  function startOfWeek(d) {
    var s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - mondayIndex(s.getDay()));
    return s;
  }

  /* ---------------- Hafta başlık şeridi ---------------- */
  function renderWeekdayHead() {
    var head = document.getElementById("weekdayHead");
    head.innerHTML = WD_SHORT.map(function (w, i) {
      return '<span class="' + (i >= 5 ? "we" : "") + '">' + w + "</span>";
    }).join("");
  }

  /* ---------------- Ay görünümü ---------------- */
  function renderCalendar(focus) {
    var cal = document.getElementById("calendar");
    var year = focus.getFullYear(), month = focus.getMonth();
    var first = new Date(year, month, 1);
    var start = new Date(year, month, 1 - mondayIndex(first.getDay()));
    var todayKey = Store.dateKey(new Date());

    var html = "";
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var key = Store.dateKey(d);
      var isOut = d.getMonth() !== month;
      var isToday = key === todayKey;
      var w = Store.getWorkout(key);
      var t = Store.dayTotals(key);
      var hasWork = t.count > 0;

      var cls = "day-cell";
      if (isOut) cls += " is-out";
      if (isToday) cls += " is-today";
      if (w && w.completed) cls += " is-done";
      if (!hasWork) cls += " is-empty";

      var inner = '<div class="dc-top"><span class="dc-date">' + d.getDate() + "</span>";
      if (hasWork) {
        inner += '<span class="dc-dur">≈ ' + t.minutes + " dk</span>";
      } else if (w && w.completed) {
        inner += '<span class="dc-done-check">' + checkSvg() + "</span>";
      }
      inner += "</div>";

      if (hasWork) {
        if (w.completed) inner += '<span class="dc-done-check" style="position:absolute;top:10px;right:10px">' + checkSvg() + "</span>";
        if (w.title) inner += '<div class="dc-title">' + esc(w.title) + "</div>";
        inner += '<div class="dc-ex-count">' + t.count + " hareket · " + t.sets + " set</div>";
        inner += '<div class="dc-dots">' + t.regions.slice(0, 6).map(function (r) {
          return '<span class="dc-dot" style="background:' + regionColor(r) + '"></span>';
        }).join("") + "</div>";
      }

      var aria = d.getDate() + " " + MONTHS[d.getMonth()];
      if (hasWork) {
        aria += ", " + (w.title ? w.title + ", " : "") + t.count + " hareket, " + t.minutes + " dakika" + (w.completed ? ", tamamlandı" : "");
      } else {
        aria += ", boş gün";
      }
      html += '<div class="' + cls + '" data-key="' + key + '" data-date="' + d.getFullYear() + "," + d.getMonth() + "," + d.getDate() +
        '" role="button" tabindex="' + (isOut ? "-1" : "0") + '" aria-label="' + esc(aria) + '">' + inner + "</div>";
    }
    cal.innerHTML = html;
  }

  /* ---------------- Hafta görünümü ---------------- */
  function renderWeek(focus) {
    var board = document.getElementById("weekboard");
    var mon = startOfWeek(focus);
    var todayKey = Store.dateKey(new Date());
    var html = "";

    for (var i = 0; i < 7; i++) {
      var d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      var key = Store.dateKey(d);
      var w = Store.getWorkout(key);
      var t = Store.dayTotals(key);
      var isToday = key === todayKey;

      var body = "";
      if (w && w.exercises.length) {
        body = w.exercises.map(function (e) {
          return '<div class="wk-ex"><span class="pip" style="background:' + regionColor(e.region) + '"></span>' +
            '<span class="wk-ex-name">' + esc(e.name) + "</span>" +
            '<span class="wk-ex-sr">' + (Number(e.sets) || 0) + "×" + esc(e.reps || "") + "</span></div>";
        }).join("");
      } else {
        body = '<div class="wk-empty">Boş gün</div>';
      }

      var wkAria = WD_LONG[i] + " " + d.getDate() + " " + MONTHS[d.getMonth()] +
        (t.count ? ", " + t.count + " hareket, " + t.minutes + " dakika" : ", boş gün") + " — düzenle";
      html += '<div class="wk-col' + (isToday ? " is-today" : "") + '">' +
        '<div class="wk-head" data-key="' + key + '" data-date="' + d.getFullYear() + "," + d.getMonth() + "," + d.getDate() +
        '" role="button" tabindex="0" aria-label="' + esc(wkAria) + '">' +
        '<div class="wk-dayname">' + WD_LONG[i] + "</div>" +
        '<div class="wk-date">' + d.getDate() +
        (t.minutes ? ' <span class="dc-dur">≈ ' + t.minutes + " dk</span>" : "") +
        (w && w.completed ? ' <span class="dc-done-check">' + checkSvg() + "</span>" : "") +
        "</div></div>" +
        '<div class="wk-body">' + body + "</div>" +
        '<button class="btn ghost wk-add" data-key="' + key + '" data-date="' + d.getFullYear() + "," + d.getMonth() + "," + d.getDate() + '">Düzenle</button>' +
        "</div>";
    }
    board.innerHTML = html;
  }

  /* ---------------- İstatistik şeridi ---------------- */
  function renderStats(focus, view) {
    var days = [];
    if (view === "week") {
      var mon = startOfWeek(focus);
      for (var i = 0; i < 7; i++) days.push(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
    } else {
      var y = focus.getFullYear(), m = focus.getMonth();
      var n = new Date(y, m + 1, 0).getDate();
      for (var j = 1; j <= n; j++) days.push(new Date(y, m, j));
    }

    var planned = 0, completed = 0, totalMin = 0, totalSets = 0;
    days.forEach(function (d) {
      var key = Store.dateKey(d);
      var w = Store.getWorkout(key);
      var t = Store.dayTotals(key);
      if (t.count > 0) {
        planned++;
        totalMin += t.minutes;
        totalSets += t.sets;
        if (w && w.completed) completed++;
      }
    });

    var ratio = planned ? completed / planned : 0;
    var dash = (2 * Math.PI * 21).toFixed(1);
    var offset = (2 * Math.PI * 21 * (1 - ratio)).toFixed(1);
    var label = view === "week" ? "BU HAFTA" : "BU AY";

    document.getElementById("statsStrip").innerHTML =
      statCard(label + " · PLANLI", planned + ' <small>gün</small>', "") +
      statCard("TOPLAM SÜRE", formatMinutes(totalMin), "accent-orange") +
      statCard("TOPLAM SET", totalSets + "", "accent-blue") +
      '<div class="stat-card stat-ring-card">' +
        '<svg class="mini-ring" viewBox="0 0 50 50">' +
          '<circle class="mr-track" cx="25" cy="25" r="21"></circle>' +
          '<circle class="mr-prog" cx="25" cy="25" r="21" stroke-dasharray="' + dash + '" stroke-dashoffset="' + offset + '"></circle>' +
        "</svg>" +
        '<div><div class="stat-label">TAMAMLANAN</div>' +
        '<div class="stat-value">' + completed + '<small>/' + planned + "</small></div></div>" +
      "</div>";
  }

  function statCard(label, value, accent) {
    return '<div class="stat-card ' + accent + '"><div class="stat-label">' + label + "</div>" +
      '<div class="stat-value">' + value + "</div></div>";
  }

  /* ---------------- Gün modalı içeriği ---------------- */
  function fillDayModal(focusDate) {
    var key = Store.dateKey(focusDate);
    var w = Store.getWorkout(key);
    var jsIdx = mondayIndex(focusDate.getDay());

    document.getElementById("dayKicker").textContent = WD_LONG[jsIdx].toUpperCase() + " · GÜN PROGRAMI";
    document.getElementById("dayTitle").textContent =
      focusDate.getDate() + " " + MONTHS[focusDate.getMonth()] + " " + focusDate.getFullYear();

    document.getElementById("dayTitleInput").value = w ? (w.title || "") : "";
    document.getElementById("dayDoneInput").checked = w ? !!w.completed : false;

    renderExerciseList(key);
  }

  function renderExerciseList(key) {
    var list = document.getElementById("exList");
    var w = Store.getWorkout(key);
    var summary = document.getElementById("exSummary");

    if (!w || !w.exercises.length) {
      list.innerHTML = '<div class="ex-empty">' +
        '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 7h12M6 12h12M6 17h8" stroke-linecap="round"/></svg>' +
        "<div>Bu güne henüz hareket eklenmedi.<br>Aşağıdan ilk hareketini ekle.</div></div>";
      summary.className = "ex-summary empty";
      summary.innerHTML = "";
      return;
    }

    list.innerHTML = w.exercises.map(function (e) {
      var col = regionColor(e.region);
      return '<div class="ex-card">' +
        '<span class="ex-bar" style="background:' + col + '"></span>' +
        '<div class="ex-main">' +
          '<div class="ex-name">' + esc(e.name) + "</div>" +
          '<div class="ex-meta">' +
            '<span class="region-chip" style="background:color-mix(in srgb,' + col + ' 16%, transparent)">' +
              '<span class="chip-dot" style="background:' + col + '"></span>' + esc(regionLabel(e.region)) + "</span>" +
            '<span class="ex-sr">' + (Number(e.sets) || 0) + " × " + esc(e.reps || "—") + "</span>" +
          "</div>" +
          (e.notes ? '<div class="ex-note">' + esc(e.notes) + "</div>" : "") +
        "</div>" +
        '<div class="ex-dur-badge">' + (Number(e.duration) || 0) + '<small> dk</small></div>' +
        '<div class="ex-actions">' +
          '<button class="mini-btn" data-action="edit" data-id="' + esc(e.id) + '" title="Düzenle" aria-label="' + esc(e.name) + ' düzenle">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L18 10l-4-4L4 16v4zM14 6l4 4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
          '<button class="mini-btn del" data-action="del" data-id="' + esc(e.id) + '" title="Sil" aria-label="' + esc(e.name) + ' sil">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        "</div>" +
      "</div>";
    }).join("");

    var t = Store.dayTotals(key);
    summary.className = "ex-summary";
    summary.innerHTML =
      '<div class="sm"><b>' + t.count + "</b><span>Hareket</span></div>" +
      '<div class="sm"><b>' + t.sets + "</b><span>Toplam Set</span></div>" +
      '<div class="sm"><b>' + formatMinutes(t.minutes) + "</b><span>Tahmini Süre</span></div>" +
      '<div class="sm"><b>' + t.regions.length + "</b><span>Bölge</span></div>";
  }

  function fillRegionSelect() {
    var sel = document.getElementById("fRegion");
    sel.innerHTML = Store.REGIONS.map(function (r) {
      return '<option value="' + r.key + '">' + r.label + "</option>";
    }).join("");
  }

  /* ---------------- Zamanlayıcı render ---------------- */
  function pad2(n) { return String(n).padStart(2, "0"); }

  function renderTimer(snap) {
    var disp = document.getElementById("timerDisplay");
    var stateEl = document.getElementById("timerState");
    var ring = document.getElementById("ringProg");
    var wrap = document.querySelector(".ring-wrap");

    if (snap.mode === "countdown") {
      var secs = Math.ceil(snap.ms / 1000);
      disp.textContent = pad2(Math.floor(secs / 60)) + ":" + pad2(secs % 60);
      ring.style.strokeDasharray = RING_CIRC.toFixed(1);
      ring.style.strokeDashoffset = (RING_CIRC * (1 - Math.max(0, Math.min(1, snap.ratio)))).toFixed(1);

      var low = snap.ms <= 10000 && snap.ms > 0;
      ring.classList.toggle("warn", low);

      if (snap.ms <= 0) {
        stateEl.textContent = "BİTTİ";
        wrap.classList.add("is-done");
        ring.classList.add("warn");
      } else {
        wrap.classList.remove("is-done");
        stateEl.textContent = snap.running ? "ÇALIŞIYOR" : (snap.pristine ? "HAZIR" : "DURAKLADI");
      }
    } else {
      var cs = Math.floor((snap.ms % 1000) / 10);
      var ts = Math.floor(snap.ms / 1000);
      disp.textContent = pad2(Math.floor(ts / 60)) + ":" + pad2(ts % 60) + "." + pad2(cs);
      ring.style.strokeDasharray = RING_CIRC.toFixed(1);
      ring.style.strokeDashoffset = "0";
      ring.classList.remove("warn");
      wrap.classList.remove("is-done");
      stateEl.textContent = snap.running ? "ÇALIŞIYOR" : (snap.ms > 0 ? "DURAKLADI" : "HAZIR");
    }

    var startBtn = document.getElementById("tStart");
    if (startBtn) startBtn.textContent = snap.running ? "Duraklat" : "Başlat";
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("toast");
    el.hidden = false;
    el.textContent = "";
    // reflow ile animasyonu tetikle ve canlı bölgeyi (aria-live) uyandır
    void el.offsetWidth;
    el.textContent = msg; // görünürken metni ata → ekran okuyucu duyurur
    el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { el.hidden = true; }, 300);
    }, 2600);
  }

  function checkSvg() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4 10-11" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  App.UI = {
    MONTHS: MONTHS,
    WD_LONG: WD_LONG,
    startOfWeek: startOfWeek,
    periodLabel: periodLabel,
    renderWeekdayHead: renderWeekdayHead,
    renderCalendar: renderCalendar,
    renderWeek: renderWeek,
    renderStats: renderStats,
    fillDayModal: fillDayModal,
    renderExerciseList: renderExerciseList,
    fillRegionSelect: fillRegionSelect,
    renderTimer: renderTimer,
    toast: toast,
    formatMinutes: formatMinutes,
  };
})();
