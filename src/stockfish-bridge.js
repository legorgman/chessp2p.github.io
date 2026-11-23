(function (global) {
  'use strict';

  var ChessApp = global.ChessApp = global.ChessApp || {};

  function StockfishBridge(callbacks) {
    this.cb = callbacks || {};
    this.worker = null;
    this.blobUrl = null;
    this.ready = false;
    this.searchId = 0;
    this.threatSearchId = 0;
    this._mode = 'main'; // 'main' | 'threat'
    this._currentFen = '';
    this._lines = {};
    this._currentDepth = 0;
    this._pendingMain = null;
    this._pendingThreat = null;
    this._respawnCount = 0;

    this._bootWorker();
  }

  StockfishBridge.prototype._bootWorker = function () {
    if (!global.__STOCKFISH_SRC__) {
      if (this.cb.onError) this.cb.onError('Stockfish bundle not found.');
      return;
    }
    try {
      if (this.worker) {
        try { this.worker.terminate(); } catch (e) {}
      }
      if (this.blobUrl) {
        try { URL.revokeObjectURL(this.blobUrl); } catch (e) {}
      }
      var blob = new Blob([global.__STOCKFISH_SRC__], { type: 'application/javascript' });
      this.blobUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.blobUrl);
      this.ready = false;

      var self = this;
      this.worker.onmessage = function (ev) {
        self._onLine(String(ev.data || ''));
      };
      this.worker.onerror = function (err) {
        self._handleWorkerError(err);
      };
      this._send('uci');
    } catch (err) {
      if (this.cb.onError) this.cb.onError('Failed to start Stockfish worker: ' + err.message);
    }
  };

  StockfishBridge.prototype._handleWorkerError = function (err) {
    if (this._respawnCount < 3) {
      this._respawnCount++;
      this._bootWorker();
    } else if (this.cb.onError) {
      this.cb.onError('Stockfish worker error: ' + ((err && err.message) || 'unknown'));
    }
  };

  StockfishBridge.prototype._send = function (cmd) {
    if (this.worker) {
      this.worker.postMessage(cmd);
    }
  };

  StockfishBridge.prototype._onLine = function (line) {
    if (line === 'uciok') {
      this._send('setoption name MultiPV value 3');
      this._send('isready');
      return;
    }
    if (line === 'readyok') {
      this.ready = true;
      if (this.cb.onReady) this.cb.onReady();
      if (this._pendingMain) {
        var pm = this._pendingMain;
        this._pendingMain = null;
        this.analyze(pm.fen, pm.opts);
      }
      return;
    }

    if (line.indexOf('info ') === 0 && line.indexOf(' pv ') !== -1 && line.indexOf(' score ') !== -1) {
      this._parseInfoLine(line);
      return;
    }

    if (line.indexOf('bestmove ') === 0) {
      var parts = line.split(/\s+/);
      var bm = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
      if (this._mode === 'main') {
        if (this.cb.onBestMove) {
          this.cb.onBestMove({
            searchId: this.searchId,
            fen: this._currentFen,
            bestMoveUci: bm,
            lines: this._sortedLines(),
            depth: this._currentDepth
          });
        }
        // Start queued threat check if requested
        if (this._pendingThreat) {
          var th = this._pendingThreat;
          this._pendingThreat = null;
          this._runThreatSearch(th.fen, th.depth);
        }
      } else if (this._mode === 'threat') {
        if (this.cb.onThreat && bm) {
          this.cb.onThreat({ fen: this._currentFen, threatUci: bm });
        }
      }
    }
  };

  StockfishBridge.prototype._parseInfoLine = function (line) {
    var depthMatch = line.match(/\bdepth\s+(\d+)/);
    var mpvMatch = line.match(/\bmultipv\s+(\d+)/);
    var scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    var pvMatch = line.match(/\bpv\s+(.+)$/);
    if (!scoreMatch || !pvMatch) return;

    var depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
    var multipv = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
    var scoreType = scoreMatch[1];
    var scoreVal = parseInt(scoreMatch[2], 10);
    var pvUci = pvMatch[1].trim().split(/\s+/);

    // Normalize evaluation strictly to White's perspective!
    var activeColor = (this._currentFen.split(/\s+/)[1] || 'w');
    var sign = activeColor === 'b' ? -1 : 1;
    var whiteCp = scoreType === 'cp' ? scoreVal * sign : null;
    var whiteMate = scoreType === 'mate' ? scoreVal * sign : null;

    if (this._mode === 'main') {
      if (depth > this._currentDepth) this._currentDepth = depth;
      this._lines[multipv] = {
        multipv: multipv,
        depth: depth,
        scoreType: scoreType,
        scoreValue: scoreVal,
        whiteCp: whiteCp,
        whiteMate: whiteMate,
        pvUci: pvUci,
        bestMoveUci: pvUci[0]
      };
      if (this.cb.onUpdate) {
        this.cb.onUpdate({
          searchId: this.searchId,
          fen: this._currentFen,
          depth: this._currentDepth,
          lines: this._sortedLines()
        });
      }
    }
  };

  StockfishBridge.prototype._sortedLines = function () {
    var keys = Object.keys(this._lines).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      out.push(this._lines[keys[i]]);
    }
    return out;
  };

  StockfishBridge.prototype.stop = function () {
    this._pendingThreat = null;
    this._send('stop');
  };

  StockfishBridge.prototype.analyze = function (fen, opts) {
    opts = opts || {};
    if (!ChessApp.Engine.isValidStockfishFEN(fen)) {
      this._pendingThreat = null;
      this._send('stop');
      if (this.cb.onInvalidPosition) this.cb.onInvalidPosition(fen);
      return false;
    }

    if (!this.ready) {
      this._pendingMain = { fen: fen, opts: opts };
      return true;
    }

    var depth = Math.min(20, Math.max(4, opts.depth || 14));
    var multipv = Math.min(3, Math.max(1, opts.multipv || 3));
    var skill = Math.min(20, Math.max(0, opts.skillLevel !== undefined ? opts.skillLevel : 20));

    this.searchId++;
    this._mode = 'main';
    this._currentFen = fen;
    this._lines = {};
    this._currentDepth = 0;
    this._pendingThreat = opts.threatFen ? { fen: opts.threatFen, depth: Math.min(10, depth) } : null;

    this._send('stop');
    this._send('setoption name Skill Level value ' + skill);
    this._send('setoption name MultiPV value ' + multipv);
    this._send('position fen ' + fen);
    this._send('go depth ' + depth);
    return true;
  };

  StockfishBridge.prototype._runThreatSearch = function (threatFen, depth) {
    if (!ChessApp.Engine.isValidStockfishFEN(threatFen)) return;
    this._mode = 'threat';
    this._currentFen = threatFen;
    this._send('stop');
    this._send('setoption name Skill Level value 20');
    this._send('setoption name MultiPV value 1');
    this._send('position fen ' + threatFen);
    this._send('go depth ' + (depth || 8));
  };

  StockfishBridge.buildThreatFEN = function (fen) {
    var parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 4) return null;
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    var candidate = parts.join(' ');
    return ChessApp.Engine.isValidStockfishFEN(candidate) ? candidate : null;
  };

  StockfishBridge.formatScore = function (line) {
    if (!line) return '0.0';
    if (line.whiteMate !== null && line.whiteMate !== undefined) {
      return (line.whiteMate > 0 ? '+M' : '-M') + Math.abs(line.whiteMate);
    }
    var pawns = (line.whiteCp || 0) / 100;
    return (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
  };

  StockfishBridge.evalBarPercent = function (line) {
    if (!line) return 50;
    if (line.whiteMate !== null && line.whiteMate !== undefined) {
      return line.whiteMate > 0 ? 97 : 3;
    }
    var cp = line.whiteCp || 0;
    // Smooth logistic curve mapped to 5%..95%
    var pct = 50 + 45 * (2 / (1 + Math.exp(-0.0038 * cp)) - 1);
    return Math.min(96, Math.max(4, pct));
  };

  ChessApp.StockfishBridge = StockfishBridge;
})(window);
