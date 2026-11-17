/* West Tirol Ski Resorts — app logic.
   Plain browser script (no build step): needs Leaflet (global L) and resorts.js (window.RESORTS) loaded first.
   Regions run top to bottom: settings, icons, time, text formatting, resort data, app state, season logic,
   weather, network, DOM helpers, labels, clipboard, map and pins, resort details, directions, details content,
   sidebar controls, resort list, render, welcome screen, home address, storage and start-up. */
(function () {
  "use strict";

  // The map library comes from a CDN: without it (offline, blocked) explain instead of failing silently.
  if (typeof window.L === "undefined" || !Array.isArray(window.RESORTS)) {
    const mapEl = document.getElementById("map");
    mapEl.classList.add("map-error");
    mapEl.textContent = "The map could not be loaded. Check your connection and reload the page.";
    return;
  }

  // #region Settings
  // Milliseconds per second, minute, hour and day.
  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  // Durations in the day plan, in minutes.
  const PREP_MIN = 60;        // getting ready at home before driving
  const GEAR_MIN = 10;        // gearing up at the resort (boots, skis) before the lift
  const LIFT_MIN = 15;        // ski lift ride up to the slope
  const SLEEP_MIN = 8 * 60;   // a full night's sleep before a ski day
  const TOMORROW_MIN = 60;    // from this long before a resort's lift closing, plan the ski day for tomorrow

  // Badge thresholds, in days.
  const LAST_DAYS = 7;        // "Last days" badge: days before the season end
  const NEW_DAYS = 7;         // "Recently opened" badge: days since the season start

  // How often statuses, timers and countdowns are recalculated, and the weather forecast fetched again.
  const REFRESH_MS = 30 * SEC;
  const WEATHER_REFRESH_MS = 30 * MIN;
  // How long a request to an external service may take before it counts as failed.
  const FETCH_TIMEOUT_MS = 20 * SEC;

  // Weather thresholds: snowfall that counts as fresh snow, and the UV index that gets a warning.
  const FRESH_SNOW_CM = 1;
  const UV_HIGH = 6;

  // Parking price levels in euros per day: up to LOW is shaded yellow, up to MID orange, above that red.
  const PARKING_LOW = 5;
  const PARKING_MID = 7;

  // Map: the closest zoom when flying to a resort or framing the filtered pins, the closest zoom when
  // framing a route, how close to the details panel a clicked pin may sit before the map pans, and how
  // far apart (in degrees of longitude) resorts that share coordinates are drawn.
  const FOCUS_ZOOM = 13;
  const ROUTE_MAX_ZOOM = 14;
  const PIN_MARGIN_PX = 40;
  const PIN_SPREAD_DEG = 0.0012;

  // Lift types in chip order, their labels, and the types selected on first load.
  const TYPE_KEYS = ["gondola", "chairlift", "tbar"];
  const TYPE_LABEL = { gondola: "Gondola", chairlift: "Chairlift", tbar: "T-bar" };
  const DEFAULT_TYPES = ["gondola"];

  // Season status keys and their labels.
  const STATUS_KEYS = ["open", "prep", "ended"];
  const STATUS_LABEL = { open: "Season open", prep: "In preparation", ended: "Season ended" };

  // External services: OpenStreetMap tiles, Nominatim address search, OSRM routing, Google Maps directions.
  // Every host the page loads or fetches from must also be allowed by the Content-Security-Policy in index.html.
  const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const GEOCODE_URL = "https://nominatim.openstreetmap.org/search";
  const ROUTE_URL = "https://router.project-osrm.org/route/v1/driving/";
  const TABLE_URL = "https://router.project-osrm.org/table/v1/driving/";
  const GMAPS_DIR_URL = "https://www.google.com/maps/dir/";

  // Open-Meteo forecast (free, no key; CC BY 4.0, credited in the weather card). One request covers
  // every resort: current temperature, plus today and tomorrow (high, low, code, snowfall, UV).
  const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
  const WEATHER_PARAMS = {
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,uv_index_max",
    timezone: "Europe/Vienna",
    forecast_days: "2"
  };
  const WEATHER_CREDIT_URL = "https://open-meteo.com/";

  // Keys used in this browser's local storage.
  const STORE_HOME = "westirol.home";         // the saved home address
  const STORE_WELCOME = "westirol.welcome";   // the day the welcome screen was last closed
  // #endregion

  // #region Icons
  // Line icons share one style: a 24x24 box stroked in the current text color. Icons are decorative
  // (always next to a text label or inside a labelled element), so screen readers skip them.
  const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  // Wraps SVG shapes in the shared line-icon frame.
  function lineIcon(shapes) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" ${STROKE}>${shapes}</svg>`;
  }

  // The cable drawn above every lift icon.
  const CABLE = '<path d="M3 5.5 21 2.5"/>';

  // Icon markup by name. Only constant, trusted SVG strings belong here: they are inserted with innerHTML.
  const ICON = {
    // Lift types and the home pin.
    gondola: lineIcon(CABLE + '<path d="M12 4v4"/><rect x="5.5" y="8" width="13" height="12" rx="3.5"/>' +
      '<path d="M5.5 14h13M12 8v6"/>'),
    chairlift: lineIcon(CABLE + '<path d="M12 4v6"/><path d="M7 10h10"/><path d="M7 10v6h10v-6"/>' +
      '<path d="M9 16v4h6"/>'),
    tbar: lineIcon(CABLE + '<path d="M12 4v14"/><path d="M5.5 18h13"/>'),
    home: lineIcon('<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),

    // Season status: skier = open, snow groomer = in preparation, waving hand = ended.
    skier: lineIcon('<circle cx="15.5" cy="4.5" r="2" fill="currentColor" stroke="none"/>' +
      '<path d="M14 8.5 9.5 13l4.5 2.5-1.5 3.5"/><path d="M12.5 10l4 2 2.5-1.5"/><path d="M4 17l16.5 4.5"/>'),
    groomer: lineIcon('<rect x="3" y="15" width="15" height="5" rx="2.5"/>' +
      '<path d="M4.5 15v-3.5h10l2.5 3.5"/><path d="M6.5 11.5V7h5l2 4.5"/><path d="M18 17.5h2.5"/>' +
      '<path d="M20.5 12.5 22 20"/>'),
    wave: lineIcon('<g transform="rotate(-14 12 12)">' +
      '<path d="M8.5 12.5V6.5a1.4 1.4 0 0 1 2.8 0V11"/><path d="M11.3 10.5V4.8a1.4 1.4 0 0 1 2.8 0v5.7"/>' +
      '<path d="M14.1 10.5V6.2a1.4 1.4 0 0 1 2.8 0V15a5.5 5.5 0 0 1-5.5 5.5h-.4a5.5 5.5 0 0 1-4.3-2' +
      'l-3-3.7a1.4 1.4 0 0 1 2.1-1.8l2.7 2.5"/></g>' +
      '<path d="M19.5 3a4 4 0 0 1 2.5 3"/><path d="M2 8.5A4 4 0 0 1 4 5.5"/>'),

    // "Try tomorrow!" banner: sun rising over the horizon.
    sunrise: lineIcon('<path d="M3 18h18"/><path d="M7 18a5 5 0 0 1 10 0"/>' +
      '<path d="M12 7v3M5.6 10.6l1.8 1.8M18.4 10.6l-1.8 1.8M2.5 14.5h2M19.5 14.5h2"/>'),

    // Weather: sun, snow cloud, cloud.
    sunny: lineIcon('<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5' +
      'M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
    snowy: lineIcon('<path d="M7 15.5a4.5 4.5 0 1 1 1.3-8.8A5.5 5.5 0 0 1 18.8 9a3.3 3.3 0 0 1-.3 6.5z"/>' +
      '<path d="M8 19.5h.01M12 18.5h.01M16 19.5h.01M10 22h.01M14 22h.01" stroke-width="2.6"/>'),
    cloudy: lineIcon('<path d="M7 18.5a4.5 4.5 0 1 1 1.3-8.8A5.5 5.5 0 0 1 18.8 12a3.3 3.3 0 0 1-.3 6.5z"/>'),

    // Day plan: bed, alarm clock, car.
    bed: lineIcon('<path d="M2.5 19V6"/><path d="M2.5 15h19v4"/>' +
      '<path d="M21.5 15v-2.5a3 3 0 0 0-3-3H10V15"/><circle cx="6.3" cy="11.5" r="2"/>'),
    alarm: lineIcon('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2"/>' +
      '<path d="M5 3.5 2.5 6M19 3.5 21.5 6"/><path d="M7 20l-1.5 2M17 20l1.5 2"/>'),
    car: lineIcon('<path d="M3.5 16.5v-4.5l2.3-5h12.4l2.3 5v4.5z"/><path d="M3.5 12h17"/>' +
      '<circle cx="7.5" cy="16.5" r="2" fill="currentColor"/><circle cx="16.5" cy="16.5" r="2" fill="currentColor"/>'),

    // Copy-to-clipboard button.
    copy: lineIcon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),

    // Two-tone flame for "Recently opened" (filled, not a line icon).
    flame: '<svg class="flame" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="#fff3c4" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-2.5 1-4.5 2.5-6' +
      ' .3 1.8 1 3 2 3.5C10 8 10.5 4.5 12 2z"/>' +
      '<path fill="#ff9a1f" d="M12 12c1 1.5 2.5 2.5 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.2.8-2.3 2.5-4.5z"/></svg>'
  };

  // Icon shown in each season status pill.
  const STATUS_ICON = { open: ICON.skier, prep: ICON.groomer, ended: ICON.wave };

  // Icon shown in each kind of hero banner.
  const HERO_ICON = {
    slope: ICON.skier,
    opens: ICON.groomer,
    ended: ICON.wave,
    night: ICON.bed,
    tomorrow: ICON.sunrise
  };
  // #endregion

  // #region Time (Vienna wall clock)
  // All times are Vienna wall-clock values stored as "naive" milliseconds (the wall-clock
  // fields fed through Date.UTC), so date maths needs no time-zone handling.
  const viennaFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  // The real Vienna wall-clock time right now.
  function viennaReal() {
    const parts = {};
    for (const part of viennaFormat.formatToParts(new Date())) {
      parts[part.type] = Number(part.value);
    }
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }

  // Testing aid: index.html?now=2026-12-19T07:30 pretends it is that Vienna time.
  function testClockOffset() {
    const param = new URLSearchParams(location.search).get("now") || "";
    const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(param);
    if (!match) {
      return 0;
    }
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    return Date.UTC(year, month - 1, day, hour, minute) - viennaReal();
  }

  const clockOffset = testClockOffset();

  // The app's "now": real Vienna time plus the optional test offset.
  function viennaNow() {
    return viennaReal() + clockOffset;
  }

  // "2026-12-19" -> midnight of that day.
  function dateMs(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  }

  // "08:30" -> milliseconds after midnight.
  function timeMs(hhmm) {
    const [hours, minutes] = hhmm.split(":").map(Number);
    return hours * HOUR + minutes * MIN;
  }

  // Midnight of the day that contains ms.
  function dayStart(ms) {
    return Math.floor(ms / DAY) * DAY;
  }

  // "2026-12-19" for any time on that day; a once-per-day key, and the key of a forecast day.
  function isoDay(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  // #endregion

  // #region Text formatting
  // 7 -> "07".
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // "19.12.2026".
  function formatDate(ms) {
    const d = new Date(ms);
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  }

  // "07:30".
  function formatClock(ms) {
    const d = new Date(ms);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }

  // "today", "tomorrow", or the date ("19.12.2026") of the day that contains ms.
  function relativeDay(ms) {
    const days = Math.round((dayStart(ms) - dayStart(state.now)) / DAY);
    if (days === 0) {
      return "today";
    }
    if (days === 1) {
      return "tomorrow";
    }
    return formatDate(ms);
  }

  // Splits a duration into two { value, unit } parts: days + hours from 24 hours up, otherwise hours + minutes.
  function countdownParts(ms) {
    const totalMin = Math.max(0, Math.ceil(ms / MIN));
    const minPerDay = DAY / MIN;
    if (totalMin >= minPerDay) {
      return [
        { value: Math.floor(totalMin / minPerDay), unit: "days" },
        { value: Math.floor((totalMin % minPerDay) / 60), unit: "hours" }
      ];
    }
    return [
      { value: Math.floor(totalMin / 60), unit: "hours" },
      { value: pad(totalMin % 60), unit: "min" }
    ];
  }

  // Compact countdown: "3d 4h" or "9h 05m".
  function formatCountdown(ms) {
    const [big, small] = countdownParts(ms);
    if (big.unit === "days") {
      return `${big.value}d ${small.value}h`;
    }
    return `${big.value}h ${small.value}m`;
  }

  // "≈ 12 km" (straight-line) or "4.4 km" (by road).
  function formatDistance(d) {
    const km = d.km < 10 ? d.km.toFixed(1) : Math.round(d.km);
    return `${d.approx ? "≈ " : ""}${km} km`;
  }

  // "45 min", "1 h", "1 h 5 min".
  function formatDuration(min) {
    const total = Math.round(min);
    if (total < 60) {
      return `${total} min`;
    }
    const rest = total % 60;
    return `${Math.floor(total / 60)} h${rest ? ` ${rest} min` : ""}`;
  }

  // "-3°", or "–" when unknown.
  function formatTemp(t) {
    return t == null ? "–" : `${Math.round(t)}°`;
  }

  // "08:30–16:00", or null when the lift hours are unknown.
  function hoursText(r) {
    return r.open ? `${r.open}–${r.close}` : null;
  }
  // #endregion

  // #region Resort data
  // A resort is its entry from resorts.js plus derived fields:
  //   id                          index in window.RESORTS
  //   startMs, endMs              season start / end (midnight); from SEASON_DEFAULTS when unknown
  //   startEstimated, endEstimated  true when that date came from SEASON_DEFAULTS
  //   openMs, closeMs             lift hours as milliseconds after midnight, or null when unknown
  //   searchName                  normalized name for the search box
  //   pinLat, pinLon              map pin position (nudged apart when resorts share coordinates)
  // recalculated by refreshStatus() on every render:
  //   status                      "open", "prep" or "ended"
  //   opensIn                     ms until the first lift of the season (in preparation only)
  //   lift                        today's lift timer (see liftTimer), or null
  //   lastDays                    days left when the known season end is near, or null
  //   isNew, openedToday          opened in the last NEW_DAYS days / today (real start dates only)
  //   opensTomorrow, opensWeekend season starts tomorrow / this weekend (real start dates only)
  //   weather                     the forecast that matters right now (see weatherFor), or null
  // and the map pin (marker, drawnPin), attached by createMarkers().

  // Season dates used for calculations (never displayed) when a resort's date is unknown.
  const DEFAULTS = window.SEASON_DEFAULTS;

  // Lower-case name without accents, so "solden" finds "Sölden".
  function normalize(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // Adds parsed season dates, lift times and a search key to a raw entry from resorts.js.
  function prepareResort(raw, id) {
    if (!TYPE_LABEL[raw.type]) {
      console.warn(`resorts.js: unknown lift type "${raw.type}" for ${raw.name}`);
    }
    return {
      id,
      ...raw,
      startMs: dateMs(raw.seasonStart || DEFAULTS.start),
      endMs: dateMs(raw.seasonEnd || DEFAULTS.end),
      startEstimated: !raw.seasonStart,
      endEstimated: !raw.seasonEnd,
      openMs: raw.open ? timeMs(raw.open) : null,
      closeMs: raw.close ? timeMs(raw.close) : null,
      searchName: normalize(raw.name)
    };
  }

  // Resorts sharing identical coordinates get nudged apart so every map pin stays clickable.
  function spreadDuplicatePins(list) {
    const seen = new Map();
    for (const r of list) {
      const key = `${r.lat},${r.lon}`;
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      r.pinLat = r.lat;
      r.pinLon = r.lon + n * PIN_SPREAD_DEG;
    }
  }

  const resorts = window.RESORTS.map(prepareResort);
  spreadDuplicatePins(resorts);

  // Resorts that pass a test.
  function resortsWhere(test) {
    return resorts.filter(test);
  }

  // Number of resorts that pass a test.
  function countWhere(test) {
    return resorts.reduce((n, r) => (test(r) ? n + 1 : n), 0);
  }

  // Test for "has this season status".
  function hasStatus(status) {
    return (r) => r.status === status;
  }
  // #endregion

  // #region App state
  // Everything the page shows is derived from this object and the resort list.
  const state = {
    now: viennaNow(),
    types: new Set(DEFAULT_TYPES),   // lift types switched on
    status: "all",                   // season status filter
    opening: null,                   // season opening filter: null, "today", "tomorrow" or "weekend"
    wxFilter: null,                  // weather filter: null, "sunny" or "powder"
    valley: "all",                   // valley filter
    search: "",                      // normalized search text
    home: null,                      // { lat, lon, label, query, city }
    distances: null,                 // resort id -> { km, minutes, approx }
    weather: null                    // resort id -> forecast from Open-Meteo (see parseWeather)
  };

  // Distance and drive time from home to a resort, or null without a home address.
  function distanceTo(r) {
    return state.distances ? state.distances[r.id] : null;
  }
  // #endregion

  // #region Season status and timers
  // Recalculates every resort's season status, badges, lift timer and weather for the current time.
  function refreshStatus() {
    const now = viennaNow();
    const today = dayStart(now);
    const weekend = weekendOf(today);
    state.now = now;

    for (const r of resorts) {
      r.opensIn = null;
      r.lift = null;
      r.lastDays = null;
      r.isNew = false;
      r.openedToday = false;
      r.opensTomorrow = false;
      // Season start (real date) on the Friday, Saturday or Sunday of this week, today or later.
      r.opensWeekend = !r.startEstimated && r.startMs >= Math.max(today, weekend.fri) && r.startMs <= weekend.sun;

      if (today < r.startMs) {
        r.status = "prep";
        r.opensIn = r.startMs + (r.openMs || 0) - now;                      // until the first lifts start
        r.opensTomorrow = !r.startEstimated && r.startMs === today + DAY;   // real start date only
      } else if (today > r.endMs) {
        r.status = "ended";
      } else {
        r.status = "open";
        r.isNew = !r.startEstimated && today - r.startMs < NEW_DAYS * DAY;   // real start date only
        r.openedToday = r.isNew && today === r.startMs;
        r.lift = liftTimer(r, now, today);
        r.lastDays = lastDaysLeft(r, now);
      }
      r.weather = weatherFor(r);
    }
  }

  // Friday and Sunday (midnight) of the Monday-to-Sunday week that contains the given day.
  function weekendOf(day) {
    const daysSinceMonday = (new Date(day).getUTCDay() + 6) % 7;
    const monday = day - daysSinceMonday * DAY;
    return { fri: monday + 4 * DAY, sun: monday + 6 * DAY };
  }

  // Today's lift state while the season is open: waiting to start, running, or done for the season.
  function liftTimer(r, now, today) {
    if (r.openMs == null) {
      return null;
    }
    const timeOfDay = now - today;
    if (timeOfDay < r.openMs) {
      return { state: "before", wait: r.openMs - timeOfDay };
    }
    if (timeOfDay < r.closeMs) {
      return { state: "running" };
    }
    if (today + DAY <= r.endMs) {
      return { state: "before", wait: DAY - timeOfDay + r.openMs };   // tomorrow's first lift
    }
    return { state: "done" };
  }

  // Days left in the season when the (known) end is less than LAST_DAYS away, otherwise null.
  function lastDaysLeft(r, now) {
    const left = r.endMs + DAY - now;
    if (r.endEstimated || left >= LAST_DAYS * DAY) {
      return null;
    }
    return Math.max(1, Math.ceil(left / DAY));
  }

  // True from TOMORROW_MIN before the resort's lift closing until midnight.
  function isLateToday(r) {
    return r.closeMs != null && state.now - dayStart(state.now) >= r.closeMs - TOMORROW_MIN * MIN;
  }

  // True while the season (by its known or estimated end) still runs tomorrow.
  function seasonRunsTomorrow(r) {
    return dayStart(state.now) + DAY <= r.endMs;
  }

  // "Try tomorrow" mode, per resort: from TOMORROW_MIN before its lift closing until midnight,
  // as long as the season is still on tomorrow. The day plan then targets tomorrow.
  function tryTomorrow(r) {
    return r.status === "open" && isLateToday(r) && seasonRunsTomorrow(r);
  }

  // Time until on the slope: the later of (now + prepare + drive + gear up) and lift opening,
  // plus the lift ride. If today's lifts close before then, the next day counts.
  function timeToSlope(r) {
    const d = distanceTo(r);
    if (r.status !== "open" || r.openMs == null || !d || d.minutes == null) {
      return null;
    }
    const now = state.now;
    const ready = now + (PREP_MIN + d.minutes + GEAR_MIN) * MIN;
    const firstDay = dayStart(now) + (tryTomorrow(r) ? DAY : 0);
    // A few days ahead at most, and never past the season end.
    for (let i = 0, day = firstDay; i < 4 && day <= r.endMs; i++, day += DAY) {
      if (ready < day + r.closeMs) {
        return Math.max(ready, day + r.openMs) + LIFT_MIN * MIN - now;
      }
    }
    return null;
  }

  // The day plan, worked back from the moment on the slope:
  // go to bed -> sleep -> wake up -> get ready -> start driving -> drive -> gear up -> lift -> on the slope.
  // Bedtime and wake-up are only part of it in "try tomorrow" mode, for a ski day tomorrow.
  function tripPlan(r) {
    const slopeIn = timeToSlope(r);
    if (slopeIn == null) {
      return null;
    }
    const drive = Math.round(distanceTo(r).minutes);   // whole minutes, as displayed
    const plan = { slopeIn, slopeAt: state.now + slopeIn, drive };
    plan.driveAt = plan.slopeAt - (LIFT_MIN + GEAR_MIN + drive) * MIN;
    if (tryTomorrow(r) && dayStart(plan.slopeAt) === dayStart(state.now) + DAY) {
      plan.wakeAt = plan.driveAt - PREP_MIN * MIN;
      plan.bedAt = plan.wakeAt - SLEEP_MIN * MIN;
    }
    return plan;
  }

  // The earliest upcoming season start and every resort opening on that day, or null.
  function nextOpening() {
    const prep = resortsWhere(hasStatus("prep"));
    if (!prep.length) {
      return null;
    }
    const first = Math.min(...prep.map((r) => r.startMs));
    return { dateMs: first, resorts: prep.filter((r) => r.startMs === first) };
  }

  // Same pick all day: seeded by the Vienna date, chosen from open resorts when there are any.
  function resortOfTheDay() {
    const open = resortsWhere(hasStatus("open"));
    const pool = open.length ? open : resorts;
    const key = isoDay(state.now);
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return pool[hash % pool.length];
  }
  // #endregion

  // #region Weather (Open-Meteo)
  // WMO weather codes (as returned by Open-Meteo): a short description and the kind shown on pins,
  // list rows and filter chips. Rain, fog and storms count as cloudy.
  const WMO_WEATHER = [
    { codes: [0], text: "Clear sky", kind: "sunny" },
    { codes: [1], text: "Mainly sunny", kind: "sunny" },
    { codes: [2], text: "Partly cloudy", kind: "cloudy" },
    { codes: [3], text: "Overcast", kind: "cloudy" },
    { codes: [45, 48], text: "Fog", kind: "cloudy" },
    { codes: [51, 53, 55, 56, 57], text: "Drizzle", kind: "cloudy" },
    { codes: [61, 63, 65, 66, 67], text: "Rain", kind: "cloudy" },
    { codes: [71, 73, 75, 77], text: "Snowfall", kind: "snowy" },
    { codes: [80, 81, 82], text: "Rain showers", kind: "cloudy" },
    { codes: [85, 86], text: "Snow showers", kind: "snowy" },
    { codes: [95, 96, 99], text: "Thunderstorms", kind: "cloudy" }
  ];
  const UNKNOWN_WEATHER = { text: "Unknown", kind: "cloudy" };

  // Short label of each weather kind (list row tooltips).
  const WEATHER_LABEL = { sunny: "Sunny", snowy: "Snowy", cloudy: "Cloudy" };

  // Description and kind of a WMO weather code.
  function wmoWeather(code) {
    return WMO_WEATHER.find((w) => w.codes.includes(code)) || UNKNOWN_WEATHER;
  }

  // Fetches the forecast for every resort in one request, then redraws. Failures stay silent:
  // without a forecast the site simply shows no weather (or keeps the last one).
  function fetchWeather() {
    const params = new URLSearchParams(WEATHER_PARAMS);
    params.set("latitude", resorts.map((r) => r.lat.toFixed(4)).join(","));
    params.set("longitude", resorts.map((r) => r.lon.toFixed(4)).join(","));
    return fetchJson(`${WEATHER_URL}?${params}`, "Weather forecast failed")
      .then(parseWeather)
      .then(applyWeather, () => {
        // Weather unavailable (offline, service down or unexpected data).
      });
  }

  // Open-Meteo response (one location per resort, in resort order) -> per resort id:
  // { now: temperature right now, days: { "2026-12-20": { code, max, min, snow, uv, noon } } }.
  function parseWeather(data) {
    const locations = Array.isArray(data) ? data : [data];
    const weather = {};
    locations.forEach((w, i) => {
      const days = {};
      w.daily.time.forEach((day, d) => {
        const noon = w.hourly.time.indexOf(`${day}T12:00`);
        days[day] = {
          code: w.daily.weather_code[d],
          max: w.daily.temperature_2m_max[d],
          min: w.daily.temperature_2m_min[d],
          snow: w.daily.snowfall_sum[d] || 0,
          uv: w.daily.uv_index_max[d],
          noon: noon >= 0 ? w.hourly.temperature_2m[noon] : null
        };
      });
      weather[resorts[i].id] = { now: w.current.temperature_2m, days };
    });
    return weather;
  }

  // Stores a new forecast and redraws. The welcome screen opens before the forecast arrives: add the
  // powder section now, or open the screen for fresh powder alone if there was no season-opening news.
  function applyWeather(weather) {
    state.weather = weather;
    render();
    if (dom.welcome.open) {
      renderPowderSection();
    } else {
      showWelcome();
    }
  }

  // The weather that matters for a resort, or null: only while its season is open. Today's weather
  // until TOMORROW_MIN before its lifts close, then tomorrow's (if the season goes on).
  function weatherFor(r) {
    const forecast = state.weather && state.weather[r.id];
    if (r.status !== "open" || !forecast) {
      return null;
    }
    const tomorrow = isLateToday(r);
    if (tomorrow && !seasonRunsTomorrow(r)) {
      return null;
    }
    const day = forecast.days[isoDay(dayStart(state.now) + (tomorrow ? DAY : 0))];
    if (!day) {
      return null;
    }
    const { text, kind } = wmoWeather(day.code);
    return {
      tomorrow,
      kind,
      text,
      temp: tomorrow ? day.noon : forecast.now,
      max: day.max,
      min: day.min,
      snow: day.snow,
      fresh: day.snow >= FRESH_SNOW_CM,
      uv: day.uv
    };
  }

  // Fresh snow (FRESH_SNOW_CM or more) for an open resort today and/or tomorrow, e.g. [{ day: "today", cm: 15 }].
  // Tomorrow only while the season goes on.
  function powderDays(r) {
    const forecast = state.weather && state.weather[r.id];
    if (r.status !== "open" || !forecast) {
      return [];
    }
    const today = dayStart(state.now);
    const found = [];
    for (const [day, ms] of [["today", today], ["tomorrow", today + DAY]]) {
      const forecastDay = forecast.days[isoDay(ms)];
      if (forecastDay && forecastDay.snow >= FRESH_SNOW_CM && ms <= r.endMs) {
        found.push({ day, cm: Math.round(forecastDay.snow) });
      }
    }
    return found;
  }
  // #endregion

  // #region Network
  // A request that got no HTTP response at all: offline, blocked, or timed out.
  class NetworkError extends Error {}

  // Fetches JSON with a timeout. No response -> NetworkError; a non-OK status or a body that is not
  // JSON -> Error "<failMessage> (<reason>)".
  function fetchJson(url, failMessage, options = {}) {
    const signal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined;
    return fetch(url, { ...options, signal })
      .catch((err) => {
        throw new NetworkError(`${failMessage}: ${err.message}`);
      })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`${failMessage} (${res.status})`);
        }
        return res.json().catch(() => {
          throw new Error(`${failMessage} (invalid response)`);
        });
      });
  }
  // #endregion

  // #region DOM helpers
  // Phone-sized screens (same breakpoint as styles.css): map above the sidebar, details in a full-screen sheet.
  const narrowScreen = window.matchMedia("(max-width: 800px)");
  // Visitors who ask for less motion get no smooth scrolling or map flights.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // True on phone-sized screens.
  function isNarrow() {
    return narrowScreen.matches;
  }

  // Element by id.
  function byId(id) {
    return document.getElementById(id);
  }

  // Elements in index.html that the script fills or listens to.
  const dom = {
    clock: byId("clock"),
    highlights: byId("highlights"),
    typeChips: byId("type-chips"),
    statusChips: byId("status-chips"),
    openingChips: byId("opening-chips"),
    openingHeading: byId("opening-heading"),
    weatherChips: byId("weather-chips"),
    weatherHeading: byId("weather-heading"),
    valley: byId("valley-select"),
    homeForm: byId("home-form"),
    homeInput: byId("home-input"),
    homeSubmit: byId("home-submit"),
    homeClear: byId("home-clear"),
    homeStatus: byId("home-status"),
    search: byId("search-input"),
    count: byId("list-count"),
    list: byId("resort-list"),
    panel: byId("details-panel"),
    panelBody: byId("panel-body"),
    panelClose: byId("panel-close"),
    sheet: byId("details-sheet"),
    sheetBody: byId("sheet-body"),
    sheetClose: byId("sheet-close"),
    welcome: byId("welcome"),
    welcomeScene: byId("welcome-scene"),
    welcomeKicker: byId("welcome-kicker"),
    welcomeTitle: byId("welcome-title"),
    welcomeSub: byId("welcome-sub"),
    welcomeCountdown: byId("welcome-countdown"),
    welcomeList: byId("welcome-list"),
    welcomeClose: byId("welcome-close")
  };

  // New element with an optional class name and text.
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) {
      node.className = cls;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }

  // Appends every child that is not null, undefined or false; returns the parent.
  function append(parent, ...children) {
    for (const child of children) {
      if (child) {
        parent.appendChild(child);
      }
    }
    return parent;
  }

  // Replaces a node's content with a trusted SVG icon (from ICON) followed by a text label.
  function withIcon(node, svg, text) {
    node.innerHTML = svg;
    node.append(text);
    return node;
  }

  // A type="button" element with optional text and click handler.
  function button(cls, text, onClick) {
    const btn = el("button", cls, text);
    btn.type = "button";
    if (onClick) {
      btn.addEventListener("click", onClick);
    }
    return btn;
  }

  // Link that opens in a new tab, without giving that page access to this one or to its address.
  function externalLink(cls, href, text) {
    const link = el("a", cls, text);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  // Round lift-type badge with its icon.
  function liftBadge(type) {
    const badge = el("span", `badge ${type}`);
    badge.innerHTML = ICON[type];
    return badge;
  }

  // Sets a node's text only when it changed (no needless DOM writes or screen-reader announcements).
  function setText(node, text) {
    if (node.textContent !== text) {
      node.textContent = text;
    }
  }

  // aria-pressed state of a toggle button.
  function setPressed(btn, pressed) {
    btn.setAttribute("aria-pressed", String(pressed));
  }

  // Replaces a container's content. If keyboard focus was inside, it moves to the control at the same
  // position afterwards, so the periodic refresh does not throw keyboard users out of the list or details.
  function replaceContent(container, ...children) {
    const controls = () => [...container.querySelectorAll("button, a[href]")];
    const focusIndex = container.contains(document.activeElement) ? controls().indexOf(document.activeElement) : -1;
    container.replaceChildren(...children);
    if (focusIndex >= 0) {
      const target = controls()[focusIndex];
      if (target) {
        target.focus({ preventScroll: true });
      }
    }
  }
  // #endregion

  // #region Labels (pills, chips, tiles, banners)
  // Season status pill with its icon.
  function statusPill(r) {
    return withIcon(el("span", `pill ${r.status}`), STATUS_ICON[r.status], STATUS_LABEL[r.status]);
  }

  // Flame pill, e.g. "Recently opened".
  function flamePill(text) {
    return withIcon(el("span", "pill fire"), ICON.flame, text);
  }

  // Fire highlight (badge, warm row) for resorts that recently opened or open tomorrow.
  function isHot(r) {
    return r.isNew || r.opensTomorrow;
  }

  // "Opened today", "Recently opened" or "Opens tomorrow" flame pill, or null.
  function hotPill(r) {
    if (r.isNew) {
      return flamePill(r.openedToday ? "Opened today" : "Recently opened");
    }
    if (r.opensTomorrow) {
      return flamePill("Opens tomorrow");
    }
    return null;
  }

  // "Last days · 3 days left" pill near the season end, or null.
  function lastDaysPill(r) {
    if (!r.lastDays) {
      return null;
    }
    const left = r.lastDays === 1 ? "1 day left" : `${r.lastDays} days left`;
    return el("span", "pill last", `Last days · ${left}`);
  }

  // Colored lift-type tag, e.g. "Gondola".
  function typeTag(r) {
    return el("span", `tag ${r.type}`, TYPE_LABEL[r.type]);
  }

  // Timer chip: label + bold value, e.g. "Opens in 3d 4h"; the slope chip gets a skier icon.
  function timerChip(kind, label, value) {
    const chip = el("span", `tchip ${kind}`);
    if (kind === "slope") {
      chip.innerHTML = ICON.skier;
    }
    return append(chip, el("span", null, label), el("b", null, value));
  }

  // Parking price: "GRATIS" in green, paid parking shaded yellow to red by price; null when unknown.
  function parkingLabel(r, withPrefix = false) {
    if (r.parking == null) {
      return null;
    }
    const prefix = withPrefix ? "Parking " : "";
    if (r.parking === 0) {
      return el("strong", "park gratis", `${prefix}GRATIS`);
    }
    let level = "high";
    if (r.parking <= PARKING_LOW) {
      level = "low";
    } else if (r.parking <= PARKING_MID) {
      level = "mid";
    }
    return el("strong", `park paid ${level}`, `${prefix}€${r.parking} / day`);
  }

  // Two big number tiles for a countdown, e.g. "12 HOURS | 45 MIN".
  function countdownTiles(ms) {
    const tiles = countdownParts(ms).map(({ value, unit }) => {
      return append(el("div", "hero-tile"), el("b", null, String(value)), el("span", null, unit));
    });
    return append(el("div", "hero-tiles"), ...tiles);
  }

  // Exact time at the right edge of a details element: day on top ("today", "tomorrow" or a date),
  // clock below. The column has a fixed width, so the times of stacked elements line up.
  function timeColumn(ms) {
    const clock = append(el("div", "when-time"), el("span", "at", "at"), el("b", null, formatClock(ms)));
    return append(el("div", "when"), el("small", null, relativeDay(ms)), clock);
  }

  // Colored banner: icon + label and an optional note on the left, then optional countdown tiles
  // (countdown, in ms), then the optional exact time (at) in the right-hand time column.
  function hero(kind, label, { countdown = null, note = null, at = null } = {}) {
    const heading = el("div", "hero-label");
    if (HERO_ICON[kind]) {
      withIcon(heading, HERO_ICON[kind], label);
    } else {
      heading.textContent = label;
    }
    const text = append(el("div", "hero-text"), heading, note ? el("div", "hero-note", note) : null);
    return append(
      el("div", `hero ${kind}`),
      text,
      countdown != null ? countdownTiles(countdown) : null,
      at != null ? timeColumn(at) : null
    );
  }
  // #endregion

  // #region Clipboard
  // How long a copy button shows "Copied" (or "Failed") before it reads "Copy" again.
  const COPY_FEEDBACK_MS = 1600;

  // Copies text, with a fallback for pages not served from a secure origin (no Clipboard API there).
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const area = el("textarea");
      area.value = text;
      area.readOnly = true;   // no on-screen keyboard on phones
      area.style.position = "fixed";
      area.style.opacity = "0";
      // Inside an open modal dialog (the phone sheet) everything outside it is inert, so add it there.
      (document.querySelector("dialog[open]") || document.body).appendChild(area);
      let ok = false;
      try {
        area.select();
        ok = document.execCommand("copy");
      } finally {
        area.remove();
      }
      if (ok) {
        resolve();
      } else {
        reject(new Error("Copy failed"));
      }
    });
  }

  // Small "Copy" button that shows "Copied" (or "Failed") for a moment after a click.
  function copyButton(text, label) {
    const caption = el("span", null, "Copy");
    const btn = button("copy-btn");
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = ICON.copy;
    btn.appendChild(caption);

    let resetTimer = null;
    const showResult = (message, done) => {
      clearTimeout(resetTimer);
      caption.textContent = message;
      btn.classList.toggle("done", done);
      resetTimer = setTimeout(() => {
        caption.textContent = "Copy";
        btn.classList.remove("done");
      }, COPY_FEEDBACK_MS);
    };

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      copyText(text).then(
        () => showResult("Copied", true),
        () => showResult("Failed", false)
      );
    });
    return btn;
  }
  // #endregion

  // #region Map and pins
  // Note: OpenStreetMap's tile servers reject requests without a Referer header, so the
  // page must be served over http(s) (e.g. via serve.ps1), not opened from disk (file://).
  const map = L.map("map");
  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);   // resort pins that pass the filters
  let homeMarker = null;                            // the home pin, once an address is set

  // Map pin: a round badge with an icon, plus (for resorts) a season status dot, an ember glow when
  // recently opened, and a weather icon (wx) while the season is open.
  function pinIcon(cls, svg, { status = null, isNew = false, wx = null } = {}) {
    const dot = status ? `<i class="dot ${status}"></i>` : "";
    const weather = wx ? `<i class="wx-pin ${wx}">${ICON[wx]}</i>` : "";
    return L.divIcon({
      className: "",
      html: `<div class="badge ${cls}${isNew ? " is-new" : ""}">${svg}${dot}${weather}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -16]
    });
  }

  // A resort's pin icon for its current status and weather.
  function resortIcon(r) {
    return pinIcon(r.type, ICON[r.type], { status: r.status, isNew: r.isNew, wx: r.weather?.kind });
  }

  // What the pin icon depends on; the pin is redrawn when this changes.
  function pinState(r) {
    return `${r.status}|${r.isNew}|${r.weather ? r.weather.kind : ""}`;
  }

  // Creates one pin per resort; clicking it opens the resort's details.
  function createMarkers() {
    for (const r of resorts) {
      r.drawnPin = pinState(r);
      r.marker = L.marker([r.pinLat, r.pinLon], {
        icon: resortIcon(r),
        title: r.name,
        alt: `${TYPE_LABEL[r.type]}: ${r.name}`
      });
      r.marker.on("click", () => {
        openDetails(r);
        keepPinVisible(r);
      });
    }
  }

  // Shows only the visible resorts' pins and redraws those whose status or weather changed.
  // Only what changed is touched, so the map does not flicker on the periodic refresh.
  function syncMarkers(visibleIds) {
    for (const r of resorts) {
      const pin = pinState(r);
      if (r.drawnPin !== pin) {
        r.drawnPin = pin;
        r.marker.setIcon(resortIcon(r));
      }
      const shown = markerLayer.hasLayer(r.marker);
      const visible = visibleIds.has(r.id);
      if (visible && !shown) {
        markerLayer.addLayer(r.marker);
      } else if (!visible && shown) {
        markerLayer.removeLayer(r.marker);
      }
    }
  }

  // Zooms the map to the pins that pass the filters (or all pins when none do).
  function fitToVisible() {
    const visible = visibleResorts();
    const points = (visible.length ? visible : resorts).map((r) => [r.pinLat, r.pinLon]);
    map.fitBounds(points, { padding: [40, 40], maxZoom: FOCUS_ZOOM });
  }

  // Moves the map to a centre and zoom: a short flight, or a jump for visitors who prefer less motion.
  function moveMap(center, zoom) {
    if (reducedMotion.matches) {
      map.setView(center, zoom, { animate: false });
    } else {
      map.flyTo(center, zoom, { duration: 0.6 });
    }
  }

  // Same as moveMap, for framing bounds.
  function moveMapToBounds(bounds, options) {
    if (reducedMotion.matches) {
      map.fitBounds(bounds, { ...options, animate: false });
    } else {
      map.flyToBounds(bounds, { ...options, duration: 0.6 });
    }
  }
  // #endregion

  // #region Resort details (desktop side panel, phone sheet)
  // Desktop: a full-height panel docked on the right of the map, scrolling on its own, with the
  // rest of the map still visible. Phones: a full-screen sheet above everything.
  let detailsResort = null;   // the resort whose details are open, or null

  // The scrolling area that shows the details right now (panel or sheet), or null when closed.
  function detailsBody() {
    if (dom.sheet.open) {
      return dom.sheetBody;
    }
    if (!dom.panel.hidden) {
      return dom.panelBody;
    }
    return null;
  }

  // Shows a resort's details: in the sheet on phones, in the side panel on desktop.
  function openDetails(r) {
    detailsResort = r;
    const body = isNarrow() ? dom.sheetBody : dom.panelBody;
    body.replaceChildren(detailsCard(r));
    body.scrollTop = 0;
    if (!isNarrow()) {
      dom.panel.hidden = false;   // the panel overlays the map, so the map keeps its size
    } else if (!dom.sheet.open) {
      dom.sheet.showModal();
    }
  }

  // Rebuilds the open details for the periodic refresh, keeping the scroll position and keyboard focus.
  function refreshDetails() {
    const body = detailsBody();
    if (!body || !detailsResort) {
      return;
    }
    const top = body.scrollTop;
    replaceContent(body, detailsCard(detailsResort));
    body.scrollTop = top;
  }

  // Closes the details (panel or sheet).
  function closeDetails() {
    detailsResort = null;
    if (dom.sheet.open) {
      dom.sheet.close();
    }
    dom.panel.hidden = true;
  }

  // Width of the map hidden behind the open side panel (0 when closed or on phones).
  function panelCover() {
    return dom.panel.hidden || isNarrow() ? 0 : dom.panel.offsetWidth;
  }

  // Map centre that puts a point in the middle of the map area left uncovered by the panel.
  function centerBesidePanel(latlng, zoom) {
    return map.unproject(map.project(latlng, zoom).add([panelCover() / 2, 0]), zoom);
  }

  // Pans the map when a clicked pin sits under (or right next to) the side panel.
  function keepPinVisible(r) {
    const cover = panelCover();
    if (!cover) {
      return;
    }
    const x = map.latLngToContainerPoint([r.pinLat, r.pinLon]).x;
    const free = map.getSize().x - cover;
    if (x > free - PIN_MARGIN_PX) {
      map.panBy([x - free / 2, 0], { animate: !reducedMotion.matches });
    }
  }

  // Close buttons, the sheet backdrop, Escape and a click on empty map close the details.
  function bindDetails() {
    dom.panelClose.addEventListener("click", closeDetails);
    dom.sheetClose.addEventListener("click", closeDetails);

    // Phones: a tap on the dimmed area around the sheet closes it too.
    dom.sheet.addEventListener("click", (ev) => {
      if (ev.target === dom.sheet) {
        closeDetails();
      }
    });

    // The sheet can also close natively (Escape, back gesture): forget the resort unless the panel shows it.
    dom.sheet.addEventListener("close", () => {
      if (dom.panel.hidden) {
        detailsResort = null;
      }
    });

    // Desktop: Escape closes the panel, unless a dialog is open (Escape then closes the dialog only).
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !dom.panel.hidden && !dom.welcome.open && !dom.sheet.open) {
        closeDetails();
      }
    });
    map.on("click", () => {
      if (!dom.panel.hidden) {
        closeDetails();
      }
    });

    // Crossing the phone breakpoint (rotating, resizing) moves open details between panel and sheet.
    narrowScreen.addEventListener("change", () => {
      const r = detailsResort;
      if (r) {
        closeDetails();
        openDetails(r);
      }
    });
  }

  // Loosens any filter that hides the resort, then opens its details and brings it into view.
  function focusResort(r) {
    revealResort(r);
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);
    if (isNarrow()) {
      // Phones: scroll the page back to the top, centre the map on the resort behind the sheet,
      // and open the full-screen details sheet.
      window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
      map.setView([r.pinLat, r.pinLon], zoom, { animate: false });
      openDetails(r);
      return;
    }
    // Desktop: open the side panel, then bring the resort to the middle of the map left uncovered.
    openDetails(r);
    moveMap(centerBesidePanel(L.latLng(r.pinLat, r.pinLon), zoom), zoom);
  }

  // Changes only the filters that currently hide this resort, then redraws.
  function revealResort(r) {
    if (matches(r)) {
      return;
    }
    state.types.add(r.type);
    if (state.status !== "all" && state.status !== r.status) {
      state.status = "all";
    }
    if (state.valley !== "all" && state.valley !== r.valley) {
      state.valley = "all";
      dom.valley.value = "all";
    }
    if (state.search && !r.searchName.includes(state.search)) {
      state.search = "";
      dom.search.value = "";
    }
    for (const group of TOGGLE_FILTERS) {
      if (!passesToggle(group, r)) {
        state[group.stateKey] = null;
      }
    }
    render();
  }
  // #endregion

  // #region Directions (route line from home to a resort)
  // The route is drawn only on request ("Show directions" in the details). It stays until
  // another route is shown, its resort is filtered out, or the home address changes.
  const route = {
    layer: null,      // the drawn route line, or null
    resortId: null,   // the resort it leads to, or null
    request: 0        // bumped by every route request and by clearRoute(); older responses are ignored
  };

  // The route line: a white casing under a red line, so it stands out on any map background.
  const ROUTE_STYLE = [
    { color: "#fff", weight: 9, opacity: 0.9, interactive: false },
    { color: "#d9482b", weight: 5, opacity: 0.95, interactive: false }
  ];

  // "lon,lat" with 6 decimals, the coordinate format OSRM expects.
  function lonLat(p) {
    return `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;
  }

  // Removes the route line and cancels any route still loading.
  function clearRoute() {
    route.request++;
    route.resortId = null;
    if (route.layer) {
      route.layer.remove();
      route.layer = null;
    }
  }

  // Road geometry from home to a resort as [lat, lon] points (OSRM); rejects when there is no route.
  function fetchRoute(home, r) {
    const url = `${ROUTE_URL}${lonLat(home)};${lonLat(r)}?overview=full&geometries=geojson`;
    return fetchJson(url, "Route failed").then((data) => {
      if (data.code !== "Ok" || !data.routes || !data.routes.length) {
        throw new Error("No route found");
      }
      return data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    });
  }

  // Draws the route line to a resort, replacing any previous one.
  function drawRoute(path, r) {
    if (route.layer) {
      route.layer.remove();
    }
    route.layer = L.layerGroup(ROUTE_STYLE.map((style) => L.polyline(path, style))).addTo(map);
    route.resortId = r.id;
  }

  // "Show directions": draws the route from home and frames the whole trip beside the details panel.
  function showDirections(r) {
    if (!state.home) {
      return;
    }
    const home = state.home;
    const request = ++route.request;
    setStatus(`Loading directions to ${r.name}…`);
    fetchRoute(home, r).then(
      (path) => {
        if (request !== route.request) {
          return;   // replaced by a newer request, or the route was cleared meanwhile
        }
        drawRoute(path, r);
        setStatus(`Directions to ${r.name} shown on the map.`);
        const bounds = L.latLngBounds(path).extend([r.pinLat, r.pinLon]).extend([home.lat, home.lon]);
        // Keep the whole route clear of the side panel when it is open.
        moveMapToBounds(bounds, {
          paddingTopLeft: [50, 50],
          paddingBottomRight: [50 + panelCover(), 50],
          maxZoom: ROUTE_MAX_ZOOM
        });
      },
      () => {
        if (request === route.request) {
          setStatus(`Could not load directions to ${r.name}. Try again later.`, true);
        }
      }
    );
  }
  // #endregion

  // #region Details content
  // One step of the day plan, read as "Wake up in | 7 hours 30 min | at 07:00":
  // icon + action on the left, countdown in the middle, exact time on the right.
  function planStep(kind, svg, action, ms) {
    const left = ms - state.now;
    const label = withIcon(el("span", "plan-label"), svg, left > 0 ? `${action} in` : action);
    return append(el("div", `plan-step ${kind}`), label, left > 0 ? countdownTiles(left) : null, timeColumn(ms));
  }

  // Dashed connector between two steps, e.g. "sleep 8 h".
  function planGap(text) {
    return el("div", "plan-gap", text);
  }

  // "Go to bed in" night card with countdown, or "Time for bed!" once bedtime has passed.
  function bedtimeCard(plan) {
    const left = plan.bedAt - state.now;
    const card = left > 0
      ? hero("night", "Go to bed in", { countdown: left, at: plan.bedAt })
      : hero("night", "Time for bed!", { note: "past bedtime · sleep now", at: plan.bedAt });
    return append(card, el("span", "moon"));
  }

  // Hype tag under the slope banner: the closer the first run, the louder.
  function hypeText(slopeIn) {
    if (slopeIn < 2 * HOUR) {
      return "Go go go!";
    }
    if (slopeIn < 4 * HOUR) {
      return "Gear up!";
    }
    return "Fresh tracks await";
  }

  // "On the slope in" banner with countdown, first-run time and a hype tag on its own row.
  function slopeCard(plan) {
    const card = hero("slope", "On the slope in", { countdown: plan.slopeIn, at: plan.slopeAt });
    return append(card, el("div", "hype-tag", hypeText(plan.slopeIn)));
  }

  // Go to bed -> Wake up -> Start driving -> On the slope (bed and wake-up only in "try tomorrow" mode).
  function planNode(plan) {
    const wrap = el("div", "plan");
    if (plan.bedAt != null) {
      append(
        wrap,
        bedtimeCard(plan),
        planGap(`sleep ${formatDuration(SLEEP_MIN)}`),
        planStep("wake", ICON.alarm, "Wake up", plan.wakeAt)
      );
    }
    return append(
      wrap,
      planGap(`get ready ${formatDuration(PREP_MIN)}`),
      planStep("drive", ICON.car, "Start driving", plan.driveAt),
      planGap(`drive ${formatDuration(plan.drive)} + ${GEAR_MIN} min gearing up + ${LIFT_MIN} min up the lift`),
      slopeCard(plan)
    );
  }

  // Top of the details by season: opening countdown, day plan while open, goodbye after the season.
  function seasonBanner(r) {
    if (r.status === "prep") {
      return openingCard(r);
    }
    if (r.status === "ended") {
      return hero("ended", "See you next season!");
    }
    const plan = tripPlan(r);
    const planEl = plan ? planNode(plan) : null;
    // "Try tomorrow!" shows from TOMORROW_MIN before closing until the lifts close; the plan for tomorrow stays.
    const lastHour = tryTomorrow(r) && state.now - dayStart(state.now) < r.closeMs;
    if (lastHour) {
      return append(el("div", "plan-wrap"), tomorrowCard(r), planEl);
    }
    return planEl;
  }

  // "Season opens in" countdown; the note gives the date when the lift hours are unknown.
  function openingCard(r) {
    let note = null;
    if (r.startEstimated) {
      note = "expected date";
    } else if (!r.open) {
      note = formatDate(r.startMs);
    }
    return hero("opens", "Season opens in", {
      countdown: r.opensIn,
      note,
      at: r.open ? r.startMs + r.openMs : null
    });
  }

  // "Try tomorrow!" banner while the lifts are in their last TOMORROW_MIN: too late for a ski day today.
  function tomorrowCard(r) {
    return hero("tomorrow", "Try tomorrow!", { note: `Lifts close at ${r.close} · too late for today` });
  }

  // Small chip next to the lift hours: "start in 2h 30m" or "running now".
  function liftChip(r) {
    if (r.lift?.state === "before") {
      return timerChip("lift", "start in", formatCountdown(r.lift.wait));
    }
    if (r.lift?.state === "running") {
      return timerChip("running", "running", "now");
    }
    return null;
  }

  // Label/value table: lift hours, parking, season dates, valley, address, GPS, distance from home.
  function factList(r) {
    const facts = el("dl", "facts");
    // Adds one row; skipped when the value is empty. Text values are wrapped in a span.
    const fact = (label, value, extra = null) => {
      if (value == null || value === "") {
        return;
      }
      const dd = append(el("dd"), typeof value === "string" ? el("span", null, value) : value, extra);
      append(facts, el("dt", null, label), dd);
    };
    const start = r.startLabel || (r.seasonStart ? formatDate(r.startMs) : null);
    const end = r.endLabel || (r.seasonEnd ? formatDate(r.endMs) : null);
    const gps = `${r.lat.toFixed(6)}, ${r.lon.toFixed(6)}`;
    const ended = r.status === "ended";   // after the season only the goodbye banner speaks about timing
    const d = distanceTo(r);

    if (!ended) {
      fact("Lift hours", hoursText(r), liftChip(r));
    }
    fact("Parking", parkingLabel(r));
    if (!ended) {
      fact("Season start", start && (r.open ? `${start} · lifts open ${r.open}` : start));
      fact("Season end", end);
    }
    fact("Valley", r.valley);
    fact("Address", r.address, r.address ? copyButton(r.address, "Copy address") : null);
    fact("GPS", gps, copyButton(gps, "Copy GPS coordinates"));
    if (d) {
      const how = d.approx ? "straight-line" : "by car";
      const time = d.minutes != null ? ` · ${formatDuration(d.minutes)}` : "";
      fact("From home", `${formatDistance(d)} ${how}${time}`);
    }
    return facts;
  }

  // "Show directions" button; disabled while no home address is set.
  function directionsButton(r) {
    if (state.home) {
      return button("route-btn", "Show directions", () => showDirections(r));
    }
    const btn = button("route-btn", "Show directions");
    btn.disabled = true;
    btn.title = 'Enter your home address under "Distance from home" first';
    return btn;
  }

  // Hint under the disabled directions button, or null once a home address is set.
  function directionsHint() {
    if (state.home) {
      return null;
    }
    return el("p", "route-hint", "Enter your home address under “Distance from home” to see directions.");
  }

  // Phones only (shown by CSS instead of "Show directions"): opens Google Maps (the app on Android,
  // the app or website on iPhone) with driving directions from the phone's location to the resort.
  // Only the resort's coordinates go into the link.
  function googleMapsButton(r) {
    const params = new URLSearchParams({ api: "1", destination: `${r.lat},${r.lon}`, travelmode: "driving" });
    const link = externalLink("route-btn gmaps-btn", `${GMAPS_DIR_URL}?${params}`);
    return withIcon(link, ICON.car, "Navigate with Google Maps");
  }

  // Weather card (open resorts only): icon and description, temperature (now, or at noon tomorrow)
  // with high and low, whether fresh snow is coming, the UV index when sunny, and the data credit.
  function weatherCard(r) {
    const w = r.weather;
    if (!w) {
      return null;
    }
    return append(
      el("div", `wx ${w.kind}`),
      weatherHead(w),
      snowLine(w),
      uvLine(w),
      externalLink("wx-credit", WEATHER_CREDIT_URL, "Weather data by Open-Meteo.com")
    );
  }

  // Weather card top row: icon, "Today's weather" with the description, then the temperatures.
  function weatherHead(w) {
    const icon = el("span", "wx-icon");
    icon.innerHTML = ICON[w.kind];
    const what = append(
      el("div", "wx-what"),
      el("div", "wx-when", w.tomorrow ? "Tomorrow's weather" : "Today's weather"),
      el("div", "wx-text", w.text)
    );
    const now = append(
      el("div", "wx-now"),
      el("b", null, formatTemp(w.temp)),
      el("small", null, w.tomorrow ? "at noon" : "now")
    );
    const range = el("div", "wx-range", `H ${formatTemp(w.max)} · L ${formatTemp(w.min)}`);
    return append(el("div", "wx-head"), icon, what, append(el("div", "wx-temps"), now, range));
  }

  // Fresh snow, a light dusting, or none.
  function snowLine(w) {
    const day = w.tomorrow ? "tomorrow" : "today";
    if (w.fresh) {
      return withIcon(el("div", "wx-line powder"), ICON.snowy, `Fresh snow ${day}: ${Math.round(w.snow)} cm`);
    }
    if (w.snow > 0) {
      return el("div", "wx-line", `Only a light dusting of snow ${day} (under ${FRESH_SNOW_CM} cm)`);
    }
    return el("div", "wx-line", `No fresh snow expected ${day}`);
  }

  // UV index on sunny days, with a warning from UV_HIGH up; null otherwise.
  function uvLine(w) {
    if (w.kind !== "sunny" || w.uv == null) {
      return null;
    }
    const high = w.uv >= UV_HIGH;
    const text = `UV index ${Math.round(w.uv)}${high ? " · High UV! Sunscreen and sunglasses" : ""}`;
    return withIcon(el("div", high ? "wx-line uv high" : "wx-line uv"), ICON.sunny, text);
  }

  // Small weather icon (sunny, snowy or cloudy) for list rows, or null without weather.
  function weatherMini(r) {
    const w = r.weather;
    if (!w) {
      return null;
    }
    const label = `${WEATHER_LABEL[w.kind]} ${w.tomorrow ? "tomorrow" : "today"}${w.fresh ? " · fresh snow" : ""}`;
    const icon = el("span", `wx-mini ${w.kind}`);
    icon.innerHTML = ICON[w.kind];
    icon.title = label;
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", label);
    return icon;
  }

  // Full details of a resort, shown in the side panel (desktop) or the sheet (phones).
  function detailsCard(r) {
    const pills = append(el("div", "pills"), statusPill(r), typeTag(r), hotPill(r), lastDaysPill(r));
    return append(
      el("div", "popup"),
      el("h3", null, r.name),
      pills,
      seasonBanner(r),
      weatherCard(r),
      factList(r),
      // Desktop: route line on this map. Phones: hand over to Google Maps (CSS shows one or the other).
      append(el("div", "desktop-only"), directionsButton(r), directionsHint()),
      googleMapsButton(r)
    );
  }
  // #endregion

  // #region Sidebar controls
  const typeButtons = {};      // lift type -> its chip
  const statusButtons = {};    // "all" or status -> its chip
  let allTypesButton = null;   // "Show all" / "Showing all" chip

  // Toggle filter groups below the season status. Pressing a chip shows only its resorts, across every
  // lift type and season status, and zooms the map to them; pressing it again (or another chip of the
  // same group) switches it off. A chip only shows while it has resorts, the heading while any chip does.
  // To add a group: a chips container and heading in index.html, a field in state, and an entry here.
  const TOGGLE_FILTERS = [
    {
      // Season openings (real start dates only).
      stateKey: "opening",
      chips: dom.openingChips,
      heading: dom.openingHeading,
      chipClass: "chip chip-opening",
      buttons: {},
      options: {
        today: { label: "Opened today", icon: ICON.flame, test: (r) => r.openedToday },
        tomorrow: { label: "Opens tomorrow", icon: ICON.flame, test: (r) => r.opensTomorrow },
        weekend: { label: "Opens this weekend", icon: ICON.flame, test: (r) => r.opensWeekend }
      }
    },
    {
      // Weather (open resorts with a forecast).
      stateKey: "wxFilter",
      chips: dom.weatherChips,
      heading: dom.weatherHeading,
      chipClass: "chip chip-weather",
      buttons: {},
      options: {
        sunny: { label: "Sunny", icon: ICON.sunny, test: (r) => r.weather?.kind === "sunny" },
        powder: { label: "Fresh powder", icon: ICON.snowy, test: (r) => Boolean(r.weather?.fresh) }
      }
    }
  ];

  // Whether a resort passes a toggle filter group (always, while none of the group's chips is on).
  function passesToggle(group, r) {
    const active = state[group.stateKey];
    return !active || group.options[active].test(r);
  }

  // Lift type chips (toggle each type) plus a "Show all" chip.
  function buildTypeChips() {
    for (const type of TYPE_KEYS) {
      const btn = button("chip", null, () => {
        if (state.types.has(type)) {
          state.types.delete(type);
        } else {
          state.types.add(type);
        }
        render();
      });
      const count = countWhere((r) => r.type === type);
      append(
        btn,
        liftBadge(type),
        document.createTextNode(`${TYPE_LABEL[type]} `),
        el("small", null, `(${count})`)
      );
      typeButtons[type] = btn;
      dom.typeChips.appendChild(btn);
    }
    // "Show all" switches every type on; pressed again it goes back to the default selection.
    allTypesButton = button("chip chip-all", "Show all", () => {
      const allOn = state.types.size === TYPE_KEYS.length;
      state.types = new Set(allOn ? DEFAULT_TYPES : TYPE_KEYS);
      render();
    });
    dom.typeChips.appendChild(allTypesButton);
  }

  // Season status chips: All, Season open, In preparation, Season ended (counts filled in by render).
  function buildStatusChips() {
    for (const key of ["all", ...STATUS_KEYS]) {
      // Like the valley dropdown, the map then zooms to the resorts that pass the filters.
      const btn = button("chip chip-status", null, () => {
        state.status = key;
        render();
        fitToVisible();
      });
      append(
        btn,
        key !== "all" ? el("i", `dot ${key}`) : null,
        el("span", null, key === "all" ? "All" : STATUS_LABEL[key]),
        el("small")
      );
      statusButtons[key] = btn;
      dom.statusChips.appendChild(btn);
    }
  }

  // The chips of one toggle filter group (counts and visibility filled in by render).
  function buildToggleChips(group) {
    for (const [key, option] of Object.entries(group.options)) {
      const btn = button(`${group.chipClass} ${key}`, null, () => {
        state[group.stateKey] = state[group.stateKey] === key ? null : key;
        if (state[group.stateKey]) {
          state.types = new Set(TYPE_KEYS);
          state.status = "all";
        }
        render();
        fitToVisible();   // zoom to the matching resorts (or back to all of them when switched off)
      });
      withIcon(btn, option.icon, option.label);
      btn.appendChild(el("small"));
      group.buttons[key] = btn;
      group.chips.appendChild(btn);
    }
  }

  // Valley dropdown with every valley in data order.
  function buildValleySelect() {
    const valleys = [...new Set(resorts.map((r) => r.valley))];
    dom.valley.append(new Option("All valleys", "all"), ...valleys.map((v) => new Option(v, v)));
    dom.valley.addEventListener("change", () => {
      state.valley = dom.valley.value;
      render();
      fitToVisible();
    });
  }

  // Filters the list as the user types (accents and case are ignored).
  function bindSearch() {
    dom.search.addEventListener("input", () => {
      state.search = normalize(dom.search.value.trim());
      render();
    });
  }

  // Updates the pressed state and counts of every chip.
  function updateControls() {
    updateTypeChips();
    updateStatusChips();
    TOGGLE_FILTERS.forEach(updateToggleChips);
  }

  // Lift type chips, and "Show all" / "Showing all".
  function updateTypeChips() {
    for (const type of TYPE_KEYS) {
      setPressed(typeButtons[type], state.types.has(type));
    }
    const allOn = state.types.size === TYPE_KEYS.length;
    setPressed(allTypesButton, allOn);
    setText(allTypesButton, allOn ? "Showing all" : "Show all");
  }

  // Season status chips with their counts.
  function updateStatusChips() {
    for (const [key, btn] of Object.entries(statusButtons)) {
      const n = key === "all" ? resorts.length : countWhere(hasStatus(key));
      setPressed(btn, state.status === key);
      setText(btn.lastChild, ` (${n})`);
    }
  }

  // A chip without resorts hides (and switches off if it was on); the heading hides with the last chip.
  function updateToggleChips(group) {
    let anyShown = false;
    for (const [key, option] of Object.entries(group.options)) {
      const btn = group.buttons[key];
      const n = countWhere(option.test);
      if (!n && state[group.stateKey] === key) {
        state[group.stateKey] = null;
      }
      btn.hidden = !n;
      setPressed(btn, state[group.stateKey] === key);
      setText(btn.lastChild, ` (${n})`);
      anyShown = anyShown || n > 0;
    }
    group.heading.hidden = !anyShown;
  }
  // #endregion

  // #region Resort list and highlights
  // The one timer shown in a list row: opening countdown, time to slope, or lift start / running.
  function rowTimer(r) {
    if (r.status === "prep") {
      return timerChip("opens", r.startEstimated ? "Opens in about" : "Opens in", formatCountdown(r.opensIn));
    }
    const slope = timeToSlope(r);
    if (slope != null) {
      return timerChip("slope", "On the slope in", formatCountdown(slope));
    }
    if (r.lift?.state === "before") {
      return timerChip("lift", "Lifts start in", formatCountdown(r.lift.wait));
    }
    if (r.lift?.state === "running") {
      return timerChip("running", "Lifts running until", r.close);
    }
    return null;
  }

  // Distance on the right of a row: "54 km" over "1 h 5 min drive" (or "straight-line").
  function distanceLabel(d) {
    if (!d) {
      return null;
    }
    const detail = d.minutes != null ? `${formatDuration(d.minutes)} drive` : "straight-line";
    return append(el("span", "dist", formatDistance(d)), el("small", null, detail));
  }

  // Compact list row: badge, name, status labels and one timer. Everything else is in the details.
  // Only phrasing elements (span, b, small) go inside the button, as HTML requires.
  function resortRow(r) {
    const badge = liftBadge(r.type);
    badge.title = TYPE_LABEL[r.type];
    const name = append(el("span", "name"), document.createTextNode(`${r.name} `), weatherMini(r));
    const labels = append(
      el("span", "row-status"),
      statusPill(r),
      hotPill(r),
      lastDaysPill(r),
      rowTimer(r),
      parkingLabel(r, true)
    );
    const btn = button(isHot(r) ? "resort is-new" : "resort", null, () => focusResort(r));
    btn.title = "Show details";
    append(btn, badge, append(el("span", "body"), name, labels), distanceLabel(distanceTo(r)));
    return append(el("li"), btn);
  }

  // Highlight card with a small uppercase title and its content.
  function highlightCard(cls, title, ...content) {
    return append(el("div", `card ${cls}`), el("div", "card-title", title), ...content);
  }

  // Clickable resort line inside a highlight card.
  function resortLink(r, extra) {
    const btn = button("card-resort", null, () => focusResort(r));
    return append(btn, el("span", "card-name", r.name), extra ? el("span", "card-extra", extra) : null);
  }

  // "Resort of the day" and "Next opening" cards.
  function renderHighlights() {
    const pick = resortOfTheDay();
    const pickLink = resortLink(pick, `${pick.valley} · ${STATUS_LABEL[pick.status]}`);
    const cards = [highlightCard("pick", "Resort of the day", pickLink)];
    const next = nextOpening();
    if (next) {
      const links = next.resorts.map((r) => {
        const expected = r.startEstimated ? " (expected)" : "";
        return resortLink(r, `in ${formatCountdown(r.opensIn)}${expected}`);
      });
      cards.push(highlightCard("next", `Next opening · ${formatDate(next.dateMs)}`, ...links));
    }
    replaceContent(dom.highlights, ...cards);
  }

  // Rebuilds the resort list, nearest first once distances are known.
  function renderList(list) {
    setText(dom.count, `${list.length} of ${resorts.length}${state.distances ? " · nearest first" : ""}`);
    if (!list.length) {
      replaceContent(dom.list, el("li", "empty", "No resorts match the current filters and search."));
      return;
    }
    replaceContent(dom.list, ...list.map((r) => resortRow(r)));
  }
  // #endregion

  // #region Render
  // True when a resort passes every filter and the search.
  function matches(r) {
    return (
      state.types.has(r.type) &&
      (state.status === "all" || r.status === state.status) &&
      (state.valley === "all" || r.valley === state.valley) &&
      (!state.search || r.searchName.includes(state.search)) &&
      TOGGLE_FILTERS.every((group) => passesToggle(group, r))
    );
  }

  // Resorts that pass the filters, sorted by distance once a home address is set.
  function visibleResorts() {
    const list = resorts.filter(matches);
    if (state.distances) {
      list.sort((a, b) => state.distances[a.id].km - state.distances[b.id].km);
    }
    return list;
  }

  // Recalculates statuses and redraws the clock, chips, highlights, pins, list and open details.
  function render() {
    refreshStatus();
    setText(dom.clock, `${placeName()} · ${formatDate(state.now)} · ${formatClock(state.now)}`);
    updateControls();
    renderHighlights();

    const list = visibleResorts();
    const visibleIds = new Set(list.map((r) => r.id));
    syncMarkers(visibleIds);
    if (route.resortId != null && !visibleIds.has(route.resortId)) {
      clearRoute();   // its resort was filtered out
    }
    renderList(list);
    refreshDetails();
  }

  // The clock shows the home town once an address is set, otherwise Innsbruck.
  function placeName() {
    if (!state.home) {
      return "Innsbruck";
    }
    return state.home.city || state.home.label.split(",")[0].trim() || "Innsbruck";
  }
  // #endregion

  // #region Welcome screen
  // The welcome screen shows once per day when there is news: season openings today, tomorrow or soon,
  // and fresh powder. Its content is { kicker, title, sub, countLabel, liveText, target (first lift, in ms,
  // or null for no countdown), entries, extraTitle + extra (a second list), hot (fire colors) }.
  let welcomeShownOn = null;   // the day it was shown; keeps it to once a day even without local storage

  // Today's season openings, otherwise tomorrow's, otherwise the next one; null without any.
  function welcomeContent() {
    const today = dayStart(state.now);
    const openedToday = resortsWhere((r) => r.startMs === today);
    const opensTomorrow = resortsWhere((r) => r.opensTomorrow);
    if (openedToday.length) {
      return openingTodayContent(today, openedToday, opensTomorrow);
    }
    const next = nextOpening();
    if (!next) {
      return null;
    }
    if (opensTomorrow.length && next.dateMs === today + DAY) {
      return openingTomorrowContent(today, opensTomorrow);
    }
    return nextOpeningContent(next);
  }

  // "Season opening today!", with tomorrow's openings fire-highlighted below.
  function openingTodayContent(today, openedToday, opensTomorrow) {
    const n = openedToday.length;
    return {
      kicker: "Today",
      title: "Season opening today!",
      sub: n === 1
        ? `One resort starts its season today, ${formatDate(today)}.`
        : `${n} resorts start their season today, ${formatDate(today)}.`,
      countLabel: "First lift starts in",
      liveText: "The lifts are running. Go!",
      target: earliest(openedToday.filter((r) => r.openMs != null), (r) => today + r.openMs),
      entries: openedToday.map((r) => {
        const bits = [r.valley];
        if (hoursText(r)) {
          bits.push(`lifts ${hoursText(r)}`);
        }
        if (r.startEstimated) {
          bits.push("expected date");
        }
        return { r, text: bits.join(" · ") };
      }),
      extraTitle: opensTomorrow.length ? "Opening tomorrow" : null,
      extra: opensTomorrow.map((r) => tomorrowEntry(r))
    };
  }

  // "Opening tomorrow!", the whole screen in fire colors.
  function openingTomorrowContent(today, opensTomorrow) {
    const n = opensTomorrow.length;
    const who = n === 1 ? "One resort starts" : `${n} resorts start`;
    return {
      kicker: "Tomorrow",
      title: "Opening tomorrow!",
      sub: `${who} the season tomorrow, ${formatDate(today + DAY)}. Set your alarm!`,
      countLabel: "Countdown to the first lift",
      liveText: "Opening now!",
      target: earliest(opensTomorrow, firstLiftMs),
      entries: opensTomorrow.map((r) => tomorrowEntry(r)),
      hot: true
    };
  }

  // "Next opening", with a countdown to the first lift of the next season start.
  function nextOpeningContent(next) {
    return {
      kicker: "Coming up",
      title: "Next opening",
      sub: `No resort opens today, but the next season start is close: ${formatDate(next.dateMs)}. ` +
        "Get your gear ready!",
      countLabel: "Countdown to the first lift",
      liveText: "Opening now!",
      target: earliest(next.resorts, firstLiftMs),
      entries: next.resorts.map((r) => {
        const expected = r.startEstimated ? " (expected)" : "";
        return { r, text: `${r.valley} · in ${formatCountdown(r.opensIn)}${expected}` };
      })
    };
  }

  // Welcome screen just for fresh powder, on days without season-opening news.
  function powderOnlyContent() {
    const n = powderEntries().length;
    if (!n) {
      return null;
    }
    return {
      kicker: "Snow alert",
      title: "Fresh powder!",
      sub: `${n === 1 ? "One open resort gets" : `${n} open resorts get`} fresh snow today or tomorrow.`,
      target: null,
      entries: []
    };
  }

  // First lift of a resort's season: season start plus lift opening.
  function firstLiftMs(r) {
    return r.startMs + (r.openMs || 0);
  }

  // Smallest value of fn over a list, or null for an empty list.
  function earliest(list, fn) {
    return list.length ? Math.min(...list.map(fn)) : null;
  }

  // Fire-highlighted entry for a resort whose season starts tomorrow.
  function tomorrowEntry(r) {
    const bits = [r.valley, `in ${formatCountdown(r.opensIn)}`];
    if (hoursText(r)) {
      bits.push(`lifts ${hoursText(r)}`);
    }
    return { r, text: bits.join(" · "), hot: true };
  }

  // Welcome entries for every resort with fresh powder today or tomorrow, most snow first.
  function powderEntries() {
    return resorts
      .map((r) => {
        const days = powderDays(r);
        return { r, days, total: days.reduce((sum, d) => sum + d.cm, 0) };
      })
      .filter((p) => p.days.length)
      .sort((a, b) => b.total - a.total)
      .map(({ r, days }) => {
        const snow = days.map((d) => `${d.cm} cm ${d.day}`).join(" · ");
        return { r, text: `${r.valley} · ${snow}`, powder: true };
      });
  }

  // Adds (or refreshes) the "Fresh powder" section at the end of the welcome list.
  function renderPowderSection() {
    dom.welcomeList.querySelectorAll(".powder-item").forEach((li) => li.remove());
    const entries = powderEntries();
    if (!entries.length) {
      return;
    }
    const heading = el("li", "welcome-section powder-section powder-item");
    withIcon(heading, ICON.snowy, "Fresh powder today & tomorrow");
    const items = entries.map((entry) => {
      const li = welcomeEntry(entry);
      li.classList.add("powder-item");
      return li;
    });
    dom.welcomeList.append(heading, ...items);
  }

  // Clickable resort card in the welcome list; closes the dialog and opens the resort.
  // Tomorrow's openings (entry.hot) get a fiery card with an "Opens tomorrow" flame pill,
  // fresh powder (entry.powder) an icy one.
  function welcomeEntry(entry) {
    const name = append(
      el("strong"),
      document.createTextNode(entry.r.name),
      entry.hot ? flamePill("Opens tomorrow") : null,
      entry.powder ? withIcon(el("span", "pill powder"), ICON.snowy, "Fresh powder") : null
    );
    const classes = ["welcome-resort", entry.hot && "hot", entry.powder && "powder"].filter(Boolean);
    const btn = button(classes.join(" "), null, () => {
      dom.welcome.close();
      focusResort(entry.r);
    });
    append(btn, liftBadge(entry.r.type), append(el("span"), name, el("small", null, entry.text)));
    return append(el("li"), btn);
  }

  // Live days / hours / minutes / seconds tiles; returns the interval id so it can be stopped,
  // or null when there is nothing (left) to count down.
  function startWelcomeCountdown(box, content) {
    box.replaceChildren();
    if (content.target == null) {
      return null;
    }
    const units = ["days", "hours", "minutes", "seconds"];
    const nums = units.map(() => el("b"));
    const tiles = units.map((unit, i) => append(el("div", `tile ${unit}`), nums[i], el("span", null, unit)));
    box.append(el("div", "countdown-label", content.countLabel), append(el("div", "countdown-tiles"), ...tiles));

    // Updates the tiles; at zero it shows the "live" message instead and returns false.
    const tick = () => {
      const left = Math.floor((content.target - viennaNow()) / SEC);
      if (left <= 0) {
        box.replaceChildren(el("div", "count-live", content.liveText));
        return false;
      }
      const secPerDay = DAY / SEC;
      const secPerHour = HOUR / SEC;
      nums[0].textContent = Math.floor(left / secPerDay);
      nums[1].textContent = pad(Math.floor((left % secPerDay) / secPerHour));
      nums[2].textContent = pad(Math.floor((left % secPerHour) / 60));
      nums[3].textContent = pad(left % 60);
      return true;
    };

    if (!tick()) {
      return null;
    }
    const timer = setInterval(() => {
      if (!tick()) {
        clearInterval(timer);
      }
    }, SEC);
    return timer;
  }

  // Shows the welcome dialog once per day (until it is closed that day), when there is news.
  function showWelcome() {
    const dialog = dom.welcome;
    if (!dialog.showModal) {
      return;   // very old browser without <dialog> support
    }
    const todayKey = isoDay(state.now);
    if (welcomeShownOn === todayKey || storageGet(STORE_WELCOME) === todayKey) {
      return;
    }
    const content = welcomeContent() || powderOnlyContent();
    if (!content) {
      return;
    }
    welcomeShownOn = todayKey;

    dom.welcomeKicker.textContent = content.kicker;
    dom.welcomeTitle.textContent = content.title;
    dom.welcomeSub.textContent = content.sub;
    const items = content.entries.map((entry) => welcomeEntry(entry));
    if (content.extraTitle) {
      items.push(withIcon(el("li", "welcome-section"), ICON.flame, content.extraTitle));
      items.push(...content.extra.map((entry) => welcomeEntry(entry)));
    }
    dom.welcomeList.replaceChildren(...items);
    renderPowderSection();
    dialog.classList.toggle("hot", Boolean(content.hot));

    const timer = startWelcomeCountdown(dom.welcomeCountdown, content);
    dialog.addEventListener("close", () => {
      storageSet(STORE_WELCOME, todayKey);
      clearInterval(timer);
    }, { once: true });

    // Respect reduced motion for the SVG animations (gondolas) too.
    if (reducedMotion.matches && dom.welcomeScene.pauseAnimations) {
      dom.welcomeScene.pauseAnimations();
    }

    dialog.showModal();
    dom.welcomeClose.focus();
  }

  // "Let's go" closes the welcome screen (Escape closes it natively).
  function bindWelcome() {
    dom.welcomeClose.addEventListener("click", () => dom.welcome.close());
  }
  // #endregion

  // #region Home address and driving distances
  let homeRequest = 0;   // bumped by every address lookup and by Clear; older lookups are ignored

  // Status line under the address form; red when it reports an error.
  function setStatus(text, isError = false) {
    dom.homeStatus.textContent = text;
    dom.homeStatus.classList.toggle("error", isError);
  }

  // Straight-line distance in km between two points (used when no road route is known).
  function haversineKm(aLat, aLon, bLat, bLon) {
    const EARTH_RADIUS_KM = 6371;
    const rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLon = (bLon - aLon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
  }

  // Looks up an address with Nominatim; resolves to { lat, lon, label, query, city }.
  function geocode(query) {
    const params = new URLSearchParams({ format: "jsonv2", limit: "1", addressdetails: "1", q: query });
    const options = { headers: { Accept: "application/json" } };
    return fetchJson(`${GEOCODE_URL}?${params}`, "Address lookup failed", options).then((hits) => {
      const hit = Array.isArray(hits) ? hits[0] : null;
      const lat = hit ? parseFloat(hit.lat) : NaN;
      const lon = hit ? parseFloat(hit.lon) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error("Address not found. Try adding a city or postcode.");
      }
      const a = hit.address || {};
      return {
        lat,
        lon,
        label: String(hit.display_name || query),
        query,
        city: a.city || a.town || a.village || a.municipality || a.hamlet || ""
      };
    });
  }

  // One OSRM "table" request: home is the single source, every resort a destination.
  function drivingTable(home) {
    const coords = [lonLat(home), ...resorts.map((r) => lonLat(r))].join(";");
    const url = `${TABLE_URL}${coords}?sources=0&annotations=distance,duration`;
    return fetchJson(url, "Routing failed").then((data) => {
      if (data.code !== "Ok") {
        throw new Error(`Routing failed (${data.code})`);
      }
      return { meters: data.distances[0].slice(1), seconds: data.durations[0].slice(1) };
    });
  }

  // Road distance from the routing table, or a straight-line estimate when there is no road route.
  function distanceFor(home, r, i, table) {
    const meters = table ? table.meters[i] : null;
    if (meters != null) {
      return { km: meters / 1000, minutes: table.seconds[i] / 60, approx: false };
    }
    return { km: haversineKm(home.lat, home.lon, r.lat, r.lon), minutes: null, approx: true };
  }

  // Places (or moves) the home pin with a small popup showing the full address.
  function placeHomeMarker(home) {
    removeHomeMarker();
    const icon = pinIcon("home", ICON.home);
    homeMarker = L.marker([home.lat, home.lon], { icon, title: "Home", zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(() => append(el("div", "popup"), el("h3", null, "Home"), el("p", null, home.label)));
  }

  // Removes the home pin, if any.
  function removeHomeMarker() {
    if (homeMarker) {
      homeMarker.remove();
      homeMarker = null;
    }
  }

  // Stores the new home and its distances, then redraws; returns how many are straight-line estimates.
  function applyDistances(home, table) {
    const distances = {};
    let approxCount = 0;
    resorts.forEach((r, i) => {
      distances[r.id] = distanceFor(home, r, i, table);
      if (distances[r.id].approx) {
        approxCount++;
      }
    });
    state.home = home;
    state.distances = distances;

    map.closePopup();   // the home pin's own popup; the old route no longer applies to the new home
    clearRoute();
    placeHomeMarker(home);
    dom.homeClear.hidden = false;
    render();
    return approxCount;
  }

  // Calculates driving distances from a known home position and remembers it in this browser.
  // Falls back to straight-line distances when the routing service is unavailable.
  function calculateFrom(home, request = ++homeRequest) {
    setStatus("Calculating driving distances…");
    return drivingTable(home)
      .catch(() => null)
      .then((table) => {
        if (request !== homeRequest) {
          return;   // a newer address (or Clear) replaced this one
        }
        const approx = applyDistances(home, table);
        if (!table) {
          setStatus(`Routing service unavailable — showing straight-line distances from: ${home.label}`, true);
        } else if (approx) {
          setStatus(`Driving distance from: ${home.label} (${approx} without a road route shown as straight-line)`);
        } else {
          setStatus(`Driving distance from: ${home.label}`);
        }
        storageSet(STORE_HOME, JSON.stringify(home));
      });
  }

  // "Calculate": look up the typed address, then calculate distances from it.
  function onHomeSubmit(ev) {
    ev.preventDefault();
    const query = dom.homeInput.value.trim();
    if (!query) {
      return;
    }
    const request = ++homeRequest;
    dom.homeSubmit.disabled = true;
    setStatus("Looking up address…");
    geocode(query)
      .then((home) => {
        if (request === homeRequest) {
          return calculateFrom(home, request);
        }
        return null;
      })
      .catch((err) => {
        const message = err instanceof NetworkError
          ? "Could not reach the address lookup service. Check your connection and try again."
          : err.message;
        setStatus(message, true);
      })
      .finally(() => {
        dom.homeSubmit.disabled = false;
      });
  }

  // "Clear": forget the home address, its pin, route and distances.
  function onHomeClear() {
    homeRequest++;   // ignore any lookup still running
    state.home = null;
    state.distances = null;
    removeHomeMarker();
    clearRoute();
    storageRemove(STORE_HOME);
    dom.homeInput.value = "";
    dom.homeClear.hidden = true;
    setStatus("");
    render();
  }

  // The address form: Calculate and Clear.
  function bindHomeForm() {
    dom.homeForm.addEventListener("submit", onHomeSubmit);
    dom.homeClear.addEventListener("click", onHomeClear);
  }

  // Restores the home address saved in this browser. The entry is checked and rebuilt field by field,
  // since local storage can hold anything (an old format, or values edited by hand).
  function restoreHome() {
    let saved = null;
    try {
      saved = JSON.parse(storageGet(STORE_HOME) || "null");
    } catch {
      return;   // corrupt entry: ignore it
    }
    if (!saved || !isValidLatLon(saved.lat, saved.lon)) {
      return;
    }
    const home = {
      lat: saved.lat,
      lon: saved.lon,
      label: String(saved.label || saved.query || ""),
      query: String(saved.query || ""),
      city: String(saved.city || "")
    };
    dom.homeInput.value = home.query;
    calculateFrom(home);
  }

  // True for real coordinates.
  function isValidLatLon(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }
  // #endregion

  // #region Local storage
  // Storage can be unavailable (private mode, blocked site data), so every access is guarded.
  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage full or unavailable: the value is simply not remembered.
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable: there is nothing to remove.
    }
  }
  // #endregion

  // #region Start-up
  function init() {
    refreshStatus();
    createMarkers();
    buildTypeChips();
    buildStatusChips();
    TOGGLE_FILTERS.forEach((group) => buildToggleChips(group));
    buildValleySelect();
    bindSearch();
    bindDetails();
    bindHomeForm();
    bindWelcome();

    render();
    map.fitBounds(resorts.map((r) => [r.lat, r.lon]), { padding: [30, 30] });
    showWelcome();
    restoreHome();

    // Keep statuses, timers and countdowns current, and catch up at once when the tab is shown again
    // (browsers slow down timers in background tabs).
    setInterval(render, REFRESH_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        render();
      }
    });

    // Weather for every resort from Open-Meteo, refreshed every half hour.
    fetchWeather();
    setInterval(fetchWeather, WEATHER_REFRESH_MS);
  }

  init();
  // #endregion
})();
