/* West Tirol Ski Resorts — app logic.
   Regions run top to bottom: settings, icons, time, text formatting, resort data, app state,
   season logic, DOM helpers, labels, clipboard, map, directions, details popup, sidebar, list,
   render, welcome screen, home address, storage and start-up. */
(function () {
  "use strict";

  // #region Settings
  // Durations in the day plan, in minutes.
  var PREP_MIN = 60;        // getting ready at home before driving
  var GEAR_MIN = 10;        // gearing up at the resort (boots, skis) before the lift
  var LIFT_MIN = 15;        // ski lift ride up to the slope
  var SLEEP_MIN = 8 * 60;   // a full night's sleep before a ski day

  // Badge thresholds, in days.
  var LAST_DAYS = 7;        // "Last days" badge: days before the season end
  var NEW_DAYS = 7;         // "Recently opened" badge: days since the season start

  // How often statuses, timers and countdowns are recalculated.
  var REFRESH_MS = 30000;

  // Milliseconds per minute, hour and day.
  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  // Lift types in chip order, their labels, and the types selected on first load.
  var TYPE_KEYS = ["gondola", "chairlift", "tbar"];
  var TYPE_LABEL = { gondola: "Gondola", chairlift: "Chairlift", tbar: "T-bar" };
  var DEFAULT_TYPES = ["gondola"];

  // Season status keys and their labels.
  var STATUS_KEYS = ["open", "prep", "ended"];
  var STATUS = { open: "Season open", prep: "In preparation", ended: "Season ended" };

  // External services: OpenStreetMap tiles, Nominatim address search, OSRM routing.
  var TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  var GEOCODE_URL = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=";
  var ROUTE_URL = "https://router.project-osrm.org/route/v1/driving/";
  var TABLE_URL = "https://router.project-osrm.org/table/v1/driving/";

  // Keys used in this browser's local storage.
  var STORE_HOME = "westirol.home";         // the saved home address
  var STORE_WELCOME = "westirol.welcome";   // the day the welcome screen was last closed
  // #endregion

  // #region Icons
  // Line icons share one style: a 24x24 box stroked in the current text color.
  var STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  // Wraps SVG shapes in the shared line-icon frame.
  function lineIcon(shapes) { return '<svg viewBox="0 0 24 24" ' + STROKE + '>' + shapes + '</svg>'; }

  // The cable drawn above every lift icon.
  var CABLE = '<path d="M3 5.5 21 2.5"/>';

  var ICON = {
    // Lift types and the home pin.
    gondola: lineIcon(CABLE + '<path d="M12 4v4"/><rect x="5.5" y="8" width="13" height="12" rx="3.5"/><path d="M5.5 14h13M12 8v6"/>'),
    chairlift: lineIcon(CABLE + '<path d="M12 4v6"/><path d="M7 10h10"/><path d="M7 10v6h10v-6"/><path d="M9 16v4h6"/>'),
    tbar: lineIcon(CABLE + '<path d="M12 4v14"/><path d="M5.5 18h13"/>'),
    home: lineIcon('<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),

    // Season status: skier = open, snow groomer = in preparation, waving hand = ended.
    skier: lineIcon('<circle cx="15.5" cy="4.5" r="2" fill="currentColor" stroke="none"/>' +
      '<path d="M14 8.5 9.5 13l4.5 2.5-1.5 3.5"/><path d="M12.5 10l4 2 2.5-1.5"/><path d="M4 17l16.5 4.5"/>'),
    groomer: lineIcon('<rect x="3" y="15" width="15" height="5" rx="2.5"/>' +
      '<path d="M4.5 15v-3.5h10l2.5 3.5"/><path d="M6.5 11.5V7h5l2 4.5"/><path d="M18 17.5h2.5"/><path d="M20.5 12.5 22 20"/>'),
    wave: lineIcon('<g transform="rotate(-14 12 12)">' +
      '<path d="M8.5 12.5V6.5a1.4 1.4 0 0 1 2.8 0V11"/><path d="M11.3 10.5V4.8a1.4 1.4 0 0 1 2.8 0v5.7"/>' +
      '<path d="M14.1 10.5V6.2a1.4 1.4 0 0 1 2.8 0V15a5.5 5.5 0 0 1-5.5 5.5h-.4a5.5 5.5 0 0 1-4.3-2l-3-3.7a1.4 1.4 0 0 1 2.1-1.8l2.7 2.5"/></g>' +
      '<path d="M19.5 3a4 4 0 0 1 2.5 3"/><path d="M2 8.5A4 4 0 0 1 4 5.5"/>'),

    // Day plan: bed, alarm clock, car.
    bed: lineIcon('<path d="M2.5 19V6"/><path d="M2.5 15h19v4"/>' +
      '<path d="M21.5 15v-2.5a3 3 0 0 0-3-3H10V15"/><circle cx="6.3" cy="11.5" r="2"/>'),
    alarm: lineIcon('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2"/>' +
      '<path d="M5 3.5 2.5 6M19 3.5 21.5 6"/><path d="M7 20l-1.5 2M17 20l1.5 2"/>'),
    car: lineIcon('<path d="M3.5 16.5v-4.5l2.3-5h12.4l2.3 5v4.5z"/>' +
      '<path d="M3.5 12h17"/><circle cx="7.5" cy="16.5" r="2" fill="currentColor"/><circle cx="16.5" cy="16.5" r="2" fill="currentColor"/>'),

    // Copy-to-clipboard button.
    copy: lineIcon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),

    // Two-tone flame for "Recently opened" (filled, not a line icon).
    flame: '<svg class="flame" viewBox="0 0 24 24">' +
      '<path fill="#fff3c4" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-2.5 1-4.5 2.5-6 .3 1.8 1 3 2 3.5C10 8 10.5 4.5 12 2z"/>' +
      '<path fill="#ff9a1f" d="M12 12c1 1.5 2.5 2.5 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.2.8-2.3 2.5-4.5z"/></svg>'
  };

  // Icon shown in each season status pill.
  var STATUS_ICON = { open: ICON.skier, prep: ICON.groomer, ended: ICON.wave };
  // Icon shown in each kind of hero banner.
  var HERO_ICON = { slope: ICON.skier, opens: ICON.groomer, ended: ICON.wave, night: ICON.bed };
  // #endregion

  // #region Time (Vienna wall clock)
  // All times are Vienna wall-clock values stored as "naive" milliseconds (the wall-clock
  // fields fed through Date.UTC), so date maths needs no time-zone handling.
  var viennaFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });

  // The real Vienna wall-clock time right now.
  function viennaReal() {
    var parts = {};
    viennaFormat.formatToParts(new Date()).forEach(function (p) { parts[p.type] = +p.value; });
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }

  // Testing aid: index.html?now=2026-12-19T07:30 pretends it is that Vienna time.
  function testClockOffset() {
    var fake = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(new URLSearchParams(location.search).get("now") || "");
    return fake ? Date.UTC(+fake[1], fake[2] - 1, +fake[3], +fake[4], +fake[5]) - viennaReal() : 0;
  }
  var clockOffset = testClockOffset();

  // The app's "now": real Vienna time plus the optional test offset.
  function viennaNow() { return viennaReal() + clockOffset; }

  // "2026-12-19" -> midnight of that day.
  function dateMs(iso) { var a = iso.split("-"); return Date.UTC(+a[0], a[1] - 1, +a[2]); }
  // "08:30" -> milliseconds after midnight.
  function timeMs(hhmm) { var a = hhmm.split(":"); return a[0] * HOUR + a[1] * MIN; }
  // Midnight of the day that contains ms.
  function dayStart(ms) { return Math.floor(ms / DAY) * DAY; }
  // "2026-12-19" for any time on that day; used as a once-per-day key.
  function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
  // #endregion

  // #region Text formatting
  // 7 -> "07".
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  // "19.12.2026".
  function fmtDate(ms) { var d = new Date(ms); return pad(d.getUTCDate()) + "." + pad(d.getUTCMonth() + 1) + "." + d.getUTCFullYear(); }
  // "07:30".
  function fmtClock(ms) { var d = new Date(ms); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }

  // Splits a duration into two [value, unit] pairs: days + hours from 24h up, otherwise hours + minutes.
  function countdownParts(ms) {
    var total = Math.max(0, Math.ceil(ms / MIN));
    return total >= 1440
      ? [[Math.floor(total / 1440), "days"], [Math.floor((total % 1440) / 60), "hours"]]
      : [[Math.floor(total / 60), "hours"], [pad(total % 60), "min"]];
  }
  // Compact countdown: "3d 4h" or "9h 05m".
  function fmtCountdown(ms) {
    var p = countdownParts(ms);
    return p[1][1] === "hours" ? p[0][0] + "d " + p[1][0] + "h" : p[0][0] + "h " + p[1][0] + "m";
  }

  // "≈ 12 km" (straight-line) or "4.4 km" (by road).
  function formatDistance(d) {
    return (d.approx ? "≈ " : "") + (d.km < 10 ? d.km.toFixed(1) : Math.round(d.km)) + " km";
  }
  // "45 min", "1 h", "1 h 5 min".
  function formatDuration(min) {
    var m = Math.round(min);
    return m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
  }
  // "21:30" today, "tomorrow 05:30", or "20.12.2026 08:15" further ahead.
  function whenText(ms) {
    var days = Math.round((dayStart(ms) - dayStart(state.now)) / DAY);
    return (days === 1 ? "tomorrow " : days > 1 ? fmtDate(ms) + " " : "") + fmtClock(ms);
  }
  // "08:30–16:00", or null when the lift hours are unknown.
  function hoursText(r) { return r.open ? r.open + "–" + r.close : null; }
  // #endregion

  // #region Resort data
  // Season dates used for calculations (never displayed) when a resort's date is unknown.
  var DEFAULTS = window.SEASON_DEFAULTS;

  // Lower-case name without accents, so "solden" finds "Sölden".
  function normalize(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  // Adds parsed season dates, lift times and a search key to a raw entry from resorts.js.
  function prepareResort(raw, id) {
    var r = Object.assign({ id: id }, raw);
    r.startMs = dateMs(raw.seasonStart || DEFAULTS.start);
    r.endMs = dateMs(raw.seasonEnd || DEFAULTS.end);
    r.startEstimated = !raw.seasonStart;
    r.endEstimated = !raw.seasonEnd;
    r.openMs = raw.open ? timeMs(raw.open) : null;
    r.closeMs = raw.close ? timeMs(raw.close) : null;
    r.searchName = normalize(raw.name);
    return r;
  }

  // Resorts sharing identical coordinates get nudged apart so every map pin stays clickable.
  function spreadDuplicatePins(list) {
    var seen = {};
    list.forEach(function (r) {
      var key = r.lat + "," + r.lon;
      var n = seen[key] || 0;
      seen[key] = n + 1;
      r.pinLat = r.lat;
      r.pinLon = r.lon + n * 0.0012;
    });
  }

  var resorts = window.RESORTS.map(prepareResort);
  spreadDuplicatePins(resorts);

  // Resorts that pass a test.
  function resortsWhere(test) { return resorts.filter(test); }
  // Number of resorts that pass a test.
  function countWhere(test) { return resorts.filter(test).length; }
  // Test for "has this season status".
  function hasStatus(status) { return function (r) { return r.status === status; }; }
  // #endregion

  // #region App state
  // Everything the page shows is derived from this object and the resort list.
  var state = {
    now: viennaNow(),
    types: new Set(DEFAULT_TYPES),   // lift types switched on
    status: "all",                   // season status filter
    valley: "all",                   // valley filter
    search: "",                      // normalized search text
    home: null,                      // { lat, lon, label, query, city }
    distances: null                  // resort id -> { km, minutes, approx }
  };

  // Distance and drive time from home to a resort, or null without a home address.
  function distanceTo(r) { return state.distances && state.distances[r.id]; }
  // #endregion

  // #region Season status and timers
  // Recalculates every resort's season status, badges and lift timer for the current time.
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
        r.isNew = !r.startEstimated && today - r.startMs < NEW_DAYS * DAY;   // real start date only
        r.openedToday = r.isNew && today === r.startMs;
        r.lift = liftTimer(r, now, today);
        r.lastDays = lastDaysLeft(r, now);
      }
    });
  }

  // Today's lift state while the season is open: waiting to start, running, or done for the season.
  function liftTimer(r, now, today) {
    if (r.openMs == null) return null;
    var timeOfDay = now - today;
    if (timeOfDay < r.openMs) return { state: "before", wait: r.openMs - timeOfDay };
    if (timeOfDay < r.closeMs) return { state: "running" };
    if (today + DAY <= r.endMs) return { state: "before", wait: DAY - timeOfDay + r.openMs };
    return { state: "done" };
  }

  // Days left in the season when the (known) end is less than LAST_DAYS away, otherwise null.
  function lastDaysLeft(r, now) {
    var left = r.endMs + DAY - now;
    return !r.endEstimated && left < LAST_DAYS * DAY ? Math.max(1, Math.ceil(left / DAY)) : null;
  }

  // Time until on the slope: the later of (now + prepare + drive + gear up) and lift opening,
  // plus the lift ride. If today's lifts close before then, the next day counts.
  function timeToSlope(r) {
    var d = distanceTo(r);
    if (r.status !== "open" || r.openMs == null || !d || d.minutes == null) return null;
    var now = state.now;
    var ready = now + (PREP_MIN + d.minutes + GEAR_MIN) * MIN;
    for (var day = dayStart(now), i = 0; day <= r.endMs && i < 4; day += DAY, i++) {
      if (ready < day + r.closeMs) return Math.max(ready, day + r.openMs) + LIFT_MIN * MIN - now;
    }
    return null;
  }

  // Bedtime mode: from when the last resort's lifts stop for the day (daytime schedule) until
  // midnight. Uses the resorts in season today, or all resorts off-season.
  function isBedtime() {
    var withHours = resortsWhere(function (r) { return r.closeMs != null; });
    var pool = withHours.filter(hasStatus("open"));
    if (!pool.length) pool = withHours;
    if (!pool.length) return false;
    var lastClose = Math.max.apply(null, pool.map(function (r) { return r.closeMs; }));
    return state.now - dayStart(state.now) >= lastClose;
  }

  // The day plan, worked back from the moment on the slope:
  // go to bed -> sleep -> wake up -> get ready -> start driving -> drive -> gear up -> lift -> on the slope.
  // Bedtime and wake-up are only part of it in bedtime mode, for a ski day tomorrow.
  function tripPlan(r) {
    var slopeIn = timeToSlope(r);
    if (slopeIn == null) return null;
    var drive = Math.round(distanceTo(r).minutes);   // whole minutes, as displayed
    var plan = { slopeIn: slopeIn, slopeAt: state.now + slopeIn, drive: drive };
    plan.driveAt = plan.slopeAt - (LIFT_MIN + GEAR_MIN + drive) * MIN;
    if (isBedtime() && dayStart(plan.slopeAt) === dayStart(state.now) + DAY) {
      plan.wakeAt = plan.driveAt - PREP_MIN * MIN;
      plan.bedAt = plan.wakeAt - SLEEP_MIN * MIN;
    }
    return plan;
  }

  // The earliest upcoming season start and every resort opening on that day, or null.
  function nextOpening() {
    var prep = resortsWhere(hasStatus("prep"));
    if (!prep.length) return null;
    var first = Math.min.apply(null, prep.map(function (r) { return r.startMs; }));
    return { dateMs: first, resorts: prep.filter(function (r) { return r.startMs === first; }) };
  }

  // Same pick all day: seeded by the Vienna date, chosen from open resorts when there are any.
  function resortOfTheDay() {
    var pool = resortsWhere(hasStatus("open"));
    if (!pool.length) pool = resorts;
    var key = isoDay(state.now), hash = 0;
    for (var i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return pool[hash % pool.length];
  }
  // #endregion

  // #region DOM helpers
  // Element by id.
  function byId(id) { return document.getElementById(id); }

  // Elements in index.html that the script fills or listens to.
  var dom = {
    typeChips: byId("type-chips"),
    statusChips: byId("status-chips"),
    valley: byId("valley-select"),
    search: byId("search-input"),
    list: byId("resort-list"),
    count: byId("list-count"),
    highlights: byId("highlights"),
    clock: byId("clock"),
    homeForm: byId("home-form"),
    homeInput: byId("home-input"),
    homeSubmit: byId("home-submit"),
    homeClear: byId("home-clear"),
    homeStatus: byId("home-status")
  };

  // New element with an optional class name and text.
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // Appends every child that is not null or undefined; returns the parent.
  function append(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }

  // Replaces a node's content with an SVG icon followed by a text label.
  function withIcon(node, svg, text) {
    node.innerHTML = svg;
    node.appendChild(document.createTextNode(text));
    return node;
  }

  // A type="button" element with an optional click handler.
  function button(cls, text, onClick) {
    var btn = el("button", cls, text);
    btn.type = "button";
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
  }

  // Round lift-type badge with its icon.
  function liftBadge(type) {
    var badge = el("span", "badge " + type);
    badge.innerHTML = ICON[type];
    return badge;
  }
  // #endregion

  // #region Labels (pills, chips, tiles, banners)
  // Season status pill with its icon.
  function statusPill(r) { return withIcon(el("span", "pill " + r.status), STATUS_ICON[r.status], STATUS[r.status]); }

  // Flame pill for resorts that opened in the last NEW_DAYS days.
  function firePill(r) { return withIcon(el("span", "pill fire"), ICON.flame, r.openedToday ? "Opened today" : "Recently opened"); }

  // "Last days · 3 days left" pill near the season end.
  function lastDaysPill(r) {
    return el("span", "pill last", "Last days · " + r.lastDays + (r.lastDays === 1 ? " day left" : " days left"));
  }

  // Colored lift-type tag, e.g. "Gondola".
  function typeTag(r) { return el("span", "tag " + r.type, TYPE_LABEL[r.type]); }

  // Timer chip: label + bold value, e.g. "Opens in 3d 4h"; the slope chip gets a skier icon.
  function timerChip(kind, label, value) {
    var chip = el("span", "tchip " + kind);
    if (kind === "slope") chip.innerHTML = ICON.skier;
    return append(chip, el("span", null, label), el("b", null, value));
  }

  // Parking price: "GRATIS" in green, paid parking shaded yellow to red by price; null when unknown.
  function parkingLabel(r, withPrefix) {
    if (r.parking == null) return null;
    var prefix = withPrefix ? "Parking " : "";
    if (r.parking === 0) return el("strong", "park gratis", prefix + "GRATIS");
    var level = r.parking <= 5 ? "low" : r.parking <= 7 ? "mid" : "high";
    return el("strong", "park paid " + level, prefix + "€" + r.parking + " / day");
  }

  // Two big number tiles for a countdown, e.g. "12 HOURS | 45 MIN".
  function countdownTiles(ms) {
    var wrap = el("div", "hero-tiles");
    countdownParts(ms).forEach(function (p) {
      append(wrap, append(el("div", "hero-tile"), el("b", null, String(p[0])), el("span", null, p[1])));
    });
    return wrap;
  }

  // Colored banner: icon + label and an optional note on the left, optional countdown tiles on the right.
  function hero(kind, label, ms, note) {
    var heading = el("div", "hero-label");
    if (HERO_ICON[kind]) withIcon(heading, HERO_ICON[kind], label); else heading.textContent = label;
    var text = append(el("div", "hero-text"), heading, note ? el("div", "hero-note", note) : null);
    return append(el("div", "hero " + kind), text, ms != null ? countdownTiles(ms) : null);
  }
  // #endregion

  // #region Clipboard
  // Copies text, with a fallback for pages not served from a secure origin.
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
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

  // Small "Copy" button that shows "Copied" (or "Failed") for a moment after a click.
  function copyButton(text, label) {
    var btn = button("copy-btn");
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = ICON.copy + "<span>Copy</span>";
    var caption = function (t) { btn.lastChild.textContent = t; };
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      copyText(text).then(
        function () { btn.classList.add("done"); caption("Copied"); },
        function () { caption("Failed"); }
      ).then(function () {
        setTimeout(function () { btn.classList.remove("done"); caption("Copy"); }, 1600);
      });
    });
    return btn;
  }
  // #endregion

  // #region Map and pins
  // Note: OpenStreetMap's tile servers reject requests without a Referer header, so the
  // page must be served over http(s) (e.g. via serve.ps1), not opened from disk (file://).
  var map = L.map("map", { zoomControl: true });
  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  var markerLayer = L.layerGroup().addTo(map);   // resort pins that pass the filters
  var homeMarker = null;                          // the home pin, once an address is set
  var focusToken = 0;                             // cancels a pending "open details" when bumped

  // Round map pin: badge with icon, optional status dot, optional ember glow.
  function pinIcon(cls, svg, status, isNew) {
    return L.divIcon({
      className: "",
      html: '<div class="badge ' + cls + (isNew ? " is-new" : "") + '">' + svg +
        (status ? '<i class="dot ' + status + '"></i>' : "") + "</div>",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -16]
    });
  }

  // A resort's pin icon for its current status.
  function resortIcon(r) { return pinIcon(r.type, ICON[r.type], r.status, r.isNew); }
  // What the pin icon depends on; the pin is redrawn when this changes.
  function pinState(r) { return r.status + r.isNew; }

  // Creates one pin per resort, with the details popup bound to it.
  function createMarkers() {
    resorts.forEach(function (r) {
      r.drawnPin = pinState(r);
      r.marker = L.marker([r.pinLat, r.pinLon], {
        icon: resortIcon(r),
        title: r.name,
        alt: TYPE_LABEL[r.type] + ": " + r.name
      });
      r.marker.bindPopup(function () { return popupFor(r); }, { minWidth: 290, maxWidth: 340 });
    });
  }

  // Shows only the visible resorts' pins, refreshes changed icons and any open details.
  // Only what changed is touched, so an open details popup survives the periodic refresh.
  function syncMarkers(visible) {
    resorts.forEach(function (r) {
      if (r.marker.isPopupOpen()) r.marker.getPopup().update();
      if (r.drawnPin !== pinState(r)) {
        r.drawnPin = pinState(r);
        r.marker.setIcon(resortIcon(r));
      }
      var shown = markerLayer.hasLayer(r.marker);
      if (visible[r.id] && !shown) markerLayer.addLayer(r.marker);
      if (!visible[r.id] && shown) markerLayer.removeLayer(r.marker);
    });
  }

  // Zooms the map to the pins that pass the filters (or all pins when none do).
  function fitToVisible() {
    var points = visibleResorts().map(function (r) { return [r.pinLat, r.pinLon]; });
    if (!points.length) points = resorts.map(function (r) { return [r.lat, r.lon]; });
    map.fitBounds(points, { padding: [40, 40], maxZoom: 13 });
  }

  // Loosens any filter that hides the resort, then flies to it and opens its details.
  function focusResort(r) {
    revealResort(r);
    // Open the details once the map has arrived, so the popup can pan itself fully into view.
    var token = ++focusToken;
    var open = function () { if (token === focusToken && !r.marker.isPopupOpen()) r.marker.openPopup(); };
    map.closePopup();
    map.once("moveend", open);
    setTimeout(open, 900);
    map.flyTo([r.pinLat, r.pinLon], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }

  // Changes only the filters that currently hide this resort.
  function revealResort(r) {
    if (matches(r)) return;
    state.types.add(r.type);
    if (state.status !== "all" && state.status !== r.status) state.status = "all";
    if (state.valley !== "all" && state.valley !== r.valley) { state.valley = "all"; dom.valley.value = "all"; }
    if (state.search && r.searchName.indexOf(state.search) < 0) { state.search = ""; dom.search.value = ""; }
    render();
  }
  // #endregion

  // #region Directions (route line from home to a resort)
  // The route is drawn only on request ("Show directions" in the details). It stays until
  // another route is shown, its resort is filtered out, or the home address changes.
  var route = { layer: null, resortId: null, request: 0 };

  // "lon,lat" with 6 decimals, the coordinate format OSRM expects.
  function lonLat(p) { return p.lon.toFixed(6) + "," + p.lat.toFixed(6); }

  // Removes the route line and cancels any route still loading.
  function clearRoute() {
    route.request++;
    route.resortId = null;
    if (route.layer) { route.layer.remove(); route.layer = null; }
  }

  // Fetches the road geometry from OSRM and draws it; resolves to its bounds, or null on failure.
  function showRoute(r) {
    if (!state.home) return Promise.resolve(null);
    var request = ++route.request;
    var url = ROUTE_URL + lonLat(state.home) + ";" + lonLat(r) + "?overview=full&geometries=geojson";
    return fetchJson(url, "Route failed")
      .then(function (data) {
        if (request !== route.request) return null;   // a newer request replaced this one
        if (data.code !== "Ok" || !data.routes.length) throw new Error("no route");
        var path = data.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
        if (route.layer) route.layer.remove();
        route.layer = L.layerGroup([
          L.polyline(path, { color: "#fff", weight: 9, opacity: 0.9, interactive: false }),
          L.polyline(path, { color: "#d9482b", weight: 5, opacity: 0.95, interactive: false })
        ]).addTo(map);
        route.resortId = r.id;
        return L.latLngBounds(path);
      })
      .catch(function () { return null; });   // routing unavailable: simply no line
  }

  // "Show directions": closes the details, draws the route and frames the whole trip.
  function showDirections(r) {
    if (!state.home) return;
    focusToken++;   // cancel a details popup still waiting to open
    map.closePopup();
    setStatus("Loading directions to " + r.name + "…");
    showRoute(r).then(function (bounds) {
      if (!bounds) {
        if (route.resortId !== r.id) setStatus("Could not load directions to " + r.name + ". Try again later.", true);
        return;
      }
      setStatus("Directions to " + r.name + " shown on the map.");
      map.flyToBounds(bounds.extend([r.pinLat, r.pinLon]).extend([state.home.lat, state.home.lon]), {
        padding: [50, 50], maxZoom: 14, duration: 0.6
      });
    });
  }
  // #endregion

  // #region Resort details popup
  // One step of the day plan: icon + label on the left, clock time on the right.
  function planStep(kind, svg, label, ms) {
    var step = el("div", "plan-step " + kind);
    withIcon(step.appendChild(el("span", "plan-label")), svg, label);
    return append(step, el("b", "plan-time", whenText(ms)));
  }

  // Dashed connector between two steps, e.g. "sleep 8 h".
  function planGap(text) { return el("div", "plan-gap", text); }

  // "Go to bed in" night card with countdown, or "Time for bed!" once bedtime has passed.
  function bedtimeCard(plan) {
    var left = plan.bedAt - state.now;
    var card = left > 0
      ? hero("night", "Go to bed in", left, "Lights out at " + fmtClock(plan.bedAt))
      : hero("night", "Time for bed!", null, "Bedtime was " + fmtClock(plan.bedAt) + " · sleep now");
    return append(card, el("span", "moon"));
  }

  // "On the slope in" banner with countdown, first-turn time and a hype tag.
  function slopeCard(plan) {
    var card = hero("slope", "On the slope in", plan.slopeIn, "first turns at " + whenText(plan.slopeAt));
    var hype = plan.slopeIn < 2 * HOUR ? "Go go go!" : plan.slopeIn < 4 * HOUR ? "Gear up!" : "Fresh tracks await";
    card.querySelector(".hero-text").appendChild(el("div", "hype-tag", hype));
    return card;
  }

  // Go to bed -> Wake up at -> Start driving -> On the slope (bed and wake-up only in bedtime mode).
  function planNode(plan) {
    var wrap = el("div", "plan");
    if (plan.bedAt != null) {
      append(wrap,
        bedtimeCard(plan),
        planGap("sleep " + formatDuration(SLEEP_MIN)),
        planStep("wake", ICON.alarm, "Wake up at", plan.wakeAt));
    }
    return append(wrap,
      planGap("get ready " + formatDuration(PREP_MIN)),
      planStep("drive", ICON.car, "Start driving", plan.driveAt),
      planGap("drive " + formatDuration(plan.drive) + " + " + GEAR_MIN + " min gearing up + " + LIFT_MIN + " min up the lift"),
      slopeCard(plan));
  }

  // Top of the details by season: opening countdown, day plan while open, goodbye after the season.
  function seasonBanner(r) {
    if (r.status === "prep") {
      return hero("opens", "Season opens in", r.opensIn,
        fmtDate(r.startMs) + (r.open ? " at " + r.open : "") + (r.startEstimated ? " · expected" : ""));
    }
    if (r.status === "ended") return hero("ended", "See you next season!", null, null);
    var plan = tripPlan(r);
    return plan ? planNode(plan) : null;
  }

  // Small chip next to the lift hours: "start in 2h 30m" or "running now".
  function liftChip(r) {
    if (r.lift && r.lift.state === "before") return timerChip("lift", "start in", fmtCountdown(r.lift.wait));
    if (r.lift && r.lift.state === "running") return timerChip("running", "running", "now");
    return null;
  }

  // Label/value table: lift hours, parking, season dates, valley, address, GPS, distance from home.
  function factList(r) {
    var facts = el("dl", "facts");
    // Adds one row; skipped when the value is empty. Strings are wrapped in a span.
    function fact(label, value, extra) {
      if (value == null || value === "") return;
      var dd = append(el("dd"), typeof value === "string" ? el("span", null, value) : value, extra);
      append(facts, el("dt", null, label), dd);
    }
    var start = r.startLabel || (r.seasonStart ? fmtDate(r.startMs) : null);
    var end = r.endLabel || (r.seasonEnd ? fmtDate(r.endMs) : null);
    var gps = r.lat.toFixed(6) + ", " + r.lon.toFixed(6);
    var ended = r.status === "ended";   // after the season only the goodbye banner speaks about timing
    var d = distanceTo(r);

    if (!ended) fact("Lift hours", hoursText(r), liftChip(r));
    fact("Parking", parkingLabel(r));
    if (!ended) fact("Season start", start && (start + (r.open ? " · lifts open " + r.open : "")));
    if (!ended) fact("Season end", end);
    fact("Valley", r.valley);
    fact("Address", r.address, r.address ? copyButton(r.address, "Copy address") : null);
    fact("GPS", gps, copyButton(gps, "Copy GPS coordinates"));
    if (d) {
      fact("From home", formatDistance(d) + (d.approx ? " straight-line" : " by car") +
        (d.minutes != null ? " · " + formatDuration(d.minutes) : ""));
    }
    return facts;
  }

  // "Show directions" button; disabled while no home address is set.
  function directionsButton(r) {
    if (state.home) return button("route-btn", "Show directions", function () { showDirections(r); });
    var btn = button("route-btn", "Show directions");
    btn.disabled = true;
    btn.title = "Enter your home address under \"Distance from home\" first";
    return btn;
  }

  // Hint under the disabled directions button, or null once a home address is set.
  function directionsHint() {
    return state.home ? null : el("p", "route-hint", "Enter your home address under “Distance from home” to see directions.");
  }

  // Full details of a resort, shown when its row or pin is clicked.
  function popupFor(r) {
    var pills = append(el("div", "pills"),
      statusPill(r),
      typeTag(r),
      r.isNew ? firePill(r) : null,
      r.lastDays ? lastDaysPill(r) : null);
    return append(el("div", "popup"),
      el("h3", null, r.name),
      pills,
      seasonBanner(r),
      factList(r),
      directionsButton(r),
      directionsHint());
  }
  // #endregion

  // #region Sidebar controls
  var typeButtons = {};     // lift type -> its chip
  var statusButtons = {};   // "all" or status -> its chip
  var allTypesButton;       // "Show all" / "Showing all" chip

  // Lift type chips (toggle each type) plus a "Show all" chip.
  function buildTypeChips() {
    TYPE_KEYS.forEach(function (type) {
      var btn = button("chip", null, function () {
        if (state.types.has(type)) state.types.delete(type); else state.types.add(type);
        render();
      });
      var count = countWhere(function (r) { return r.type === type; });
      append(btn, liftBadge(type), document.createTextNode(TYPE_LABEL[type] + " "), el("small", null, "(" + count + ")"));
      typeButtons[type] = btn;
      dom.typeChips.appendChild(btn);
    });
    // "Show all" switches every type on; pressed again it goes back to the default selection.
    allTypesButton = button("chip chip-all", "Show all", function () {
      var allOn = state.types.size === TYPE_KEYS.length;
      state.types = new Set(allOn ? DEFAULT_TYPES : TYPE_KEYS);
      render();
    });
    dom.typeChips.appendChild(allTypesButton);
  }

  // Season status chips: All, Season open, In preparation, Season ended (counts filled in by render).
  function buildStatusChips() {
    ["all"].concat(STATUS_KEYS).forEach(function (key) {
      var btn = button("chip chip-status", null, function () { state.status = key; render(); });
      append(btn,
        key !== "all" ? el("i", "dot " + key) : null,
        el("span", null, key === "all" ? "All" : STATUS[key]),
        el("small"));
      statusButtons[key] = btn;
      dom.statusChips.appendChild(btn);
    });
  }

  // Valley dropdown with every valley in data order.
  function buildValleySelect() {
    var valleys = [];
    resorts.forEach(function (r) { if (valleys.indexOf(r.valley) < 0) valleys.push(r.valley); });
    dom.valley.appendChild(new Option("All valleys", "all"));
    valleys.forEach(function (v) { dom.valley.appendChild(new Option(v, v)); });
    dom.valley.addEventListener("change", function () {
      state.valley = dom.valley.value;
      render();
      fitToVisible();
    });
  }

  // Filters the list as the user types (accents and case are ignored).
  function bindSearch() {
    dom.search.addEventListener("input", function () {
      state.search = normalize(dom.search.value.trim());
      render();
    });
  }

  // Updates the pressed state and counts of every chip.
  function updateControls() {
    TYPE_KEYS.forEach(function (type) {
      typeButtons[type].setAttribute("aria-pressed", String(state.types.has(type)));
    });
    var allOn = state.types.size === TYPE_KEYS.length;
    allTypesButton.setAttribute("aria-pressed", String(allOn));
    allTypesButton.textContent = allOn ? "Showing all" : "Show all";

    Object.keys(statusButtons).forEach(function (key) {
      var n = key === "all" ? resorts.length : countWhere(hasStatus(key));
      statusButtons[key].setAttribute("aria-pressed", String(state.status === key));
      statusButtons[key].lastChild.textContent = " (" + n + ")";
    });
  }
  // #endregion

  // #region Resort list and highlights
  // The one timer shown in a list row: opening countdown, time to slope, or lift start / running.
  function rowTimer(r) {
    var slope = timeToSlope(r);
    if (r.status === "prep") return timerChip("opens", r.startEstimated ? "Opens in about" : "Opens in", fmtCountdown(r.opensIn));
    if (slope != null) return timerChip("slope", "On the slope in", fmtCountdown(slope));
    if (r.lift && r.lift.state === "before") return timerChip("lift", "Lifts start in", fmtCountdown(r.lift.wait));
    if (r.lift && r.lift.state === "running") return timerChip("running", "Lifts running until", r.close);
    return null;
  }

  // Distance on the right of a row: "54 km" over "1 h 5 min drive" (or "straight-line").
  function distanceLabel(d) {
    if (!d) return null;
    var label = el("span", "dist", formatDistance(d));
    return append(label, el("small", null, d.minutes != null ? formatDuration(d.minutes) + " drive" : "straight-line"));
  }

  // Compact list row: badge, name, status labels and one timer. Everything else is in the details.
  function resortRow(r) {
    var badge = liftBadge(r.type);
    badge.title = TYPE_LABEL[r.type];

    var labels = append(el("div", "row-status"),
      statusPill(r),
      r.isNew ? firePill(r) : null,
      r.lastDays ? lastDaysPill(r) : null,
      rowTimer(r),
      parkingLabel(r, true));
    var body = append(el("span", "body"), el("div", "name", r.name), labels);

    var btn = button("resort", null, function () { focusResort(r); });
    btn.title = "Show details";
    if (r.isNew) btn.classList.add("is-new");
    append(btn, badge, body, distanceLabel(distanceTo(r)));
    return append(document.createElement("li"), btn);
  }

  // Highlight card with a small uppercase title.
  function highlightCard(cls, title) { return append(el("div", "card " + cls), el("div", "card-title", title)); }

  // Clickable resort line inside a highlight card.
  function resortLink(r, extra) {
    var btn = button("card-resort", null, function () { focusResort(r); });
    return append(btn, el("span", "card-name", r.name), extra ? el("span", "card-extra", extra) : null);
  }

  // "Resort of the day" and "Next opening" cards.
  function renderHighlights() {
    dom.highlights.textContent = "";
    var pick = resortOfTheDay();
    append(dom.highlights, append(highlightCard("pick", "Resort of the day"),
      resortLink(pick, pick.valley + " · " + STATUS[pick.status])));

    var next = nextOpening();
    if (!next) return;
    var card = highlightCard("next", "Next opening · " + fmtDate(next.dateMs));
    next.resorts.forEach(function (r) {
      card.appendChild(resortLink(r, "in " + fmtCountdown(r.opensIn) + (r.startEstimated ? " (expected)" : "")));
    });
    dom.highlights.appendChild(card);
  }

  // Rebuilds the resort list, nearest first once distances are known.
  function renderList(list) {
    dom.list.textContent = "";
    dom.count.textContent = list.length + " of " + resorts.length + (state.distances ? " · nearest first" : "");
    if (!list.length) {
      dom.list.appendChild(el("li", "empty", "No resorts match the current filters and search."));
      return;
    }
    list.forEach(function (r) { dom.list.appendChild(resortRow(r)); });
  }
  // #endregion

  // #region Render
  // True when a resort passes every filter and the search.
  function matches(r) {
    return state.types.has(r.type) &&
      (state.status === "all" || r.status === state.status) &&
      (state.valley === "all" || r.valley === state.valley) &&
      (!state.search || r.searchName.indexOf(state.search) >= 0);
  }

  // Resorts that pass the filters, sorted by distance once a home address is set.
  function visibleResorts() {
    var list = resorts.filter(matches);
    if (state.distances) list.sort(function (a, b) { return state.distances[a.id].km - state.distances[b.id].km; });
    return list;
  }

  // Recalculates statuses and redraws the clock, chips, highlights, pins and list.
  function render() {
    refreshStatus();
    dom.clock.textContent = placeName() + " · " + fmtDate(state.now) + " · " + fmtClock(state.now);
    updateControls();
    renderHighlights();

    var list = visibleResorts();
    var visible = {};
    list.forEach(function (r) { visible[r.id] = true; });
    syncMarkers(visible);
    if (route.resortId != null && !visible[route.resortId]) clearRoute();   // its resort was filtered out
    renderList(list);
  }

  // The clock shows the home town once an address is set, otherwise Innsbruck.
  function placeName() {
    if (!state.home) return "Innsbruck";
    return state.home.city || (state.home.label || "").split(",")[0].trim() || "Innsbruck";
  }
  // #endregion

  // #region Welcome screen
  // Text and resorts for the welcome screen: today's season openings, otherwise the next opening.
  function welcomeContent() {
    var today = dayStart(state.now);
    var openedToday = resortsWhere(function (r) { return r.startMs === today; });
    if (openedToday.length) {
      return {
        kicker: "Today",
        title: "Season opening today!",
        sub: openedToday.length === 1
          ? "One resort starts its season today, " + fmtDate(today) + "."
          : openedToday.length + " resorts start their season today, " + fmtDate(today) + ".",
        countLabel: "First lift starts in",
        liveText: "The lifts are running. Go!",
        target: earliest(openedToday.filter(function (r) { return r.openMs != null; }),
          function (r) { return today + r.openMs; }),
        entries: openedToday.map(function (r) {
          var bits = [r.valley];
          if (hoursText(r)) bits.push("lifts " + hoursText(r));
          if (r.startEstimated) bits.push("expected date");
          return { r: r, text: bits.join(" · ") };
        })
      };
    }
    var next = nextOpening();
    if (!next) return null;
    return {
      kicker: "Coming up",
      title: "Next opening",
      sub: "No resort opens today, but the next season start is close: " + fmtDate(next.dateMs) + ". Get your gear ready!",
      countLabel: "Countdown to the first lift",
      liveText: "Opening now!",
      target: earliest(next.resorts, function (r) { return r.startMs + (r.openMs || 0); }),
      entries: next.resorts.map(function (r) {
        return { r: r, text: r.valley + " · in " + fmtCountdown(r.opensIn) + (r.startEstimated ? " (expected)" : "") };
      })
    };
  }

  // Smallest value of fn over a list, or null for an empty list.
  function earliest(list, fn) {
    return list.reduce(function (min, item) { var t = fn(item); return min == null || t < min ? t : min; }, null);
  }

  // Clickable resort card in the welcome list; closes the dialog and opens the resort.
  function welcomeEntry(entry, dialog) {
    var body = append(el("span"), el("strong", null, entry.r.name), el("small", null, entry.text));
    var btn = button("welcome-resort", null, function () { dialog.close(); focusResort(entry.r); });
    return append(document.createElement("li"), append(btn, liftBadge(entry.r.type), body));
  }

  // Live days / hours / minutes / seconds tiles; returns the interval id so it can be stopped.
  function startWelcomeCountdown(box, content) {
    box.textContent = "";
    if (content.target == null) return null;
    var tiles = el("div", "countdown-tiles");
    var nums = ["days", "hours", "minutes", "seconds"].map(function (unit) {
      var num = el("b");
      append(tiles, append(el("div", "tile " + unit), num, el("span", null, unit)));
      return num;
    });
    append(box, el("div", "countdown-label", content.countLabel), tiles);

    var timer = null;
    var tick = function () {
      var left = Math.floor((content.target - viennaNow()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        box.textContent = "";
        box.appendChild(el("div", "count-live", content.liveText));
        return;
      }
      nums[0].textContent = Math.floor(left / 86400);
      nums[1].textContent = pad(Math.floor((left % 86400) / 3600));
      nums[2].textContent = pad(Math.floor((left % 3600) / 60));
      nums[3].textContent = pad(left % 60);
    };
    tick();
    timer = setInterval(tick, 1000);
    return timer;
  }

  // Shows the welcome dialog once per day (until it is closed that day).
  function showWelcome() {
    var dialog = byId("welcome");
    if (!dialog.showModal) return;
    var todayKey = isoDay(state.now);
    if (storageGet(STORE_WELCOME) === todayKey) return;
    var content = welcomeContent();
    if (!content) return;

    byId("welcome-kicker").textContent = content.kicker;
    byId("welcome-title").textContent = content.title;
    byId("welcome-sub").textContent = content.sub;
    var list = byId("welcome-list");
    list.textContent = "";
    content.entries.forEach(function (entry) { list.appendChild(welcomeEntry(entry, dialog)); });

    var closeBtn = byId("welcome-close");
    closeBtn.onclick = function () { dialog.close(); };
    var timer = startWelcomeCountdown(byId("welcome-countdown"), content);
    dialog.addEventListener("close", function () {
      storageSet(STORE_WELCOME, todayKey);
      clearInterval(timer);
    }, { once: true });

    // Respect reduced motion for the SVG animations (gondolas) too.
    var scene = byId("welcome-scene");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && scene.pauseAnimations) scene.pauseAnimations();

    dialog.showModal();
    closeBtn.focus();
  }
  // #endregion

  // #region Home address and driving distances
  // Status line under the address form; red when it reports an error.
  function setStatus(text, isError) {
    dom.homeStatus.textContent = text;
    dom.homeStatus.classList.toggle("error", !!isError);
  }

  // Fetches JSON; a non-OK response becomes an Error "<failMessage> (<status>)".
  function fetchJson(url, failMessage, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error(failMessage + " (" + res.status + ")");
      return res.json();
    });
  }

  // Straight-line distance in km between two points (used when no road route is known).
  function haversineKm(aLat, aLon, bLat, bLon) {
    var rad = Math.PI / 180;
    var dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  // Looks up an address with Nominatim; resolves to { lat, lon, label, query, city }.
  function geocode(query) {
    return fetchJson(GEOCODE_URL + encodeURIComponent(query), "Address lookup failed", { headers: { Accept: "application/json" } })
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
    var coords = [lonLat(home)].concat(resorts.map(lonLat)).join(";");
    return fetchJson(TABLE_URL + coords + "?sources=0&annotations=distance,duration", "Routing failed")
      .then(function (data) {
        if (data.code !== "Ok") throw new Error("Routing failed (" + data.code + ")");
        return { meters: data.distances[0].slice(1), seconds: data.durations[0].slice(1) };
      });
  }

  // Road distance from the routing table, or a straight-line estimate when there is no road route.
  function distanceFor(home, r, i, table) {
    var meters = table && table.meters[i];
    if (meters != null) return { km: meters / 1000, minutes: table.seconds[i] / 60, approx: false };
    return { km: haversineKm(home.lat, home.lon, r.lat, r.lon), minutes: null, approx: true };
  }

  // Places (or moves) the home pin with a small popup showing the full address.
  function placeHomeMarker(home) {
    if (homeMarker) homeMarker.remove();
    homeMarker = L.marker([home.lat, home.lon], {
      icon: pinIcon("home", ICON.home), title: "Home", zIndexOffset: 1000
    }).addTo(map).bindPopup(function () {
      return append(el("div", "popup"), el("h3", null, "Home"), el("p", null, home.label));
    });
  }

  // Stores the new home and its distances, then redraws; returns how many are straight-line estimates.
  function applyDistances(home, table) {
    var distances = {}, approxCount = 0;
    resorts.forEach(function (r, i) {
      distances[r.id] = distanceFor(home, r, i, table);
      if (distances[r.id].approx) approxCount++;
    });
    state.home = home;
    state.distances = distances;

    map.closePopup();   // the old details and route no longer apply to the new home
    clearRoute();
    placeHomeMarker(home);
    dom.homeClear.hidden = false;
    render();
    return approxCount;
  }

  // Calculates driving distances from a known home position and remembers it in this browser.
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
    ).then(function () { storageSet(STORE_HOME, JSON.stringify(home)); });
  }

  // "Calculate": look up the typed address, then calculate distances from it.
  function onHomeSubmit(ev) {
    ev.preventDefault();
    var query = dom.homeInput.value.trim();
    if (!query) return;
    dom.homeSubmit.disabled = true;
    setStatus("Looking up address…");
    geocode(query)
      .then(calculateFrom)
      .catch(function (err) {
        var offline = !err || !err.message || /Failed to fetch|NetworkError/i.test(err.message);
        setStatus(offline ? "Could not reach the address lookup service. Check your connection and try again." : err.message, true);
      })
      .then(function () { dom.homeSubmit.disabled = false; });
  }

  // "Clear": forget the home address, its pin, route and distances.
  function onHomeClear() {
    state.home = null;
    state.distances = null;
    if (homeMarker) { homeMarker.remove(); homeMarker = null; }
    clearRoute();
    storageRemove(STORE_HOME);
    dom.homeInput.value = "";
    dom.homeClear.hidden = true;
    setStatus("");
    render();
  }

  // Restores the home address saved in this browser, if any.
  function restoreHome() {
    var saved = null;
    try { saved = JSON.parse(storageGet(STORE_HOME) || "null"); } catch (e) { /* corrupt entry: ignore */ }
    if (saved && typeof saved.lat === "number" && typeof saved.lon === "number") {
      dom.homeInput.value = saved.query || "";
      calculateFrom(saved);
    }
  }
  // #endregion

  // #region Local storage
  // Storage can be unavailable (private mode, blocked site data), so every access is guarded.
  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } }
  function storageRemove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  // #endregion

  // #region Start-up
  refreshStatus();
  createMarkers();
  buildTypeChips();
  buildStatusChips();
  buildValleySelect();
  bindSearch();
  dom.homeForm.addEventListener("submit", onHomeSubmit);
  dom.homeClear.addEventListener("click", onHomeClear);

  render();
  map.fitBounds(resorts.map(function (r) { return [r.lat, r.lon]; }), { padding: [30, 30] });
  showWelcome();
  restoreHome();

  // Keep statuses, timers and countdowns current.
  setInterval(render, REFRESH_MS);
  // #endregion
})();
