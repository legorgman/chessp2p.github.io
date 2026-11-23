(function (global) {
  'use strict';

  var ChessApp = global.ChessApp = global.ChessApp || {};

  function AdminController(app) {
    this.app = app;
    this.stealth = false;
    this.state = {
      evalBar: true,
      arrows: true,
      threatArrow: false,
      depth: 14,
      skillLevel: 20,
      autoPilot: false,
      blunderGuard: false,
      puppetMode: 'off', // 'off' | 'force_turn' | 'stealth_nudge'
      freeMove: false,
      doubleTurn: false,
      sculptTool: null, // null | 'spawn' | 'transform' | 'vanish' | 'swap' | 'glue'
      sculptColor: 'w',
      sculptPiece: 'q',
      swapFirstSq: null,
      timeWarp: false,
      drunkActive: false
    };

    this.lastAnalysis = null;
    this.lastThreatUci = null;
    this._guardBypassKey = null;
    this._autoTimer = null;

    this._mountUI();
    this._initStockfish();
    this._registerHooks();
    this._bindEvents();
    this.refreshAnalysis();
  }

  AdminController.prototype._mountUI = function () {
    // Eval bar inside #eval-bar-slot
    this.evalSlot = document.getElementById('eval-bar-slot');
    if (this.evalSlot) {
      this.evalSlot.classList.remove('hidden');
      this.evalSlot.innerHTML =
        '<div class="eval-bar" id="admin-eval-bar">' +
          '<div class="eval-fill-white" id="admin-eval-fill" style="height: 50%"></div>' +
          '<span class="eval-label" id="admin-eval-label">0.0</span>' +
        '</div>';
    }

    // Admin Dock inside #admin-dock
    this.dock = document.getElementById('admin-dock');
    if (!this.dock) return;

    this.dock.innerHTML = [
      '<div class="admin-header">',
      '  <div class="admin-title"><span class="admin-crown">♛</span> Admin Deck</div>',
      '  <button type="button" class="btn btn-ghost btn-xs" id="btn-admin-stealth" title="Stealth Panic (Ctrl+Shift+A)">Hide (Ctrl+Shift+A)</button>',
      '</div>',
      '<div class="admin-tabs">',
      '  <button type="button" class="admin-tab active" data-atab="engine">Stockfish</button>',
      '  <button type="button" class="admin-tab" data-atab="god">God Mode</button>',
      '  <button type="button" class="admin-tab" data-atab="chaos">Chaos</button>',
      '</div>',

      // TAB 1: STOCKFISH
      '<div class="admin-pane active" data-apane="engine">',
      '  <div class="admin-status-row">',
      '    <span class="sf-badge" id="sf-status-badge">Booting Stockfish 10...</span>',
      '    <span class="sf-depth" id="sf-depth-label">d0</span>',
      '  </div>',
      '  <div class="admin-grid-2">',
      '    <label class="toggle-chip"><input type="checkbox" id="chk-eval-bar" checked> Eval Bar</label>',
      '    <label class="toggle-chip"><input type="checkbox" id="chk-sf-arrows" checked> Best Arrows</label>',
      '    <label class="toggle-chip"><input type="checkbox" id="chk-threat-arrow"> Threat Arrow</label>',
      '    <label class="toggle-chip"><input type="checkbox" id="chk-blunder-guard"> Blunder Guard</label>',
      '  </div>',
      '  <div class="admin-control-row">',
      '    <label>Depth: <strong id="lbl-sf-depth">14</strong></label>',
      '    <input type="range" id="rng-sf-depth" min="8" max="20" value="14">',
      '  </div>',
      '  <div class="admin-control-row">',
      '    <label>Skill</label>',
      '    <select id="sel-sf-skill">',
      '      <option value="20" selected>3100 GM (Full)</option>',
      '      <option value="15">2500 Master</option>',
      '      <option value="10">2000 Club</option>',
      '      <option value="5">1600 Casual</option>',
      '    </select>',
      '  </div>',
      '  <div class="sf-lines" id="sf-lines-box"><div class="sf-line-empty">Analyzing position...</div></div>',
      '  <div class="admin-btn-row">',
      '    <button type="button" class="btn btn-primary btn-sm" id="btn-play-best">⚡ Play Best Move</button>',
      '    <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-autopilot">Auto-Pilot: OFF</button>',
      '  </div>',
      '</div>',

      // TAB 2: GOD MODE
      '<div class="admin-pane" data-apane="god">',
      '  <div class="admin-section-label">Puppet Master (Move Any Piece)</div>',
      '  <div class="admin-btn-row">',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-puppet-turn" data-puppet="force_turn">Force Enemy Move</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-puppet-nudge" data-puppet="stealth_nudge">Stealth Nudge</button>',
      '  </div>',
      '  <div class="admin-grid-2" style="margin-top:8px">',
      '    <label class="toggle-chip"><input type="checkbox" id="chk-free-move"> Free Move</label>',
      '    <label class="toggle-chip"><input type="checkbox" id="chk-double-turn"> Keep Turn</label>',
      '  </div>',
      '  <div class="admin-btn-row" style="margin-top:8px">',
      '    <button type="button" class="btn btn-ghost btn-xs" id="btn-undo-1">↶ Silent Undo 1</button>',
      '    <button type="button" class="btn btn-ghost btn-xs" id="btn-undo-2">↶ Silent Undo 2</button>',
      '  </div>',
      '  <div class="admin-section-label" style="margin-top:12px">Board Sculptor (Click Tool → Click Board)</div>',
      '  <div class="sculpt-palette">',
      '    <select id="sel-sculpt-color"><option value="w">White</option><option value="b">Black</option></select>',
      '    <select id="sel-sculpt-piece"><option value="q">Queen</option><option value="r">Rook</option><option value="b">Bishop</option><option value="n">Knight</option><option value="p">Pawn</option></select>',
      '  </div>',
      '  <div class="admin-grid-2" style="margin-top:6px">',
      '    <button type="button" class="btn btn-secondary btn-xs sculpt-btn" data-sculpt="spawn">＋ Spawn</button>',
      '    <button type="button" class="btn btn-secondary btn-xs sculpt-btn" data-sculpt="transform">★ Transform</button>',
      '    <button type="button" class="btn btn-secondary btn-xs sculpt-btn" data-sculpt="vanish">✕ Vanish</button>',
      '    <button type="button" class="btn btn-secondary btn-xs sculpt-btn" data-sculpt="swap">⇄ Swap 2</button>',
      '  </div>',
      '  <button type="button" class="btn btn-ghost btn-xs" id="btn-sculpt-clear" style="margin-top:6px;width:100%">Exit Active Tool</button>',
      '</div>',

      // TAB 3: CHAOS & QUIRKS
      '<div class="admin-pane" data-apane="chaos">',
      '  <div class="admin-section-label">Clock Siphon & Time Warp</div>',
      '  <div class="admin-grid-2">',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-time-self-30">+30s Self</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-time-self-60">+60s Self</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-time-opp-15">-15s Enemy</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-time-opp-30">-30s Enemy</button>',
      '  </div>',
      '  <label class="toggle-chip" style="margin-top:6px"><input type="checkbox" id="chk-time-warp"> Time Warp (Enemy 1.75x / Self 0.75x)</label>',
      '  <div class="admin-section-label" style="margin-top:10px">Trap & Pawn Rules</div>',
      '  <div class="admin-btn-row">',
      '    <button type="button" class="btn btn-secondary btn-xs sculpt-btn" data-sculpt="glue">🕸 Glue Trap Piece</button>',
      '    <button type="button" class="btn btn-ghost btn-xs" id="btn-clear-glue">Clear Locks</button>',
      '  </div>',
      '  <div class="admin-grid-2" style="margin-top:6px">',
      '    <label class="toggle-chip"><input type="checkbox" id="chk-block-opp-back"> Block Enemy Back-Pawn</label>',
      '    <label class="toggle-chip"><input type="checkbox" id="chk-super-pawns"> Super Pawns (Sideways)</label>',
      '  </div>',
      '  <div class="admin-section-label" style="margin-top:10px">Live P2P Visual Pranks</div>',
      '  <div class="admin-grid-2">',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-fx-flip">↻ Flip Enemy Board</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-fx-shake">💥 Earthquake</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-fx-drunk">🍺 Drunk Pieces</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" id="btn-fx-fog">🌫 Fog of War (5s)</button>',
      '  </div>',
      '  <div class="admin-section-label" style="margin-top:10px">Stamp Last Move</div>',
      '  <div class="admin-btn-row">',
      '    <button type="button" class="btn btn-secondary btn-xs" data-stamp="!!" data-kind="brilliant">!! Brilliant</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" data-stamp="★" data-kind="best">★ Best</button>',
      '    <button type="button" class="btn btn-secondary btn-xs" data-stamp="??" data-kind="blunder">?? Blunder</button>',
      '  </div>',
      '  <div class="admin-section-label" style="margin-top:10px">Fake System Toast</div>',
      '  <div class="admin-toast-row">',
      '    <input type="text" id="inp-fake-toast" placeholder="e.g. Stockfish detected!">',
      '    <button type="button" class="btn btn-primary btn-xs" id="btn-send-toast">Send</button>',
      '  </div>',
      '</div>'
    ].join('\n');
  };

  AdminController.prototype._initStockfish = function () {
    var self = this;
    this.sf = new ChessApp.StockfishBridge({
      onReady: function () {
        var b = document.getElementById('sf-status-badge');
        if (b) {
          b.textContent = 'Stockfish 10 Ready';
          b.classList.add('ready');
        }
        self.refreshAnalysis();
      },
      onUpdate: function (data) {
        self.lastAnalysis = data;
        self._renderAnalysis(data);
      },
      onBestMove: function (data) {
        self.lastAnalysis = data;
        self._renderAnalysis(data);
        self._maybeAutoPilot();
      },
      onThreat: function (data) {
        self.lastThreatUci = data.threatUci;
        self._renderArrows();
      },
      onInvalidPosition: function () {
        self.lastAnalysis = null;
        self.lastThreatUci = null;
        self._renderInvalidEval();
      },
      onError: function (msg) {
        var b = document.getElementById('sf-status-badge');
        if (b) b.textContent = msg;
      }
    });
  };

  AdminController.prototype._registerHooks = function () {
    var self = this;
    this.app.registerAdminHooks({
      bypassLocks: true,
      canSelectPiece: function (sq, piece) {
        if (self.state.puppetMode !== 'off') return true;
        if (self.app.mode === 'local') return piece.color === self.app.engine.turn;
        return piece.color === self.app.myColor;
      },
      shouldAllowDirectAttempt: function () {
        return self.state.puppetMode !== 'off' || self.state.freeMove;
      },
      interceptSquareClick: function (sq) {
        return self._handleSculptClick(sq);
      },
      interceptAttemptMove: function (from, to) {
        return self._interceptMove(from, to);
      },
      onBeforeMove: function (from, to, promo) {
        return self._checkBlunderGuard(from, to, promo);
      },
      onStateChange: function () {
        self.refreshAnalysis();
      }
    });
  };

  AdminController.prototype._bindEvents = function () {
    var self = this;

    // Tabs
    this.dock.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = this.dataset.atab;
        self.dock.querySelectorAll('.admin-tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
        self.dock.querySelectorAll('.admin-pane').forEach(function (p) { p.classList.toggle('active', p.dataset.apane === t); });
      });
    });

    // Stealth panic shortcut & buttons
    var crownBtn = document.getElementById('btn-brand-admin');
    if (crownBtn) {
      crownBtn.addEventListener('click', function () { self.toggleStealth(); });
    }
    var stealthBtn = document.getElementById('btn-admin-stealth');
    if (stealthBtn) {
      stealthBtn.addEventListener('click', function () { self.toggleStealth(true); });
    }
    document.addEventListener('keydown', function (ev) {
      if (ev.ctrlKey && ev.shiftKey && (ev.key === 'A' || ev.key === 'a')) {
        ev.preventDefault();
        self.toggleStealth();
      }
    });

    // Stockfish controls
    document.getElementById('chk-eval-bar').addEventListener('change', function () {
      self.state.evalBar = this.checked;
      if (self.evalSlot) self.evalSlot.classList.toggle('hidden', self.stealth || !self.state.evalBar);
    });
    document.getElementById('chk-sf-arrows').addEventListener('change', function () {
      self.state.arrows = this.checked;
      self._renderArrows();
    });
    document.getElementById('chk-threat-arrow').addEventListener('change', function () {
      self.state.threatArrow = this.checked;
      self.refreshAnalysis();
    });
    document.getElementById('chk-blunder-guard').addEventListener('change', function () {
      self.state.blunderGuard = this.checked;
    });
    document.getElementById('rng-sf-depth').addEventListener('input', function () {
      self.state.depth = parseInt(this.value, 10);
      document.getElementById('lbl-sf-depth').textContent = String(self.state.depth);
    });
    document.getElementById('rng-sf-depth').addEventListener('change', function () {
      self.refreshAnalysis();
    });
    document.getElementById('sel-sf-skill').addEventListener('change', function () {
      self.state.skillLevel = parseInt(this.value, 10);
      self.refreshAnalysis();
    });
    document.getElementById('btn-play-best').addEventListener('click', function () {
      self.playBestMoveNow();
    });
    document.getElementById('btn-toggle-autopilot').addEventListener('click', function () {
      self.state.autoPilot = !self.state.autoPilot;
      this.textContent = 'Auto-Pilot: ' + (self.state.autoPilot ? 'ON' : 'OFF');
      this.classList.toggle('btn-primary', self.state.autoPilot);
      this.classList.toggle('btn-secondary', !self.state.autoPilot);
      if (self.state.autoPilot) self._maybeAutoPilot();
    });

    // God mode controls
    this.dock.querySelectorAll('[data-puppet]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = this.dataset.puppet;
        self.state.puppetMode = (self.state.puppetMode === mode) ? 'off' : mode;
        self.state.sculptTool = null;
        self._syncToolButtons();
      });
    });
    document.getElementById('chk-free-move').addEventListener('change', function () {
      self.state.freeMove = this.checked;
    });
    document.getElementById('chk-double-turn').addEventListener('change', function () {
      self.state.doubleTurn = this.checked;
    });
    document.getElementById('btn-undo-1').addEventListener('click', function () { self._silentUndo(1); });
    document.getElementById('btn-undo-2').addEventListener('click', function () { self._silentUndo(2); });

    document.getElementById('sel-sculpt-color').addEventListener('change', function () {
      self.state.sculptColor = this.value;
    });
    document.getElementById('sel-sculpt-piece').addEventListener('change', function () {
      self.state.sculptPiece = this.value;
    });
    this.dock.querySelectorAll('[data-sculpt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tool = this.dataset.sculpt;
        self.state.sculptTool = (self.state.sculptTool === tool) ? null : tool;
        self.state.puppetMode = 'off';
        self.state.swapFirstSq = null;
        self._syncToolButtons();
      });
    });
    document.getElementById('btn-sculpt-clear').addEventListener('click', function () {
      self.state.sculptTool = null;
      self.state.puppetMode = 'off';
      self.state.swapFirstSq = null;
      self._syncToolButtons();
    });

    // Chaos & Quirks
    document.getElementById('btn-time-self-30').addEventListener('click', function () { self._adjustClock('self', 30000); });
    document.getElementById('btn-time-self-60').addEventListener('click', function () { self._adjustClock('self', 60000); });
    document.getElementById('btn-time-opp-15').addEventListener('click', function () { self._adjustClock('opp', -15000); });
    document.getElementById('btn-time-opp-30').addEventListener('click', function () { self._adjustClock('opp', -30000); });

    document.getElementById('chk-time-warp').addEventListener('change', function () {
      self.state.timeWarp = this.checked;
      var myC = self._getMyColor();
      var oppC = myC === 'w' ? 'b' : 'w';
      if (this.checked) {
        self.app.clockRates[myC] = 0.75;
        self.app.clockRates[oppC] = 1.75;
      } else {
        self.app.clockRates = { w: 1, b: 1 };
      }
      self.app.broadcastAdminSync();
    });

    document.getElementById('btn-clear-glue').addEventListener('click', function () {
      self.app.engine.lockedSquares = {};
      self.app.broadcastAdminSync();
      self.app.toast('All Glue Traps cleared.', 'info');
    });

    document.getElementById('chk-block-opp-back').addEventListener('change', function () {
      var oppC = self._getMyColor() === 'w' ? 'b' : 'w';
      if (oppC === 'w') self.app.engine.rules.allowWhiteBackwardPawn = !this.checked;
      else self.app.engine.rules.allowBlackBackwardPawn = !this.checked;
      self.app.broadcastAdminSync();
    });

    document.getElementById('chk-super-pawns').addEventListener('change', function () {
      var myC = self._getMyColor();
      self.app.engine.rules.superPawnsColor = this.checked ? myC : null;
      self.app.broadcastAdminSync();
    });

    document.getElementById('btn-fx-flip').addEventListener('click', function () {
      self.app.sendAdminFx('flip', {});
      ChessApp.Sound.play('cheat');
    });
    document.getElementById('btn-fx-shake').addEventListener('click', function () {
      self.app.boardUI.triggerFx('shake', {});
      self.app.sendAdminFx('shake', {});
      ChessApp.Sound.play('cheat');
    });
    document.getElementById('btn-fx-drunk').addEventListener('click', function () {
      self.state.drunkActive = !self.state.drunkActive;
      self.app.sendAdminFx('drunk', { enable: self.state.drunkActive });
      ChessApp.Sound.play('cheat');
    });
    document.getElementById('btn-fx-fog').addEventListener('click', function () {
      var myC = self._getMyColor();
      self.app.sendAdminFx('fog', { targetColor: myC, durationMs: 5000 });
      ChessApp.Sound.play('cheat');
    });

    this.dock.querySelectorAll('[data-stamp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var hist = self.app.engine.history;
        if (!hist.length) return;
        var last = hist[hist.length - 1];
        last.badge = { text: this.dataset.stamp, kind: this.dataset.kind };
        self.app.boardUI.triggerFx('stamp', { sq: last.to, text: this.dataset.stamp, kind: this.dataset.kind });
        self.app.renderAll();
        self.app.broadcastAdminSync();
        self.app.sendAdminFx('stamp', { sq: last.to, text: this.dataset.stamp, kind: this.dataset.kind });
      });
    });

    document.getElementById('btn-send-toast').addEventListener('click', function () {
      var inp = document.getElementById('inp-fake-toast');
      var txt = inp.value.trim();
      if (!txt) return;
      inp.value = '';
      self.app.sendAdminFx('toast', { text: txt, kind: 'warn' });
      self.app.toast('Sent prank toast: "' + txt + '"', 'success');
    });
  };

  AdminController.prototype._getMyColor = function () {
    return this.app.myColor || this.app.boardUI.orientation || 'w';
  };

  AdminController.prototype._syncToolButtons = function () {
    var self = this;
    this.dock.querySelectorAll('[data-puppet]').forEach(function (b) {
      b.classList.toggle('tool-active', b.dataset.puppet === self.state.puppetMode);
    });
    this.dock.querySelectorAll('[data-sculpt]').forEach(function (b) {
      b.classList.toggle('tool-active', b.dataset.sculpt === self.state.sculptTool);
    });
  };

  AdminController.prototype.toggleStealth = function (forceVal) {
    this.stealth = forceVal !== undefined ? !!forceVal : !this.stealth;
    document.body.classList.toggle('admin-stealth', this.stealth);
    if (this.dock) this.dock.classList.toggle('hidden', this.stealth);
    if (this.evalSlot) this.evalSlot.classList.toggle('hidden', this.stealth || !this.state.evalBar);
    if (this.stealth) {
      this.state.sculptTool = null;
      this.state.puppetMode = 'off';
      this._syncToolButtons();
      this.app.boardUI.setAdminArrows([]);
    } else {
      this._renderArrows();
    }
  };

  AdminController.prototype.refreshAnalysis = function () {
    if (!this.sf) return;
    this.lastThreatUci = null;
    if (this.app.gameOver) {
      this.sf.stop();
      this._renderArrows();
      return;
    }
    var fen = this.app.engine.toFEN();
    var threatFen = this.state.threatArrow ? ChessApp.StockfishBridge.buildThreatFEN(fen) : null;
    this.sf.analyze(fen, {
      depth: this.state.depth,
      multipv: 3,
      skillLevel: this.state.skillLevel,
      threatFen: threatFen
    });
  };

  AdminController.prototype._renderInvalidEval = function () {
    var lbl = document.getElementById('admin-eval-label');
    var box = document.getElementById('sf-lines-box');
    if (lbl) lbl.textContent = 'Custom';
    if (box) box.innerHTML = '<div class="sf-line-empty">Non-standard board (Stockfish paused)</div>';
    this.app.boardUI.setAdminArrows([]);
  };

  AdminController.prototype._renderAnalysis = function (data) {
    if (!data || !data.lines || !data.lines.length) return;
    var top = data.lines[0];
    var scoreStr = ChessApp.StockfishBridge.formatScore(top);
    var pct = ChessApp.StockfishBridge.evalBarPercent(top);

    var fill = document.getElementById('admin-eval-fill');
    var lbl = document.getElementById('admin-eval-label');
    var depthLbl = document.getElementById('sf-depth-label');
    if (fill) fill.style.height = pct + '%';
    if (lbl) lbl.textContent = scoreStr;
    if (depthLbl) depthLbl.textContent = 'd' + (data.depth || 0);

    var box = document.getElementById('sf-lines-box');
    if (box) {
      var html = '';
      for (var i = 0; i < data.lines.length; i++) {
        var ln = data.lines[i];
        var sc = ChessApp.StockfishBridge.formatScore(ln);
        var sanLine = ChessApp.Engine.pvToSAN(data.fen, ln.pvUci, 5);
        html += '<div class="sf-line">' +
          '<span class="sf-score">' + sc + '</span>' +
          '<span class="sf-pv">' + sanLine + '</span>' +
          '</div>';
      }
      box.innerHTML = html;
    }
    this._renderArrows();
  };

  AdminController.prototype._renderArrows = function () {
    if (this.stealth || !this.state.arrows) {
      this.app.boardUI.setAdminArrows([]);
      return;
    }
    var arrows = [];
    if (this.lastAnalysis && this.lastAnalysis.lines && this.lastAnalysis.fen === this.app.engine.toFEN()) {
      var lines = this.lastAnalysis.lines;
      for (var i = 0; i < lines.length; i++) {
        var parsed = ChessApp.Engine.uciToMove(lines[i].bestMoveUci);
        if (!parsed) continue;
        arrows.push({
          from: parsed.from,
          to: parsed.to,
          color: i === 0 ? 'emerald' : 'cyan',
          opacity: i === 0 ? 0.92 : (i === 1 ? 0.55 : 0.35),
          width: i === 0 ? 15 : 10
        });
      }
    }
    if (this.state.threatArrow && this.lastThreatUci) {
      var th = ChessApp.Engine.uciToMove(this.lastThreatUci);
      if (th) {
        arrows.push({ from: th.from, to: th.to, color: 'threat', opacity: 0.78, width: 11 });
      }
    }
    this.app.boardUI.setAdminArrows(arrows);
  };

  AdminController.prototype.playBestMoveNow = function () {
    if (this.app.gameOver) return;
    if (!this.lastAnalysis || !this.lastAnalysis.lines || !this.lastAnalysis.lines.length) return;
    if (this.lastAnalysis.fen !== this.app.engine.toFEN()) return;
    var best = ChessApp.Engine.uciToMove(this.lastAnalysis.lines[0].bestMoveUci);
    if (!best) return;
    this.app.commitMove(best.from, best.to, best.promotion || null, { skipGuard: true });
  };

  AdminController.prototype._maybeAutoPilot = function () {
    if (!this.state.autoPilot || this.app.gameOver) return;
    if (this.app.mode !== 'local' && this.app.engine.turn !== this.app.myColor) return;
    clearTimeout(this._autoTimer);
    var self = this;
    var delay = 900 + Math.floor(Math.random() * 1700);
    this._autoTimer = setTimeout(function () {
      if (self.state.autoPilot && !self.app.gameOver) {
        self.playBestMoveNow();
      }
    }, delay);
  };

  AdminController.prototype._checkBlunderGuard = function (from, to, promo) {
    if (!this.state.blunderGuard || !this.lastAnalysis || !this.lastAnalysis.lines || !this.lastAnalysis.lines.length) {
      return true;
    }
    var bestLine = this.lastAnalysis.lines[0];
    var playedUci = ChessApp.Engine.sqToAlgebraic(from.r, from.c) + ChessApp.Engine.sqToAlgebraic(to.r, to.c) + (promo || '');
    if (playedUci === bestLine.bestMoveUci) return true;

    // Warn if played move is NOT in top 3 lines and destination piece is worth >= 3 or eval is high
    var inTop = this.lastAnalysis.lines.some(function (l) { return l.bestMoveUci === playedUci; });
    if (inTop) return true;

    var key = this.app.engine.toFEN() + '|' + playedUci;
    if (this._guardBypassKey === key) {
      this._guardBypassKey = null;
      return true;
    }
    this._guardBypassKey = key;
    var self = this;
    setTimeout(function () { if (self._guardBypassKey === key) self._guardBypassKey = null; }, 3500);
    this.app.toast('Blunder Guard: Stockfish prefers ' + bestLine.bestMoveUci + '. Repeat move to override.', 'warn');
    return false;
  };

  AdminController.prototype._interceptMove = function (from, to) {
    var engine = this.app.engine;
    var piece = engine.getPiece(from.r, from.c);
    if (!piece) return false;

    if (this.state.puppetMode === 'stealth_nudge') {
      var res = engine.applyForceMove(from, to, { flipTurn: false, recordHistory: false });
      if (!res.ok) return false;
      this.app.renderAll();
      this.app.boardUI.animateMove(from, to);
      this.app.broadcastAdminSync({ animFrom: from, animTo: to });
      this.refreshAnalysis();
      ChessApp.Sound.play('cheat');
      return true;
    }

    if (this.state.puppetMode === 'force_turn') {
      var res2 = engine.applyForceMove(from, to, { flipTurn: true, recordHistory: true });
      if (!res2.ok) return false;
      this.app.renderAll();
      this.app.boardUI.animateMove(from, to);
      this.app.broadcastAdminSync({ animFrom: from, animTo: to, sound: 'move' });
      this.refreshAnalysis();
      ChessApp.Sound.play('move');
      return true;
    }

    if (this.state.freeMove) {
      var res3 = engine.applyForceMove(from, to, { flipTurn: !this.state.doubleTurn, recordHistory: true });
      if (!res3.ok) return false;
      this.app.renderAll();
      this.app.boardUI.animateMove(from, to);
      this.app.broadcastAdminSync({ animFrom: from, animTo: to, sound: 'move' });
      this.refreshAnalysis();
      ChessApp.Sound.play('move');
      return true;
    }

    if (this.state.doubleTurn && (this.app.mode === 'local' || this.app.engine.turn === this.app.myColor)) {
      var legal = engine.getLegalMoves(from.r, from.c, { includeSecret: true });
      var ok = legal.some(function (m) { return m.to.r === to.r && m.to.c === to.c; });
      if (ok) {
        return this.app.commitMove(from, to, 'q', { keepTurn: true });
      }
    }

    return null; // fall through to standard App move handling
  };

  AdminController.prototype._handleSculptClick = function (sq) {
    var tool = this.state.sculptTool;
    if (!tool) return false;
    var engine = this.app.engine;

    if (tool === 'spawn') {
      engine.setPieceAt(sq.r, sq.c, { color: this.state.sculptColor, type: this.state.sculptPiece });
    } else if (tool === 'transform') {
      if (!engine.getPiece(sq.r, sq.c)) return true;
      engine.promotePieceAt(sq.r, sq.c, this.state.sculptPiece);
    } else if (tool === 'vanish') {
      if (!engine.getPiece(sq.r, sq.c)) return true;
      engine.setPieceAt(sq.r, sq.c, null);
    } else if (tool === 'swap') {
      if (!this.state.swapFirstSq) {
        this.state.swapFirstSq = sq;
        this.app.toast('Click second square to swap.', 'info');
        return true;
      }
      engine.swapPieces(this.state.swapFirstSq, sq);
      this.state.swapFirstSq = null;
    } else if (tool === 'glue') {
      var key = sq.r + ',' + sq.c;
      if (engine.lockedSquares[key]) {
        delete engine.lockedSquares[key];
        this.app.toast('Piece unlocked.', 'info');
      } else {
        engine.lockedSquares[key] = true;
        this.app.toast('Glue Trap placed!', 'success');
      }
      this.app.broadcastAdminSync();
      ChessApp.Sound.play('cheat');
      return true;
    }

    this.app.renderAll();
    this.app.broadcastAdminSync();
    this.refreshAnalysis();
    ChessApp.Sound.play('cheat');
    return true;
  };

  AdminController.prototype._silentUndo = function (plies) {
    this.app.engine.undoPly(plies);
    this.app.gameOver = null;
    this.app.viewPly = null;
    this.app.renderAll();
    this.app.broadcastAdminSync();
    this.refreshAnalysis();
    ChessApp.Sound.play('cheat');
  };

  AdminController.prototype._adjustClock = function (who, deltaMs) {
    if (this.app.timeControl.baseMs <= 0) {
      this.app.toast('Current match has Unlimited clock.', 'warn');
      return;
    }
    var myC = this._getMyColor();
    var target = who === 'self' ? myC : (myC === 'w' ? 'b' : 'w');
    this.app.clocks[target] = Math.max(1000, this.app.clocks[target] + deltaMs);
    this.app.renderClocks();
    this.app.broadcastAdminSync();
    ChessApp.Sound.play('cheat');
  };

  ChessApp.AdminController = AdminController;

  document.addEventListener('DOMContentLoaded', function () {
    if (global.chessApp) {
      global.chessAdmin = new AdminController(global.chessApp);
    }
  });
})(window);
