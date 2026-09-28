// Balance solver. Shared by the game (to reveal the answer) and by
// generate.js (to prove every puzzle has exactly one solution).
(function (root) {
  // grid: rows of numbers, 0 = empty square. tray: the weights that go in
  // the empty squares. Finds up to `limit` distinct solutions.
  function solve(grid, tray, target, limit) {
    limit = limit || 2;
    var n = grid.length, holes = [], rowRem = [], colRem = [], rowLeft = [], colLeft = [];
    var i, r, c, v, none = { count: 0, solution: null };
    for (i = 0; i < n; i++) { rowRem[i] = target; colRem[i] = target; rowLeft[i] = 0; colLeft[i] = 0; }
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      v = grid[r][c];
      if (v) { rowRem[r] -= v; colRem[c] -= v; }
      else { holes.push([r, c]); rowLeft[r]++; colLeft[c]++; }
    }
    if (holes.length !== tray.length) return none;
    for (i = 0; i < n; i++) {
      if (rowLeft[i] === 0 && rowRem[i] !== 0) return none;
      if (colLeft[i] === 0 && colRem[i] !== 0) return none;
    }
    var vals = [], cnt = {};
    tray.forEach(function (w) { if (!cnt[w]) { cnt[w] = 0; vals.push(w); } cnt[w]++; });
    vals.sort(function (a, b) { return a - b; });
    var cur = grid.map(function (row) { return row.slice(); });
    var count = 0, solution = null;

    // Can k of the remaining tray weights add up to rem? (bounds check)
    function feasible(rem, k) {
      if (k === 0) return rem === 0;
      var lo = 0, hi = 0, need = k, j, t;
      for (j = 0; j < vals.length && need; j++) { t = Math.min(need, cnt[vals[j]]); lo += t * vals[j]; need -= t; }
      need = k;
      for (j = vals.length - 1; j >= 0 && need; j--) { t = Math.min(need, cnt[vals[j]]); hi += t * vals[j]; need -= t; }
      return rem >= lo && rem <= hi;
    }

    function dfs(h) {
      if (h === holes.length) {
        count++;
        if (!solution) solution = cur.map(function (row) { return row.slice(); });
        return count >= limit;
      }
      var r = holes[h][0], c = holes[h][1], stop = false;
      for (var j = 0; j < vals.length && !stop; j++) {
        var w = vals[j];
        if (!cnt[w] || w > rowRem[r] || w > colRem[c]) continue;
        cnt[w]--; rowRem[r] -= w; colRem[c] -= w; rowLeft[r]--; colLeft[c]--;
        if (feasible(rowRem[r], rowLeft[r]) && feasible(colRem[c], colLeft[c])) {
          cur[r][c] = w;
          stop = dfs(h + 1);
          cur[r][c] = 0;
        }
        cnt[w]++; rowRem[r] += w; colRem[c] += w; rowLeft[r]++; colLeft[c]++;
      }
      return stop;
    }

    dfs(0);
    return { count: count, solution: solution };
  }

  // True if the puzzle can be finished only by filling lines that have a
  // single empty square left. Used to keep early-week puzzles gentle and
  // late-week puzzles harder.
  function singlesOnly(grid, tray, target) {
    var n = grid.length, g = grid.map(function (row) { return row.slice(); }), left = tray.slice();
    for (;;) {
      var holes = 0, moved = false;
      for (var k = 0; k < 2 * n && !moved; k++) {
        var cells = [], sum = 0;
        for (var i = 0; i < n; i++) {
          var r = k < n ? k : i, c = k < n ? i : k - n;
          if (g[r][c]) sum += g[r][c]; else cells.push([r, c]);
        }
        if (cells.length === 1) {
          var need = target - sum, at = left.indexOf(need);
          if (at < 0) return false;
          g[cells[0][0]][cells[0][1]] = need; left.splice(at, 1); moved = true;
        }
      }
      for (var r2 = 0; r2 < n; r2++) for (var c2 = 0; c2 < n; c2++) if (!g[r2][c2]) holes++;
      if (!holes) return true;
      if (!moved) return false;
    }
  }

  var api = { solve: solve, singlesOnly: singlesOnly };
  root.BalanceSolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
