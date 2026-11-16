// Generated from westirol.txt — West Tirol ski resorts, season 2026/27.
//
// type:        "gondola" (untagged in the source), "chairlift" (JUST CHAIRLIFT), "tbar" (JUST T-BAR LIFT)
// open/close:  daily lift hours "HH:MM", or null when unknown
// seasonStart: "YYYY-MM-DD", or null for "Unknown Start Date"
// seasonEnd:   "YYYY-MM-DD", or null for "Snow Ends"
// startLabel/endLabel: original wording when the source gives no exact date
// parking:     euros per day, 0 = gratis

// Used for calculations only (never displayed) when a season date is unknown.
window.SEASON_DEFAULTS = { start: "2026-12-15", end: "2027-02-28" };

window.RESORTS = [
  // Lechtal
  { name: "Stanzach Familienskigebiet", valley: "Lechtal", address: "Stanzach 55a, 6642 Stanzach", lat: 47.379558, lon: 10.559589, type: "tbar", open: "09:00", close: "16:00", seasonStart: "2026-12-19", seasonEnd: "2027-03-07", parking: 0 },
  { name: "Knittel Skilifte", valley: "Lechtal", address: "Untergiblen 15, 6652 Elbigenalp", lat: 47.284697, lon: 10.425449, type: "tbar", open: "10:00", close: "16:00", seasonStart: "2026-12-18", seasonEnd: null, parking: 0 },

  // Tannheimer Tal
  { name: "Nesselwängle Lifte", valley: "Tannheimer Tal", address: "Nesselwängle 92, 6672 Nesselwängle", lat: 47.486201, lon: 10.603185, type: "chairlift", open: "09:15", close: "16:00", seasonStart: null, seasonEnd: null, parking: 5 },
  { name: "Tannheimer Tal Bergbahnen", valley: "Tannheimer Tal", address: "Bergbahnweg 12, 6675 Tannheim", lat: 47.499433, lon: 10.524924, type: "gondola", open: "08:45", close: "16:15", seasonStart: "2026-12-19", seasonEnd: "2027-03-29", parking: 5 },

  // Reutte
  { name: "Waldrast Lift", valley: "Reutte", address: "Krankenhausstraße 169, 6600 Ehenbichl", lat: 47.471811, lon: 10.718662, type: "tbar", open: "09:30", close: "16:00", seasonStart: null, seasonEnd: null, parking: 0 },
  { name: "Höfen Schollenwiesenlift", valley: "Reutte", address: "Schiliftweg 5, 6604 Höfen", lat: 47.470355, lon: 10.680779, type: "tbar", open: null, close: null, seasonStart: null, seasonEnd: null, parking: 0 },
  { name: "Hahnenkamm Reuttener Bergwelt Seilbahnen", valley: "Reutte", address: "Bergbahnstraße 18, 6604 Höfen", lat: 47.478174, lon: 10.679516, type: "gondola", open: "08:30", close: "16:00", seasonStart: "2026-11-27", seasonEnd: null, parking: 5 },

  // Lermos - Reutte
  { name: "Grünberg Obsteig Skilift", valley: "Lermos - Reutte", address: "Finsterfiecht 49, 6416 Obsteig", lat: 47.292788, lon: 10.915657, type: "tbar", open: "09:30", close: "16:00", seasonStart: null, seasonEnd: null, parking: 0 },
  { name: "Marienbergbahnen Biberwier", valley: "Lermos - Reutte", address: "Marienbergweg 16, 6633 Biberwier", lat: 47.372787, lon: 10.888374, type: "gondola", open: "08:30", close: "16:30", seasonStart: "2026-12-18", seasonEnd: "2027-03-29", parking: 0 },
  { name: "Grubigsteinbahnen Lermoos", valley: "Lermos - Reutte", address: "Juch 3, 6631 Leermos", lat: 47.401604, lon: 10.878825, type: "gondola", open: "08:30", close: "16:30", seasonStart: "2026-12-11", seasonEnd: "2027-04-04", parking: 0 },
  { name: "Ehrwalder Almbahn", valley: "Lermos - Reutte", address: "Dr. Ludwig Ganghoferstraße 66, 6632 Ehrwald", lat: 47.388003, lon: 10.937855, type: "gondola", open: "08:00", close: "16:30", seasonStart: "2026-12-11", seasonEnd: "2027-04-04", parking: 5 },
  { name: "Wettersteinbahnen Ehrwald", valley: "Lermos - Reutte", address: "Ebne 50, A-6632 Ehrwald", lat: 47.407637, lon: 10.927955, type: "gondola", open: "08:30", close: "16:30", seasonStart: "2026-12-18", seasonEnd: "2027-03-14", parking: 5 },
  { name: "Tiroler Zugspitzbahn", valley: "Lermos - Reutte", address: "Obermoos 1, 6632 Ehrwald", lat: 47.426178, lon: 10.941905, type: "gondola", open: "08:40", close: "16:40", seasonStart: "2026-12-04", seasonEnd: "2027-04-04", parking: 5 },
  { name: "Berwang/Bichlbach Bergbahnen", valley: "Lermos - Reutte", address: "Berwang 120, 6622 Berwang", lat: 47.409334, lon: 10.752651, type: "gondola", open: "08:50", close: "16:15", seasonStart: "2026-12-18", seasonEnd: "2027-04-04", parking: 0 },

  // Seefeld
  { name: "Gschwandtkopflifte Seefeld", valley: "Seefeld", address: "Gschwandtkopf 702, 6100 Seefeld in Tirol", lat: 47.325132, lon: 11.179345, type: "chairlift", open: "09:00", close: "16:30", seasonStart: "2026-12-11", seasonEnd: "2027-03-21", parking: 0 },
  { name: "Birkenlift Seefeld", valley: "Seefeld", address: "Leutascher Str. 634, 6100 Seefeld in Tirol", lat: 47.337145, lon: 11.178903, type: "tbar", open: "09:00", close: "16:00", seasonStart: "2026-12-18", seasonEnd: null, parking: 0 },

  // Inntal
  { name: "Tarrenz Bungerlochlift", valley: "Inntal", address: "Schulgasse 30, 6464 Tarrenz", lat: 47.268106, lon: 10.755253, type: "tbar", open: "11:00", close: "16:00", seasonStart: "2026-12-31", startLabel: "End of December", seasonEnd: "2027-02-28", endLabel: "End of February", parking: 0 },
  { name: "Galtwiesenlift", valley: "Inntal", address: "6471 Wald", lat: 47.196318, lon: 10.784336, type: "tbar", open: "10:00", close: "16:00", seasonStart: "2026-12-31", startLabel: "End of December", seasonEnd: "2027-02-28", endLabel: "End of February", parking: 0 },
  { name: "Imster Bergbahnen", valley: "Inntal", address: "Hoch-Imst 19, 6460 Gemeinde Imst", lat: 47.241140, lon: 10.723525, type: "gondola", open: "09:00", close: "16:00", seasonStart: "2026-12-19", seasonEnd: "2027-03-14", parking: 0 },
  { name: "Venet Bergbahnen", valley: "Inntal", address: "Hauptstraße 38, 6511 Zams", lat: 47.153783, lon: 10.585429, type: "gondola", open: "09:00", close: "16:00", seasonStart: "2026-12-20", seasonEnd: null, parking: 0 },
  { name: "Zams Riefenlift", valley: "Inntal", address: "Rifenalbahn Talstation, 6511 Zams", lat: 47.164190, lon: 10.599803, type: "gondola", open: null, close: null, seasonStart: null, seasonEnd: null, parking: 0 },
  { name: "Tobadill Skilift", valley: "Inntal", address: "Schützen, 6552 Tobadill", lat: 47.123556, lon: 10.515708, type: "tbar", open: null, close: null, seasonStart: null, seasonEnd: null, parking: 0 },

  // Oetztal
  { name: "Hochoetz Bergbahnen", valley: "Oetztal", address: "Angerweg 13, 6433 Oetz", lat: 47.1995152, lon: 10.9026463, type: "gondola", open: "08:30", close: "16:00", seasonStart: "2026-12-04", seasonEnd: "2027-04-11", parking: 5 },
  { name: "Balbach Wiesenlift", valley: "Oetztal", address: "Ochsengarten, 6433 Oetz", lat: 47.227430, lon: 10.932330, type: "tbar", open: "08:30", close: "16:00", seasonStart: "2026-12-04", seasonEnd: "2027-04-11", parking: 5 },
  { name: "Niederthai Skilifte", valley: "Oetztal", address: "Am Tauferberg, 6441 Umhausen", lat: 47.128376, lon: 10.968237, type: "tbar", open: "10:00", close: "16:00", seasonStart: "2026-12-12", seasonEnd: "2027-04-04", parking: 0 },
  { name: "Sölden Bergbahnen, Ötztaler Gletscher", valley: "Oetztal", address: "Dorfstraße 115, 6450 Sölden", lat: 46.9598334, lon: 11.0068136, type: "gondola", open: "09:00", close: "16:00", seasonStart: "2026-10-09", seasonEnd: "2027-05-02", parking: 10 },
  { name: "Obergurgl Hochgurgl Bergbahnen", valley: "Oetztal", address: "Gurglerstraße 49, 6456 Gurgl", lat: 46.8982418, lon: 11.0401245, type: "gondola", open: "09:00", close: "16:00", seasonStart: "2026-11-19", seasonEnd: "2027-04-18", parking: 0 },
  { name: "Vent Skigebiet", valley: "Oetztal", address: "Franz-Senn-Weg 21, 6458 Vent", lat: 46.860002, lon: 10.914751, type: "gondola", open: "09:30", close: "16:00", seasonStart: "2026-12-19", seasonEnd: "2027-04-02", parking: 6 },

  // Piztal
  { name: "Hochzeiger Bergbahnen", valley: "Piztal", address: "Liß 270, 6474 Jerzens", lat: 47.153117, lon: 10.756806, type: "gondola", open: "08:45", close: "16:30", seasonStart: "2026-12-04", seasonEnd: "2027-04-04", parking: 0 },
  { name: "Mandarfen Übungslift", valley: "Piztal", address: "Mandarfen 89, 6481 Plangeroß", lat: 46.968410, lon: 10.870650, type: "tbar", open: "08:30", close: "16:00", seasonStart: "2026-09-26", seasonEnd: "2027-05-02", parking: 0 },
  { name: "Rifflsee Bergbahnen", valley: "Piztal", address: "Mandarfen 89, 6481 Plangeroß", lat: 46.968410, lon: 10.870650, type: "gondola", open: "08:30", close: "16:00", seasonStart: "2026-09-26", seasonEnd: "2027-05-02", parking: 0 },
  { name: "Pitztaler Gletscher", valley: "Piztal", address: "Mittelberg 103, 6481 St. Leonhard im Pitztal", lat: 46.958823, lon: 10.871508, type: "gondola", open: "08:00", close: "16:30", seasonStart: "2026-09-26", seasonEnd: "2027-05-02", parking: 0 },

  // Kaunertal
  { name: "Kaunertaler Gletscherbahnen", valley: "Kaunertal", address: "", lat: 46.886686, lon: 10.719824, type: "gondola", open: "09:00", close: "16:00", seasonStart: "2026-10-17", seasonEnd: "2027-05-17", parking: 0 },

  // Oberinntal
  { name: "Fendels Bergbahnen", valley: "Oberinntal", address: "Ried 302, 6531 Ried im Oberinntal", lat: 47.057471, lon: 10.660558, type: "gondola", open: "09:00", close: "16:45", seasonStart: "2026-12-18", seasonEnd: "2027-03-28", parking: 0 },
  { name: "Serfaus-Fiss-Ladis Bergbahnen", valley: "Oberinntal", address: "L286 73, 6532 Ladis", lat: 47.0697738, lon: 10.6463075, type: "gondola", open: "08:30", close: "16:20", seasonStart: "2026-12-04", seasonEnd: "2027-04-04", parking: 6 },
  { name: "Nauders Bergbahnen", valley: "Oberinntal", address: "Gewerbegebiet 1, 6543 Nauders", lat: 46.874874, lon: 10.508305, type: "gondola", open: "08:00", close: "17:00", seasonStart: "2026-12-11", seasonEnd: "2027-04-04", parking: 0 },

  // Paznauntal
  { name: "See Bergbahnen", valley: "Paznauntal", address: "Silvretta Straße 178, 6553 See", lat: 47.08259, lon: 10.463563, type: "gondola", open: "08:30", close: "16:00", seasonStart: "2026-12-11", seasonEnd: "2027-04-04", parking: 0 },
  { name: "Kappl Bergbahnen", valley: "Paznauntal", address: "Au 483, 6555 Kappl", lat: 47.060830, lon: 10.375490, type: "gondola", open: "08:30", close: "16:00", seasonStart: "2026-12-11", seasonEnd: "2027-04-04", parking: 0 },
  { name: "Ischgl Silvrettaseilbahn", valley: "Paznauntal", address: "6561 Ischgl", lat: 47.011773, lon: 10.287720, type: "gondola", open: "08:00", close: "16:30", seasonStart: "2026-11-26", seasonEnd: "2027-05-02", parking: 5 },
  { name: "Galtür Bergbahnen", valley: "Paznauntal", address: "Galtür 39, 6563 Galtür", lat: 46.965604, lon: 10.164282, type: "gondola", open: "08:45", close: "16:00", seasonStart: "2026-12-04", seasonEnd: "2027-04-11", parking: 0 }
];
