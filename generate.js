#!/usr/bin/env node
// Builds puzzles.js.
//
//   node generate.js           generate WEEKS weeks of puzzles
//   node generate.js 12        generate 12 weeks
//   node generate.js --check   re-verify the puzzles already in puzzles.js
//
// Writes two sets: PUZZLES, the real daily schedule, and PRACTICE, a
// separate set played in preview mode before launch. Practice puzzles never
// appear in the real schedule, so launch day is always a fresh puzzle.
//
// Puzzles are grouped by weekday so difficulty always matches the day,
// whatever launch date is set in index.html. Each puzzle is checked to have
// exactly one solution before it is written.

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var S = require("./solver.js");

var WEEKS = 8;
var PRACTICE_WEEKS = 2;
var SEED = 71305;            // real schedule; change to get a different set
var PRACTICE_SEED = 42017;   // practice set; must differ from SEED

// Keys follow JavaScript's getDay(): 0 = Sunday ... 6 = Saturday.
// holes = empty squares. dups = how many repeated weights the tray may have.
// singles: true = solvable by filling one-gap lines only (gentle),
//          false = needs more than that (harder), null = either.
var LEVELS = {
  1: { day: "Monday",    n: 4, holes: 5,  dups: [0, 0], singles: true  },
  2: { day: "Tuesday",   n: 4, holes: 6,  dups: [0, 0], singles: true  },
  3: { day: "Wednesday", n: 4, holes: 7,  dups: [0, 1], singles: null  },
  4: { day: "Thursday",  n: 4, holes: 8,  dups: [1, 2], singles: false },
  5: { day: "Friday",    n: 5, holes: 10, dups: [1, 3], singles: false },
  6: { day: "Saturday",  n: 5, holes: 12, dups: [2, 4], singles: false },
  0: { day: "Sunday",    n: 5, holes: 14, dups: [3, 6], singles: false }
};

function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var rand;
function int(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

// A random n x n grid of weights 1-9 where every row and column adds to target.
function solvedGrid(n, target) {
  for (var tries = 0; tries < 100000; tries++) {
    var g = [], ok = true, r, c;
    for (r = 0; r < n - 1; r++) { g.push([]); for (c = 0; c < n - 1; c++) g[r].push(int(1, 9)); }
    for (r = 0; r < n - 1 && ok; r++) {
      var last = target - g[r].reduce(function (a, b) { return a + b; }, 0);
      if (last < 1 || last > 9) ok = false; else g[r].push(last);
    }
    if (!ok) continue;
    var bottom = [];
    for (c = 0; c < n; c++) {
      var s = 0; for (r = 0; r < n - 1; r++) s += g[r][c];
      var v = target - s;
      if (v < 1 || v > 9) { ok = false; break; }
      bottom.push(v);
    }
    if (!ok) continue;
    g.push(bottom);
    return g;
  }
  return null;
}

function dupCount(tray) { var seen = {}, d = 0; tray.forEach(function (v) { if (seen[v]) d++; seen[v] = 1; }); return d; }

function makePuzzle(L) {
  for (var attempt = 0; attempt < 5000; attempt++) {
    var target = int(5 * L.n - 3, 5 * L.n + 3);
    var sol = solvedGrid(L.n, target);
    if (!sol) continue;
    var grid = sol.map(function (r) { return r.slice(); }), tray = [];
    var cells = [];
    for (var r = 0; r < L.n; r++) for (var c = 0; c < L.n; c++) cells.push([r, c]);
    shuffle(cells);
    // Empty squares one at a time, keeping the solution unique.
    for (var k = 0; k < cells.length && tray.length < L.holes; k++) {
      var rr = cells[k][0], cc = cells[k][1], v = grid[rr][cc];
      grid[rr][cc] = 0; tray.push(v);
      if (dupCount(tray) > L.dups[1] || S.solve(grid, tray, target, 2).count !== 1) { grid[rr][cc] = v; tray.pop(); }
    }
    if (tray.length !== L.holes) continue;
    var d = dupCount(tray);
    if (d < L.dups[0] || d > L.dups[1]) continue;
    if (L.singles !== null && S.singlesOnly(grid, tray, target) !== L.singles) continue;
    // Every row and column should have at least one empty square to work on.
    var busy = true;
    for (var i = 0; i < L.n; i++) {
      var rowHas = false, colHas = false;
      for (var j = 0; j < L.n; j++) { if (!grid[i][j]) rowHas = true; if (!grid[j][i]) colHas = true; }
      if (!rowHas || !colHas) busy = false;
    }
    if (!busy) continue;
    return { target: target, grid: grid, tray: tray.sort(function (a, b) { return a - b; }) };
  }
  throw new Error("Could not build a " + L.day + " puzzle; loosen LEVELS.");
}

function verify(p) {
  var n = p.grid.length, holes = 0;
  p.grid.forEach(function (row) { if (row.length !== n) throw new Error("grid not square"); row.forEach(function (v) { if (!v) holes++; }); });
  if (holes !== p.tray.length) throw new Error("tray size does not match empty squares");
  return S.solve(p.grid, p.tray, p.target, 2).count === 1;
}

function block(name, P) {
  var out = "window." + name + " = {\n";
  [1, 2, 3, 4, 5, 6, 0].forEach(function (k, idx) {
    out += "  // " + LEVELS[k].day + "\n  \"" + k + "\": [\n";
    out += P[k].map(function (p) { return "    " + JSON.stringify(p); }).join(",\n");
    out += "\n  ]" + (idx < 6 ? "," : "") + "\n";
  });
  return out + "};\n";
}

function write(P, R) {
  var out = "// Generated by generate.js. Run `node generate.js` to rebuild, `node generate.js --check` to re-verify.\n" +
    "// Grouped by weekday (0 = Sunday ... 6 = Saturday). Week w of the game plays PUZZLES[weekday][w].\n" +
    "// grid: 0 = empty square. tray: the weights that fill the empty squares. Every puzzle has exactly one solution.\n" +
    "// PRACTICE is played in preview mode before launch and never appears in PUZZLES.\n\n" +
    block("PUZZLES", P) + "\n" + block("PRACTICE", R);
  fs.writeFileSync(path.join(__dirname, "puzzles.js"), out);
}

function build(seed, weeks, avoid) {
  rand = rng(seed);
  var P = {};
  [1, 2, 3, 4, 5, 6, 0].forEach(function (k) {
    P[k] = [];
    while (P[k].length < weeks) {
      var p = makePuzzle(LEVELS[k]), key = JSON.stringify(p.grid);
      if (avoid[key]) continue;
      if (!verify(p)) throw new Error("verification failed");
      avoid[key] = true;
      P[k].push(p);
    }
  });
  return P;
}

function load() {
  var ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "puzzles.js"), "utf8"), ctx);
  return ctx.window;
}

if (process.argv[2] === "--check") {
  var W = load(), bad = 0, total = 0, seen = {};
  if (!W.PRACTICE) { console.log("puzzles.js has no PRACTICE set. Run node generate.js."); process.exit(1); }
  [["PUZZLES", W.PUZZLES], ["PRACTICE", W.PRACTICE]].forEach(function (set) {
    Object.keys(set[1]).forEach(function (k) {
      set[1][k].forEach(function (p, w) {
        total++;
        var where = set[0] + " " + LEVELS[k].day + " week " + (w + 1), key = JSON.stringify(p.grid);
        if (!verify(p)) { bad++; console.log("NOT UNIQUE: " + where); }
        if (seen[key]) { bad++; console.log("DUPLICATE: " + where + " repeats " + seen[key]); }
        seen[key] = where;
      });
    });
  });
  var weeks = Math.min.apply(null, Object.keys(W.PUZZLES).map(function (k) { return W.PUZZLES[k].length; }));
  console.log(total + " puzzles checked, " + bad + " problems. " + weeks + " full weeks scheduled, practice set kept separate.");
  process.exit(bad ? 1 : 0);
} else {
  if (SEED === PRACTICE_SEED) throw new Error("SEED and PRACTICE_SEED must differ.");
  var weeks = parseInt(process.argv[2], 10) || WEEKS, t0 = Date.now(), avoid = {};
  var P = build(SEED, weeks, avoid);
  var R = build(PRACTICE_SEED, PRACTICE_WEEKS, avoid);
  [1, 2, 3, 4, 5, 6, 0].forEach(function (k) {
    var L = LEVELS[k];
    console.log(L.day + ": " + weeks + " puzzles + " + PRACTICE_WEEKS + " practice, " + L.n + "x" + L.n + ", " + L.holes + " empty squares");
  });
  write(P, R);
  console.log("Wrote puzzles.js (" + weeks * 7 + " days, " + PRACTICE_WEEKS * 7 + " practice) in " + ((Date.now() - t0) / 1000).toFixed(1) + "s. Every puzzle has exactly one solution.");
}
