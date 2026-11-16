(function () {
  "use strict";

  // ---------- Constants ----------
  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  var PREP_MIN = 60;        // getting ready at home
  var LIFT_MIN = 15;        // ski lift ride up to the slope
  var LAST_DAYS = 7;        // "Last days" badge threshold
  var NEW_DAYS = 7;         // "Just opened" fire badge: days since the season start
  var DEFAULTS = window.SEASON_DEFAULTS;

  var STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var CABLE = '<path d="M3 5.5 21 2.5"/>';
  var TYPES = {
    gondola: {
      label: "Gondola",
      svg: '<svg viewBox="0 0 24 24" ' + STROKE + '>' + CABLE +
        '<path d="M12 4v4"/><rect x="5.5" y="8" width="13" height="12" rx="3.5"/><path d="M5.5 14h13M12 8v6"/></svg>'
    },
    chairlift: {
      label: "Chairlift",
      svg: '<svg viewBox="0 0 24 24" ' + STROKE + '>' + CABLE +
        '<path d="M12 4v6"/><path d="M7 10h10"/><path d="M7 10v6h10v-6"/><path d="M9 16v4h6"/></svg>'
    },
    tbar: {
      label: "T-bar",
      svg: '<svg viewBox="0 0 24 24" ' + STROKE + '>' + CABLE +
        '<path d="M12 4v14"/><path d="M5.5 18h13"/></svg>'
    }
  };
  var TYPE_KEYS = ["gondola", "chairlift", "tbar"];
  var STATUS = { open: "Open now", prep: "In preparation", ended: "Season ended" };
  var STATUS_KEYS = ["open", "prep", "ended"];
  var HOME_SVG = '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>';

  // ---------- Clock (Innsbruck local time = IANA zone Europe/Vienna) ----------
  // All times are handled as Vienna wall-clock time, stored as "naive" milliseconds
  // (the wall-clock fields fed through Date.UTC), so date maths needs no time-zone handling.
  var viennaFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  function viennaReal() {
    var p = {};
    viennaFmt.formatToParts(new Date()).forEach(function (x) { p[x.type] = +x.value; });
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  // Testing aid: index.html?now=2026-12-19T07:30 pretends it is that Vienna time.
  var clockOffset = 0;
  var fake = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(new URLSearchParams(location.search).get("now") || "");
  if (fake) clockOffset = Date.UTC(+fake[1], fake[2] - 1, +fake[3], +fake[4], +fake[5]) - viennaReal();
  function viennaNow() { return viennaReal() + clockOffset; }

  function dateMs(iso) { var a = iso.split("-"); return Date.UTC(+a[0], a[1] - 1, +a[2]); }
  function timeMs(hhmm) { var a = hhmm.split(":"); return a[0] * HOUR + a[1] * MIN; }
  function dayStart(ms) { return Math.floor(ms / DAY) * DAY; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function fmtDate(ms) { var d = new Date(ms); return pad(d.getUTCDate()) + "." + pad(d.getUTCMonth() + 1) + "." + d.getUTCFullYear(); }
  function fmtClock(ms) { var d = new Date(ms); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }

  // "3d 4h" from 24h up, otherwise "9h 00m".
  function fmtCountdown(ms) {
    var total = Math.max(0, Math.ceil(ms / MIN));
    if (total >= 1440) return Math.floor(total / 1440) + "d " + Math.floor((total % 1440) / 60) + "h";
    return Math.floor(total / 60) + "h " + pad(total % 60) + "m";
  }

  // ---------- Data ----------
  var resorts = window.RESORTS.map(function (r, i) {
    var o = Object.assign({ id: i }, r);
    o.startMs = dateMs(r.seasonStart || DEFAULTS.start);
    o.endMs = dateMs(r.seasonEnd || DEFAULTS.end);
    o.startEstimated = !r.seasonStart;
    o.endEstimated = !r.seasonEnd;
    o.openMs = r.open ? timeMs(r.open) : null;
    o.closeMs = r.close ? timeMs(r.close) : null;
    o.searchName = normalize(r.name);
    return o;
  });

  function normalize(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // Resorts sharing identical coordinates get nudged apart so both pins stay clickable.
  var seen = {};
  resorts.forEach(function (r) {
    var key = r.lat + "," + r.lon;
    var n = seen[key] || 0;
    seen[key] = n + 1;
    r.pinLat = r.lat;
    r.pinLon = r.lon + n * 0.0012;
  });

  var state = {
    now: viennaNow(),
    types: new Set(["gondola"]),
    status: "all",
    valley: "all",
    search: "",
    todayOnly: false,    // list/map filter: only resorts whose season opened today
    home: null,          // { lat, lon, label, query }
    distances: null      // id -> { km, minutes, approx }
  };

  // ---------- Status and timers ----------
  // Season status depends on the season dates only (inclusive of first and last day).
  function refreshStatus() {
    var now = state.now = viennaNow();
    var today = dayStart(now);
    resorts.forEach(function (r) {
      r.opensIn = null; r.lift = null; r.lastDays = null; r.isNew = false; r.openedToday = false;
      if (today < r.startMs) {
        r.status = "prep";
        r.opensIn = r.startMs + (r.openMs || 0) - now;   // until the lifts start on the first day
      } else if (today > r.endMs) {
        r.status = "ended";
      } else {
        r.status = "open";
        // Newly opened: a real (not assumed) season start within the last NEW_DAYS days.
        r.isNew = !r.startEstimated && today - r.startMs < NEW_DAYS * DAY;
        r.openedToday = r.isNew && today === r.startMs;
        if (r.openMs != null) {
          var tod = now - today;
          if (tod < r.openMs) r.lift = { state: "before", wait: r.openMs - tod };
          else if (tod < r.closeMs) r.lift = { state: "running" };
          else if (today + DAY <= r.endMs) r.lift = { state: "before", wait: DAY - tod + r.openMs };
          else r.lift = { state: "done" };
        }
        var left = r.endMs + DAY - now;
        if (!r.endEstimated && left < LAST_DAYS * DAY) r.lastDays = Math.max(1, Math.ceil(left / DAY));
      }
    });
  }

  // Earliest moment on the slope: the later of (now + preparation + drive) and lift opening,
  // plus the lift ride. If today's lifts close before arrival, the next day counts.
  function timeToSlope(r) {
    var d = state.distances && state.distances[r.id];
    if (r.status !== "open" || r.openMs == null || !d || d.minutes == null) return null;
    var now = state.now;
    var ready = now + PREP_MIN * MIN + d.minutes * MIN;
    for (var day = dayStart(now), i = 0; day <= r.endMs && i < 4; day += DAY, i++) {
      if (ready < day + r.closeMs) return Math.max(ready, day + r.openMs) + LIFT_MIN * MIN - now;
    }
    return null;
  }

  function hoursText(r) { return r.open ? r.open + "–" + r.close : null; }
  // The clock shows the home town once an address is set, otherwise Innsbruck.
  function placeName() {
    if (!state.home) return "Innsbruck";
    return state.home.city || (state.home.label || "").split(",")[0].trim() || "Innsbruck";
  }
  function formatDistance(d) {
    return (d.approx ? "≈ " : "") + (d.km < 10 ? d.km.toFixed(1) : Math.round(d.km)) + " km";
  }
  function formatDuration(min) {
    var m = Math.round(min);
    return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  // ---------- DOM helpers ----------
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  // Status icons: skier = open, snow groomer (Pistenbully) = in preparation, waving hand = season ended.
  var SKIER_SVG = '<svg viewBox="0 0 24 24" ' + STROKE + '><circle cx="15.500" cy="4.500" r="2" fill="currentColor" stroke="none"/>' +
    '<path d="M14 8.500 9.500 13l4.500 2.500-1.500 3.500"/><path d="M12.500 10l4 2 2.500-1.500"/><path d="M4 17l16.500 4.500"/></svg>';
  var GROOMER_SVG = '<svg viewBox="0 0 24 24" ' + STROKE + '><rect x="3" y="15" width="15" height="5" rx="2.500"/>' +
    '<path d="M4.500 15v-3.500h10l2.500 3.500"/><path d="M6.500 11.500V7h5l2 4.500"/><path d="M18 17.500h2.500"/><path d="M20.500 12.500 22 20"/></svg>';
  var WAVE_SVG = '<svg viewBox="0 0 24 24" ' + STROKE + '><g transform="rotate(-14 12 12)">' +
    '<path d="M8.500 12.500V6.500a1.400 1.400 0 0 1 2.800 0V11"/><path d="M11.300 10.500V4.800a1.400 1.400 0 0 1 2.800 0v5.700"/>' +
    '<path d="M14.100 10.500V6.200a1.400 1.400 0 0 1 2.800 0V15a5.500 5.500 0 0 1-5.500 5.500h-.400a5.500 5.500 0 0 1-4.300-2l-3-3.700a1.400 1.400 0 0 1 2.100-1.800l2.700 2.500"/></g>' +
    '<path d="M19.500 3a4 4 0 0 1 2.500 3"/><path d="M2 8.500A4 4 0 0 1 4 5.500"/></svg>';
  var STATUS_ICON = { open: SKIER_SVG, prep: GROOMER_SVG, ended: WAVE_SVG };
  var KIND_ICON = { slope: SKIER_SVG, opens: GROOMER_SVG, ended: WAVE_SVG };

  function withIcon(node, svg, text) {
    node.innerHTML = svg;
    node.appendChild(document.createTextNode(text));
    return node;
  }
  function pill(r) { return withIcon(el("span", "pill " + r.status), STATUS_ICON[r.status], STATUS[r.status]); }
  var FLAME_SVG = '<svg class="flame" viewBox="0 0 24 24"><path fill="#fff3c4" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-2.500 1-4.500 2.500-6 .300 1.800 1 3 2 3.500C10 8 10.500 4.500 12 2z"/><path fill="#ff9a1f" d="M12 12c1 1.500 2.500 2.500 2.500 4.500a2.500 2.500 0 0 1-5 0c0-1.200.800-2.300 2.500-4.500z"/></svg>';
  function firePill(r) {
    return withIcon(el("span", "pill fire"), FLAME_SVG, r.openedToday ? "Opened today" : "Just opened");
  }
  function lastDaysPill(r) {
    return el("span", "pill last", "Last days · " + r.lastDays + (r.lastDays === 1 ? " day left" : " days left"));
  }
  // Gratis in green; paid parking shades from yellow to red with the price. Null = unknown.
  function parkingNode(r, withLabel) {
    if (r.parking == null) return null;
    var prefix = withLabel ? "Parking " : "";
    if (r.parking === 0) return el("strong", "park gratis", prefix + "GRATIS");
    var level = r.parking <= 5 ? "low" : r.parking <= 7 ? "mid" : "high";
    return el("strong", "park paid " + level, prefix + "€" + r.parking + " / day");
  }

  // Two big number tiles: days + hours from 24h up, otherwise hours + minutes.
  function countdownTiles(ms) {
    var total = Math.max(0, Math.ceil(ms / MIN));
    var parts = total >= 1440
      ? [[Math.floor(total / 1440), "days"], [Math.floor((total % 1440) / 60), "hours"]]
      : [[Math.floor(total / 60), "hours"], [pad(total % 60), "min"]];
    var wrap = el("div", "hero-tiles");
    parts.forEach(function (p) {
      var tile = el("div", "hero-tile");
      tile.appendChild(el("b", null, String(p[0])));
      tile.appendChild(el("span", null, p[1]));
      wrap.appendChild(tile);
    });
    return wrap;
  }
  function hero(kind, label, ms, note) {
    var box = el("div", "hero " + kind);
    var text = el("div", "hero-text");
    var heading = el("div", "hero-label");
    if (KIND_ICON[kind]) withIcon(heading, KIND_ICON[kind], label); else heading.textContent = label;
    text.appendChild(heading);
    if (note) text.appendChild(el("div", "hero-note", note));
    box.appendChild(text);
    if (ms != null) box.appendChild(countdownTiles(ms));
    return box;
  }
  function timerChip(kind, label, value) {
    var chip = el("span", "tchip " + kind);
    if (kind === "slope") chip.innerHTML = SKIER_SVG;
    chip.appendChild(el("span", null, label));
    chip.appendChild(el("b", null, value));
    return chip;
  }

  // ---------- Map ----------
  var map = L.map("map", { zoomControl: true });
  // Note: OpenStreetMap's tile servers reject requests without a Referer header, so the
  // page must be served over http(s) (e.g. via serve.ps1), not opened from disk (file://).
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  var markerLayer = L.layerGroup().addTo(map);
  var homeMarker = null;

  function pinIcon(cls, svg, status, isNew) {
    return L.divIcon({
      className: "",
      html: '<div class="badge ' + cls + (isNew ? " is-new" : "") + '">' + svg + (status ? '<i class="dot ' + status + '"></i>' : "") + "</div>",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -16]
    });
  }

  refreshStatus();
  resorts.forEach(function (r) {
    r.iconStatus = r.status + r.isNew;
    r.marker = L.marker([r.pinLat, r.pinLon], {
      icon: pinIcon(r.type, TYPES[r.type].svg, r.status, r.isNew),
      title: r.name,
      alt: TYPES[r.type].label + ": " + r.name
    });
    r.marker.bindPopup(function () { return popupFor(r); }, { minWidth: 290, maxWidth: 340 });
  });

  var COPY_SVG = '<svg viewBox="0 0 24 24" ' + STROKE + '><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    // Fallback for pages not served from a secure origin.
    return new Promise(function (resolve, reject) {
      var area = el("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand("copy");
      area.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  function copyButton(text, label) {
    var btn = el("button", "copy-btn");
    btn.type = "button";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = COPY_SVG + "<span>Copy</span>";
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      copyText(text).then(
        function () { btn.classList.add("done"); btn.lastChild.textContent = "Copied"; },
        function () { btn.lastChild.textContent = "Failed"; }
      ).then(function () {
        setTimeout(function () { btn.classList.remove("done"); btn.lastChild.textContent = "Copy"; }, 1600);
      });
    });
    return btn;
  }

  // Full details of a resort, shown when its row or pin is clicked.
  function popupFor(r) {
    var box = el("div", "popup");
    box.appendChild(el("h3", null, r.name));
    var pills = el("div", "pills");
    pills.appendChild(pill(r));
    pills.appendChild(el("span", "tag " + r.type, TYPES[r.type].label));
    if (r.isNew) pills.appendChild(firePill(r));
    if (r.lastDays) pills.appendChild(lastDaysPill(r));
    box.appendChild(pills);

    // Top banner depends on the season status: opening countdown while in preparation,
    // time to slope while open, and a goodbye once the season has ended.
    if (r.status === "prep") {
      box.appendChild(hero("opens", "Season opens in", r.opensIn,
        fmtDate(r.startMs) + (r.open ? " at " + r.open : "") + (r.startEstimated ? " · expected" : "")));
    } else if (r.status === "ended") {
      box.appendChild(hero("ended", "See you next season!", null, null));
    } else {
      var slope = timeToSlope(r);
      if (slope != null) {
        var slopeHero = hero("slope", "On the slope in", slope, "first turns at " + fmtClock(state.now + slope));
        var hype = slope < 2 * HOUR ? "Go go go!" : slope < 4 * HOUR ? "Gear up!" : "Fresh tracks await";
        slopeHero.querySelector(".hero-text").appendChild(el("div", "hype-tag", hype));
        box.appendChild(slopeHero);
      }
    }

    var facts = el("dl", "facts");
    function fact(label, value, extra) {
      if (value == null || value === "") return;
      facts.appendChild(el("dt", null, label));
      var dd = el("dd");
      if (typeof value === "string") dd.appendChild(el("span", null, value)); else dd.appendChild(value);
      if (extra) dd.appendChild(extra);
      facts.appendChild(dd);
    }
    var start = r.startLabel || (r.seasonStart ? fmtDate(r.startMs) : null);
    var end = r.endLabel || (r.seasonEnd ? fmtDate(r.endMs) : null);
    var liftChip = null;
    if (r.lift && r.lift.state === "before") liftChip = timerChip("lift", "start in", fmtCountdown(r.lift.wait));
    if (r.lift && r.lift.state === "running") liftChip = timerChip("running", "running", "now");
    var gps = r.lat.toFixed(6) + ", " + r.lon.toFixed(6);
    var ended = r.status === "ended";   // after the season only the goodbye banner speaks about timing
    if (!ended) fact("Lift hours", hoursText(r), liftChip);
    fact("Parking", parkingNode(r));
    if (!ended) fact("Season start", start && (start + (r.open ? " · lifts open " + r.open : "")));
    if (!ended) fact("Season end", end);
    fact("Valley", r.valley);
    fact("Address", r.address, r.address ? copyButton(r.address, "Copy address") : null);
    fact("GPS", gps, copyButton(gps, "Copy GPS coordinates"));
    var d = state.distances && state.distances[r.id];
    if (d) {
      fact("From home", formatDistance(d) + (d.approx ? " straight-line" : " by car") +
        (d.minutes != null ? " · " + formatDuration(d.minutes) : ""));
    }
    box.appendChild(facts);

    var link = el("a", "popup-link", state.home ? "Directions on OpenStreetMap" : "Open in OpenStreetMap");
    link.target = "_blank";
    link.rel = "noopener";
    link.href = state.home
      ? "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=" +
        state.home.lat + "," + state.home.lon + ";" + r.lat + "," + r.lon
      : "https://www.openstreetmap.org/?mlat=" + r.lat + "&mlon=" + r.lon + "#map=14/" + r.lat + "/" + r.lon;
    box.appendChild(link);
    return box;
  }

  // ---------- Controls ----------
  var chipsBox = document.getElementById("type-chips");
  var statusBox = document.getElementById("status-chips");
  var valleySelect = document.getElementById("valley-select");
  var searchInput = document.getElementById("search-input");
  var listBox = document.getElementById("resort-list");
  var countBox = document.getElementById("list-count");
  var highlightsBox = document.getElementById("highlights");
  var clockBox = document.getElementById("clock");
  var chipButtons = {};
  var statusButtons = {};

  TYPE_KEYS.forEach(function (key) {
    var count = resorts.filter(function (r) { return r.type === key; }).length;
    var btn = el("button", "chip");
    btn.type = "button";
    btn.innerHTML = '<span class="badge ' + key + '">' + TYPES[key].svg + "</span>";
    btn.appendChild(document.createTextNode(TYPES[key].label + " "));
    btn.appendChild(el("small", null, "(" + count + ")"));
    btn.addEventListener("click", function () {
      if (state.types.has(key)) state.types.delete(key); else state.types.add(key);
      render();
    });
    chipButtons[key] = btn;
    chipsBox.appendChild(btn);
  });

  var allBtn = el("button", "chip chip-all", "Show all");
  allBtn.type = "button";
  allBtn.addEventListener("click", function () {
    var allOn = state.types.size === TYPE_KEYS.length;
    state.types = new Set(allOn ? ["gondola"] : TYPE_KEYS);
    render();
  });
  chipsBox.appendChild(allBtn);

  ["all"].concat(STATUS_KEYS).forEach(function (key) {
    var btn = el("button", "chip chip-status");
    btn.type = "button";
    if (key !== "all") btn.appendChild(el("i", "dot " + key));
    btn.appendChild(el("span", null, key === "all" ? "All" : STATUS[key]));
    btn.appendChild(el("small"));
    btn.addEventListener("click", function () { state.status = key; render(); });
    statusButtons[key] = btn;
    statusBox.appendChild(btn);
  });

  var valleys = [];
  resorts.forEach(function (r) { if (valleys.indexOf(r.valley) < 0) valleys.push(r.valley); });
  valleySelect.appendChild(new Option("All valleys", "all"));
  valleys.forEach(function (v) { valleySelect.appendChild(new Option(v, v)); });
  valleySelect.addEventListener("change", function () {
    state.valley = valleySelect.value;
    render();
    fitToVisible();
  });

  searchInput.addEventListener("input", function () {
    state.search = normalize(searchInput.value.trim());
    render();
  });

  var todayBtn = document.getElementById("today-filter");
  withIcon(todayBtn, FLAME_SVG, "Opened today");
  var todayCount = todayBtn.appendChild(el("small"));
  var todayThumb = todayBtn.appendChild(el("span", "switch-track")).appendChild(el("span", "switch-thumb"));
  // The knob shows a snowflake while off and a flame while on.
  todayThumb.innerHTML = '<svg class="snowflake" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M4.200 7.500l15.600 9M19.800 7.500l-15.600 9"/><path d="M9.500 4.500 12 7l2.500-2.500M9.500 19.500 12 17l2.500 2.500"/></svg>' + FLAME_SVG;
  todayBtn.addEventListener("click", function () {
    state.todayOnly = !state.todayOnly;
    // Switching it on shows every resort that opened today, whatever its lift type or status.
    if (state.todayOnly) { state.types = new Set(TYPE_KEYS); state.status = "all"; }
    render();
    if (state.todayOnly) fitToVisible();
  });

  // ---------- Rendering ----------
  function matches(r) {
    return state.types.has(r.type) &&
      (state.status === "all" || r.status === state.status) &&
      (state.valley === "all" || r.valley === state.valley) &&
      (!state.search || r.searchName.indexOf(state.search) >= 0) &&
      (!state.todayOnly || r.openedToday);
  }

  function visibleResorts() {
    var list = resorts.filter(matches);
    if (state.distances) {
      list.sort(function (a, b) { return state.distances[a.id].km - state.distances[b.id].km; });
    }
    return list;
  }

  // Make sure a resort passes the current filters, then fly to it and open its details.
  function focusResort(r) {
    if (!matches(r)) {
      state.types.add(r.type);
      if (state.status !== "all" && state.status !== r.status) state.status = "all";
      if (state.valley !== "all" && state.valley !== r.valley) { state.valley = "all"; valleySelect.value = "all"; }
      if (state.search && r.searchName.indexOf(state.search) < 0) { state.search = ""; searchInput.value = ""; }
      if (state.todayOnly && !r.openedToday) state.todayOnly = false;
      render();
    }
    // Open the details once the map has arrived, so the popup can pan itself fully into view.
    var token = ++focusToken;
    var open = function () { if (token === focusToken && !r.marker.isPopupOpen()) r.marker.openPopup(); };
    var arrive = function () { map.once("moveend", open); setTimeout(open, 900); };
    var flyToResort = function () {
      arrive();
      map.flyTo([r.pinLat, r.pinLon], Math.max(map.getZoom(), 13), { duration: 0.6 });
    };
    map.closePopup();
    if (!state.home) { flyToResort(); return; }

    // With a home address: draw the driving route and frame the whole trip,
    // leaving room above the resort pin for the details popup.
    showRoute(r).then(function (bounds) {
      if (token !== focusToken) return;
      if (!bounds) { flyToResort(); return; }
      arrive();
      var room = Math.round(Math.min(420, map.getSize().y * 0.5));
      map.flyToBounds(bounds.extend([r.pinLat, r.pinLon]), {
        paddingTopLeft: [50, room], paddingBottomRight: [50, 50], maxZoom: 14, duration: 0.6
      });
    });
  }
  var focusToken = 0;

  // ---------- Route line (home -> selected resort) ----------
  var routeLayer = null, routeFor = null, routeRequest = 0;

  function clearRoute() {
    routeRequest++;                       // cancels any route still loading
    routeFor = null;
    if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  }

  // Fetches the road geometry from OSRM and draws it; resolves to its bounds (or null).
  function showRoute(r) {
    if (!state.home) return Promise.resolve(null);
    var request = ++routeRequest;
    var url = "https://router.project-osrm.org/route/v1/driving/" +
      state.home.lon.toFixed(6) + "," + state.home.lat.toFixed(6) + ";" +
      r.lon.toFixed(6) + "," + r.lat.toFixed(6) + "?overview=full&geometries=geojson";
    return fetch(url)
      .then(function (res) { if (!res.ok) throw new Error("route " + res.status); return res.json(); })
      .then(function (data) {
        if (request !== routeRequest) return null;
        if (data.code !== "Ok" || !data.routes.length) throw new Error("no route");
        var path = data.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
        if (routeLayer) routeLayer.remove();
        routeLayer = L.layerGroup([
          L.polyline(path, { color: "#fff", weight: 9, opacity: 0.9, interactive: false }),
          L.polyline(path, { color: "#d9482b", weight: 5, opacity: 0.95, interactive: false })
        ]).addTo(map);
        routeFor = r.id;
        return L.latLngBounds(path);
      })
      .catch(function () { return null; });   // routing unavailable: simply no line
  }

  // Clicking a pin directly also draws the route. The line stays after the details are closed
  // (so it can be seen in full) until another resort is picked or the home address changes.
  resorts.forEach(function (r) {
    r.marker.on("popupopen", function () { if (state.home && routeFor !== r.id) showRoute(r); });
  });


  // Compact row: name, status, and one timer (time to opening, or time to slope / lift start
  // once the season is open). Everything else is in the details popup.
  function resortRow(r) {
    var li = document.createElement("li");
    var btn = el("button", "resort");
    btn.type = "button";
    btn.title = "Show details";
    var badge = el("span", "badge " + r.type);
    badge.innerHTML = TYPES[r.type].svg;
    badge.title = TYPES[r.type].label;

    var text = el("span", "body");
    text.appendChild(el("div", "name", r.name));
    var line = el("div", "row-status");
    line.appendChild(pill(r));
    if (r.isNew) { line.appendChild(firePill(r)); btn.classList.add("is-new"); }
    if (r.lastDays) line.appendChild(lastDaysPill(r));

    var slope = timeToSlope(r);
    if (r.status === "prep") {
      line.appendChild(timerChip("opens", r.startEstimated ? "Opens in about" : "Opens in", fmtCountdown(r.opensIn)));
    } else if (slope != null) {
      line.appendChild(timerChip("slope", "On the slope in", fmtCountdown(slope)));
    } else if (r.lift && r.lift.state === "before") {
      line.appendChild(timerChip("lift", "Lifts start in", fmtCountdown(r.lift.wait)));
    } else if (r.lift && r.lift.state === "running") {
      line.appendChild(timerChip("running", "Lifts running until", r.close));
    }
    var parking = parkingNode(r, true);
    if (parking) line.appendChild(parking);
    text.appendChild(line);

    btn.appendChild(badge);
    btn.appendChild(text);
    var d = state.distances && state.distances[r.id];
    if (d) {
      var dist = el("span", "dist", formatDistance(d));
      dist.appendChild(el("small", null, d.minutes != null ? formatDuration(d.minutes) + " drive" : "straight-line"));
      btn.appendChild(dist);
    }
    btn.addEventListener("click", function () { focusResort(r); });
    li.appendChild(btn);
    return li;
  }

  function nextOpening() {
    var prep = resorts.filter(function (r) { return r.status === "prep"; });
    if (!prep.length) return null;
    var first = Math.min.apply(null, prep.map(function (r) { return r.startMs; }));
    return {
      dateMs: first,
      resorts: prep.filter(function (r) { return r.startMs === first; })
    };
  }

  // Same pick all day: seeded by the Vienna date, chosen from open resorts when there are any.
  function resortOfTheDay() {
    var pool = resorts.filter(function (r) { return r.status === "open"; });
    if (!pool.length) pool = resorts;
    var key = isoDay(state.now), hash = 0;
    for (var i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return pool[hash % pool.length];
  }

  function highlightCard(cls, title) {
    var card = el("div", "card " + cls);
    card.appendChild(el("div", "card-title", title));
    return card;
  }
  function resortLink(r, extra) {
    var btn = el("button", "card-resort");
    btn.type = "button";
    btn.appendChild(el("span", "card-name", r.name));
    if (extra) btn.appendChild(el("span", "card-extra", extra));
    btn.addEventListener("click", function () { focusResort(r); });
    return btn;
  }

  function renderHighlights() {
    highlightsBox.textContent = "";
    var pick = resortOfTheDay();
    var day = highlightCard("pick", "Resort of the day");
    day.appendChild(resortLink(pick, pick.valley + " · " + STATUS[pick.status]));
    highlightsBox.appendChild(day);

    var next = nextOpening();
    if (next) {
      var card = highlightCard("next", "Next opening · " + fmtDate(next.dateMs));
      next.resorts.forEach(function (r) {
        card.appendChild(resortLink(r, "in " + fmtCountdown(r.opensIn) + (r.startEstimated ? " (expected)" : "")));
      });
      highlightsBox.appendChild(card);
    }
  }

  function render() {
    refreshStatus();
    clockBox.textContent = placeName() + " · " + fmtDate(state.now) + " · " + fmtClock(state.now);

    TYPE_KEYS.forEach(function (key) {
      chipButtons[key].setAttribute("aria-pressed", String(state.types.has(key)));
    });
    var allOn = state.types.size === TYPE_KEYS.length;
    allBtn.setAttribute("aria-pressed", String(allOn));
    allBtn.textContent = allOn ? "Showing all" : "Show all";

    Object.keys(statusButtons).forEach(function (key) {
      var n = key === "all" ? resorts.length : resorts.filter(function (r) { return r.status === key; }).length;
      statusButtons[key].setAttribute("aria-pressed", String(state.status === key));
      statusButtons[key].lastChild.textContent = " (" + n + ")";
    });

    var openedToday = resorts.filter(function (r) { return r.openedToday; }).length;
    if (!openedToday) state.todayOnly = false;
    todayBtn.disabled = !openedToday;
    todayBtn.setAttribute("aria-checked", String(state.todayOnly));
    todayCount.textContent = " (" + openedToday + ")";

    renderHighlights();

    var list = visibleResorts();
    var visible = {};
    list.forEach(function (r) { visible[r.id] = true; });

    // Add/remove only what changed, so an open details popup survives the periodic refresh.
    resorts.forEach(function (r) {
      if (r.marker.isPopupOpen()) r.marker.getPopup().update();   // keep open details current
      if (r.iconStatus !== r.status + r.isNew) {
        r.iconStatus = r.status + r.isNew;
        r.marker.setIcon(pinIcon(r.type, TYPES[r.type].svg, r.status, r.isNew));
      }
      var shown = markerLayer.hasLayer(r.marker);
      if (visible[r.id] && !shown) markerLayer.addLayer(r.marker);
      if (!visible[r.id] && shown) markerLayer.removeLayer(r.marker);
    });

    if (routeFor != null && !visible[routeFor]) clearRoute();   // its resort was filtered out

    listBox.textContent = "";
    countBox.textContent = list.length + " of " + resorts.length +
      (state.distances ? " · nearest first" : "");
    if (!list.length) {
      listBox.appendChild(el("li", "empty", "No resorts match the current filters and search."));
      return;
    }
    list.forEach(function (r) { listBox.appendChild(resortRow(r)); });
  }

  function fitToVisible() {
    var pts = visibleResorts().map(function (r) { return [r.pinLat, r.pinLon]; });
    if (!pts.length) pts = resorts.map(function (r) { return [r.lat, r.lon]; });
    map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  }

  // ---------- Welcome screen ----------
  // Shown once per day: today's season openings, or otherwise the next opening.
  function showWelcome() {
    var dialog = document.getElementById("welcome");
    if (!dialog.showModal) return;
    var todayKey = isoDay(state.now);
    try {
      if (localStorage.getItem("westirol.welcome") === todayKey) return;
    } catch (e) { /* storage unavailable: just show it */ }

    var today = dayStart(state.now);
    var openedToday = resorts.filter(function (r) { return r.startMs === today; });
    var next = nextOpening();
    var title = document.getElementById("welcome-title");
    var sub = document.getElementById("welcome-sub");
    var list = document.getElementById("welcome-list");
    var kicker = document.getElementById("welcome-kicker");
    var countdown = document.getElementById("welcome-countdown");
    var entries, target = null, countLabel, liveText;

    if (openedToday.length) {
      kicker.textContent = "Today";
      title.textContent = "Season opening today!";
      countLabel = "First lift starts in";
      liveText = "The lifts are running. Go!";
      openedToday.forEach(function (r) {
        if (r.openMs != null && (target == null || today + r.openMs < target)) target = today + r.openMs;
      });
      sub.textContent = openedToday.length === 1
        ? "One resort starts its season today, " + fmtDate(today) + "."
        : openedToday.length + " resorts start their season today, " + fmtDate(today) + ".";
      entries = openedToday.map(function (r) {
        var bits = [r.valley];
        if (hoursText(r)) bits.push("lifts " + hoursText(r));
        if (r.startEstimated) bits.push("expected date");
        return { r: r, text: bits.join(" · ") };
      });
    } else if (next) {
      kicker.textContent = "Coming up";
      title.textContent = "Next opening";
      sub.textContent = "No resort opens today, but the next season start is close: " +
        fmtDate(next.dateMs) + ". Get your gear ready!";
      countLabel = "Countdown to the first lift";
      liveText = "Opening now!";
      next.resorts.forEach(function (r) {
        var t = r.startMs + (r.openMs || 0);
        if (target == null || t < target) target = t;
      });
      entries = next.resorts.map(function (r) {
        return { r: r, text: r.valley + " · in " + fmtCountdown(r.opensIn) + (r.startEstimated ? " (expected)" : "") };
      });
    } else {
      return;
    }

    list.textContent = "";
    entries.forEach(function (entry) {
      var li = document.createElement("li");
      var btn = el("button", "welcome-resort");
      btn.type = "button";
      var badge = el("span", "badge " + entry.r.type);
      badge.innerHTML = TYPES[entry.r.type].svg;
      var body = el("span");
      body.appendChild(el("strong", null, entry.r.name));
      body.appendChild(el("small", null, entry.text));
      btn.appendChild(badge);
      btn.appendChild(body);
      btn.addEventListener("click", function () { dialog.close(); focusResort(entry.r); });
      li.appendChild(btn);
      list.appendChild(li);
    });

    document.getElementById("welcome-close").onclick = function () { dialog.close(); };
    dialog.addEventListener("close", function () {
      try { localStorage.setItem("westirol.welcome", todayKey); } catch (e) { /* ignore */ }
    }, { once: true });

    // Live countdown tiles (days / hours / minutes / seconds) to the first lift.
    countdown.textContent = "";
    var timer = null;
    if (target != null) {
      var tiles = el("div", "countdown-tiles");
      var nums = ["days", "hours", "minutes", "seconds"].map(function (unit) {
        var tile = el("div", "tile " + unit);
        var num = el("b");
        tile.appendChild(num);
        tile.appendChild(el("span", null, unit));
        tiles.appendChild(tile);
        return num;
      });
      countdown.appendChild(el("div", "countdown-label", countLabel));
      countdown.appendChild(tiles);
      var tick = function () {
        var left = Math.floor((target - viennaNow()) / 1000);
        if (left <= 0) {
          clearInterval(timer);
          countdown.textContent = "";
          countdown.appendChild(el("div", "count-live", liveText));
          return;
        }
        nums[0].textContent = Math.floor(left / 86400);
        nums[1].textContent = pad(Math.floor((left % 86400) / 3600));
        nums[2].textContent = pad(Math.floor((left % 3600) / 60));
        nums[3].textContent = pad(left % 60);
      };
      tick();
      timer = setInterval(tick, 1000);
    }
    dialog.addEventListener("close", function () { clearInterval(timer); }, { once: true });

    var scene = document.getElementById("welcome-scene");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && scene.pauseAnimations) scene.pauseAnimations();

    dialog.showModal();
    document.getElementById("welcome-close").focus();
  }

  // ---------- Distance from home ----------
  var form = document.getElementById("home-form");
  var input = document.getElementById("home-input");
  var submitBtn = document.getElementById("home-submit");
  var clearBtn = document.getElementById("home-clear");
  var homeStatus = document.getElementById("home-status");

  function setStatus(text, isError) {
    homeStatus.textContent = text;
    homeStatus.classList.toggle("error", !!isError);
  }

  function haversineKm(aLat, aLon, bLat, bLon) {
    var rad = Math.PI / 180;
    var dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  function geocode(query) {
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=" + encodeURIComponent(query);
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("Address lookup failed (" + res.status + ")");
        return res.json();
      })
      .then(function (hits) {
        if (!hits.length) throw new Error("Address not found. Try adding a city or postcode.");
        var a = hits[0].address || {};
        return {
          lat: parseFloat(hits[0].lat), lon: parseFloat(hits[0].lon),
          label: hits[0].display_name, query: query,
          city: a.city || a.town || a.village || a.municipality || a.hamlet || ""
        };
      });
  }

  // One OSRM "table" request: home is the single source, every resort a destination.
  function drivingTable(home) {
    var coords = [home.lon.toFixed(6) + "," + home.lat.toFixed(6)].concat(
      resorts.map(function (r) { return r.lon.toFixed(6) + "," + r.lat.toFixed(6); })
    ).join(";");
    var url = "https://router.project-osrm.org/table/v1/driving/" + coords +
      "?sources=0&annotations=distance,duration";
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Routing failed (" + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        if (data.code !== "Ok") throw new Error("Routing failed (" + data.code + ")");
        return { meters: data.distances[0].slice(1), seconds: data.durations[0].slice(1) };
      });
  }

  function applyDistances(home, table) {
    var distances = {};
    var approxCount = 0;
    resorts.forEach(function (r, i) {
      var m = table && table.meters[i];
      if (m != null) {
        distances[r.id] = { km: m / 1000, minutes: table.seconds[i] / 60, approx: false };
      } else {
        approxCount++;
        distances[r.id] = { km: haversineKm(home.lat, home.lon, r.lat, r.lon), minutes: null, approx: true };
      }
    });
    state.home = home;
    state.distances = distances;

    if (homeMarker) homeMarker.remove();
    map.closePopup();      // the old route no longer applies to the new home
    clearRoute();
    homeMarker = L.marker([home.lat, home.lon], {
      icon: pinIcon("home", HOME_SVG), title: "Home", zIndexOffset: 1000
    }).addTo(map).bindPopup(function () {
      var box = el("div", "popup");
      box.appendChild(el("h3", null, "Home"));
      box.appendChild(el("p", null, home.label));
      return box;
    });
    clearBtn.hidden = false;
    render();
    return approxCount;
  }

  // Routes from a known home position; the home is remembered in this browser only.
  function calculateFrom(home) {
    setStatus("Calculating driving distances…");
    return drivingTable(home).then(
      function (table) {
        var approx = applyDistances(home, table);
        setStatus("Driving distance from: " + home.label +
          (approx ? " (" + approx + " without a road route shown as straight-line)" : ""));
      },
      function () {
        applyDistances(home, null);
        setStatus("Routing service unavailable — showing straight-line distances from: " + home.label, true);
      }
    ).then(function () {
      try { localStorage.setItem("westirol.home", JSON.stringify(home)); } catch (e) { /* ignore */ }
    });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var query = input.value.trim();
    if (!query) return;
    submitBtn.disabled = true;
    setStatus("Looking up address…");
    geocode(query)
      .then(calculateFrom)
      .catch(function (err) {
        setStatus(err && err.message && !/Failed to fetch|NetworkError/i.test(err.message)
          ? err.message
          : "Could not reach the address lookup service. Check your connection and try again.", true);
      })
      .then(function () { submitBtn.disabled = false; });
  });

  clearBtn.addEventListener("click", function () {
    state.home = null;
    state.distances = null;
    if (homeMarker) { homeMarker.remove(); homeMarker = null; }
    clearRoute();
    try { localStorage.removeItem("westirol.home"); } catch (e) { /* ignore */ }
    input.value = "";
    clearBtn.hidden = true;
    setStatus("");
    render();
  });

  // ---------- Start ----------
  render();
  map.fitBounds(resorts.map(function (r) { return [r.lat, r.lon]; }), { padding: [30, 30] });
  showWelcome();

  try {
    var saved = JSON.parse(localStorage.getItem("westirol.home") || "null");
    if (saved && typeof saved.lat === "number" && typeof saved.lon === "number") {
      input.value = saved.query || "";
      calculateFrom(saved);
    }
  } catch (e) { /* no saved home */ }

  // Keep statuses, timers and countdowns current.
  setInterval(render, 30000);
})();
