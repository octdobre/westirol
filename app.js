(function () {
  "use strict";

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
  var HOME_SVG = '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>';

  var resorts = window.RESORTS.map(function (r, i) {
    return Object.assign({ id: i }, r);
  });

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
    types: new Set(["gondola"]),
    valley: "all",
    home: null,          // { lat, lon, label }
    distances: null      // id -> { km, minutes, approx }
  };

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

  function pinIcon(cls, svg) {
    return L.divIcon({
      className: "",
      html: '<div class="badge ' + cls + '">' + svg + "</div>",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -16]
    });
  }

  resorts.forEach(function (r) {
    r.marker = L.marker([r.pinLat, r.pinLon], {
      icon: pinIcon(r.type, TYPES[r.type].svg),
      title: r.name,
      alt: TYPES[r.type].label + ": " + r.name
    });
    r.marker.bindPopup(function () { return popupFor(r); });
  });

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDistance(d) {
    return (d.approx ? "≈ " : "") + (d.km < 10 ? d.km.toFixed(1) : Math.round(d.km)) + " km";
  }
  function formatDuration(min) {
    var m = Math.round(min);
    return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  function popupFor(r) {
    var box = el("div", "popup");
    box.appendChild(el("h3", null, r.name));
    box.appendChild(el("p", null, r.valley));
    if (r.address) box.appendChild(el("p", null, r.address));
    box.appendChild(el("span", "tag " + r.type, TYPES[r.type].label));
    var d = state.distances && state.distances[r.id];
    if (d) {
      var text = formatDistance(d) + (d.approx ? " straight-line" : " by car");
      if (d.minutes != null) text += " · " + formatDuration(d.minutes);
      box.appendChild(el("p", null, text));
    }
    var link = el("a", null, state.home ? "Directions on OpenStreetMap" : "Open in OpenStreetMap");
    link.target = "_blank";
    link.rel = "noopener";
    link.href = state.home
      ? "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=" +
        state.home.lat + "," + state.home.lon + ";" + r.lat + "," + r.lon
      : "https://www.openstreetmap.org/?mlat=" + r.lat + "&mlon=" + r.lon + "#map=14/" + r.lat + "/" + r.lon;
    box.appendChild(document.createElement("br"));
    box.appendChild(link);
    return box;
  }

  // ---------- Controls ----------
  var chipsBox = document.getElementById("type-chips");
  var valleySelect = document.getElementById("valley-select");
  var listBox = document.getElementById("resort-list");
  var countBox = document.getElementById("list-count");
  var chipButtons = {};

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

  var valleys = [];
  resorts.forEach(function (r) { if (valleys.indexOf(r.valley) < 0) valleys.push(r.valley); });
  valleySelect.appendChild(new Option("All valleys", "all"));
  valleys.forEach(function (v) { valleySelect.appendChild(new Option(v, v)); });
  valleySelect.addEventListener("change", function () {
    state.valley = valleySelect.value;
    render();
    fitToVisible();
  });

  // ---------- Rendering ----------
  function visibleResorts() {
    var list = resorts.filter(function (r) {
      return state.types.has(r.type) && (state.valley === "all" || r.valley === state.valley);
    });
    if (state.distances) {
      list.sort(function (a, b) { return state.distances[a.id].km - state.distances[b.id].km; });
    }
    return list;
  }

  function render() {
    TYPE_KEYS.forEach(function (key) {
      chipButtons[key].setAttribute("aria-pressed", String(state.types.has(key)));
    });
    var allOn = state.types.size === TYPE_KEYS.length;
    allBtn.setAttribute("aria-pressed", String(allOn));
    allBtn.textContent = allOn ? "Showing all" : "Show all";

    var list = visibleResorts();

    markerLayer.clearLayers();
    list.forEach(function (r) { markerLayer.addLayer(r.marker); });

    listBox.textContent = "";
    countBox.textContent = list.length + " of " + resorts.length +
      (state.distances ? " · nearest first" : "");
    if (!list.length) {
      listBox.appendChild(el("li", "empty", "No resorts match these filters. Pick a lift type above."));
      return;
    }
    list.forEach(function (r) {
      var li = document.createElement("li");
      var btn = el("button", "resort");
      btn.type = "button";
      var badge = el("span", "badge " + r.type);
      badge.innerHTML = TYPES[r.type].svg;
      badge.title = TYPES[r.type].label;
      var text = el("span");
      text.appendChild(el("div", "name", r.name));
      text.appendChild(el("div", "meta", r.valley + (r.address ? " · " + r.address : "")));
      btn.appendChild(badge);
      btn.appendChild(text);
      var d = state.distances && state.distances[r.id];
      if (d) {
        var dist = el("span", "dist", formatDistance(d));
        dist.appendChild(el("small", null, d.minutes != null ? formatDuration(d.minutes) : "straight-line"));
        btn.appendChild(dist);
      }
      btn.addEventListener("click", function () {
        map.flyTo([r.pinLat, r.pinLon], Math.max(map.getZoom(), 13), { duration: 0.6 });
        r.marker.openPopup();
      });
      li.appendChild(btn);
      listBox.appendChild(li);
    });
  }

  function fitToVisible() {
    var pts = visibleResorts().map(function (r) { return [r.pinLat, r.pinLon]; });
    if (!pts.length) pts = resorts.map(function (r) { return [r.lat, r.lon]; });
    map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  }

  // ---------- Distance from home ----------
  var form = document.getElementById("home-form");
  var input = document.getElementById("home-input");
  var submitBtn = document.getElementById("home-submit");
  var clearBtn = document.getElementById("home-clear");
  var statusBox = document.getElementById("home-status");

  function setStatus(text, isError) {
    statusBox.textContent = text;
    statusBox.classList.toggle("error", !!isError);
  }

  function haversineKm(aLat, aLon, bLat, bLon) {
    var rad = Math.PI / 180;
    var dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  function geocode(query) {
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query);
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("Address lookup failed (" + res.status + ")");
        return res.json();
      })
      .then(function (hits) {
        if (!hits.length) throw new Error("Address not found. Try adding a city or postcode.");
        return { lat: parseFloat(hits[0].lat), lon: parseFloat(hits[0].lon), label: hits[0].display_name };
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

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var query = input.value.trim();
    if (!query) return;
    submitBtn.disabled = true;
    setStatus("Looking up address…");
    geocode(query)
      .then(function (home) {
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
        );
      })
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
    input.value = "";
    clearBtn.hidden = true;
    setStatus("");
    render();
  });

  // ---------- Start ----------
  render();
  map.fitBounds(resorts.map(function (r) { return [r.lat, r.lon]; }), { padding: [30, 30] });
})();
