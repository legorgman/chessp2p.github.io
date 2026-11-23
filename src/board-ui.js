(function (global) {
  'use strict';

  var ChessApp = global.ChessApp = global.ChessApp || {};
  var FILES = 'abcdefgh';
  var RANKS = '87654321';

  var THEME_KEY = 'chessp2p_theme';

  function BoardUI(containerEl, callbacks) {
    this.container = containerEl;
    this.cb = callbacks || {};
    this.orientation = 'w'; // 'w' or 'b'
    this.theme = 'green';
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved) this.theme = saved;
    } catch (e) {}

    this.selected = null; // { r, c }
    this.legalTargets = []; // ONLY standard moves (never secret dots!)
    this.lastMove = null; // { from: {r,c}, to: {r,c} }
    this.premove = null; // { from: {r,c}, to: {r,c} }
    this.userHighlights = {}; // "r,c" -> colorName
    this.userArrows = []; // [{ from, to, color }]
    this.adminArrows = []; // [{ from, to, color, opacity, width }]
    this.activeStamp = null; // { r, c, text, kind }
    this.pendingPromotion = null;
    this.interactive = true;
    this.bypassLocks = false;

    this._lastState = null; // { engine, snapshot }
    this._drag = null;
    this._rightDragFrom = null;
    this._squares = [];

    this._buildDOM();
    this.setTheme(this.theme);
  }

  BoardUI.prototype._buildDOM = function () {
    this.container.innerHTML = '';
    this.container.classList.add('board-wrap');

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'board-grid';

    this.squaresLayer = document.createElement('div');
    this.squaresLayer.className = 'board-squares';

    this._squares = new Array(8);
    for (var r = 0; r < 8; r++) {
      this._squares[r] = new Array(8);
      for (var c = 0; c < 8; c++) {
        var sq = document.createElement('div');
        sq.className = 'sq ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
        sq.dataset.r = String(r);
        sq.dataset.c = String(c);
        this.squaresLayer.appendChild(sq);
        this._squares[r][c] = sq;
      }
    }

    var svgNS = 'http://www.w3.org/2000/svg';
    this.overlaySvg = document.createElementNS(svgNS, 'svg');
    this.overlaySvg.setAttribute('class', 'board-overlay');
    this.overlaySvg.setAttribute('viewBox', '0 0 800 800');
    this.overlaySvg.innerHTML = '<defs></defs><g class="arrows-admin"></g><g class="arrows-user"></g>';

    this.promoLayer = document.createElement('div');
    this.promoLayer.className = 'promo-overlay hidden';

    this.dragGhost = document.createElement('div');
    this.dragGhost.className = 'drag-ghost hidden';

    this.gridEl.appendChild(this.squaresLayer);
    this.gridEl.appendChild(this.overlaySvg);
    this.gridEl.appendChild(this.promoLayer);
    this.container.appendChild(this.gridEl);
    document.body.appendChild(this.dragGhost);

    this._bindEvents();
  };

  BoardUI.prototype.setTheme = function (themeName) {
    this.theme = themeName || 'green';
    this.container.dataset.theme = this.theme;
    try { localStorage.setItem(THEME_KEY, this.theme); } catch (e) {}
  };

  BoardUI.prototype.setOrientation = function (color) {
    this.orientation = color === 'b' ? 'b' : 'w';
    this._reorderSquares();
    if (this._lastState) {
      this.render(this._lastState.engine, this._lastState.options);
    }
  };

  BoardUI.prototype.flip = function () {
    this.setOrientation(this.orientation === 'w' ? 'b' : 'w');
    return this.orientation;
  };

  BoardUI.prototype._reorderSquares = function () {
    // Reorder DOM grid cells so CSS grid lays them out cleanly for either orientation
    var frag = document.createDocumentFragment();
    if (this.orientation === 'w') {
      for (var r = 0; r < 8; r++) {
        for (var c = 0; c < 8; c++) {
          frag.appendChild(this._squares[r][c]);
        }
      }
    } else {
      for (var r2 = 7; r2 >= 0; r2--) {
        for (var c2 = 7; c2 >= 0; c2--) {
          frag.appendChild(this._squares[r2][c2]);
        }
      }
    }
    this.squaresLayer.appendChild(frag);
  };

  BoardUI.prototype._getCoordsFromClientPoint = function (clientX, clientY) {
    var rect = this.gridEl.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    var colIdx = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)));
    var rowIdx = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)));
    if (this.orientation === 'w') {
      return { r: rowIdx, c: colIdx };
    }
    return { r: 7 - rowIdx, c: 7 - colIdx };
  };

  BoardUI.prototype._sqCenter = function (sq) {
    var vx = this.orientation === 'w' ? sq.c : 7 - sq.c;
    var vy = this.orientation === 'w' ? sq.r : 7 - sq.r;
    return { x: vx * 100 + 50, y: vy * 100 + 50 };
  };

  BoardUI.prototype._rightClickColor = function (ev) {
    if (ev.shiftKey && ev.ctrlKey) return 'amber';
    if (ev.shiftKey) return 'green';
    if (ev.ctrlKey || ev.metaKey) return 'blue';
    if (ev.altKey) return 'amber';
    return 'red';
  };

  BoardUI.prototype._bindEvents = function () {
    var self = this;

    this.gridEl.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
    });

    this.gridEl.addEventListener('pointerdown', function (ev) {
      if (!self._lastState) return;
      if (self.pendingPromotion) return;

      var sq = self._getCoordsFromClientPoint(ev.clientX, ev.clientY);
      if (!sq) return;

      // Right-click annotations
      if (ev.button === 2) {
        self._rightDragFrom = { sq: sq, color: self._rightClickColor(ev) };
        try { self.gridEl.setPointerCapture(ev.pointerId); } catch (e) {}
        return;
      }
      if (ev.button !== 0) return;

      // Left-click clears user annotations
      if (Object.keys(self.userHighlights).length > 0 || self.userArrows.length > 0) {
        self.userHighlights = {};
        self.userArrows = [];
        self._renderArrows();
        self._refreshSquareClasses();
      }

      // Admin square-click interceptor (e.g. Board Sculptor / Glue Trap)
      if (self.cb.onSquareIntercept && self.cb.onSquareIntercept(sq)) {
        return;
      }

      if (!self.interactive) return;

      var engine = self._lastState.engine;
      var piece = engine.getPiece(sq.r, sq.c);
      var myColor = self._lastState.options && self._lastState.options.playerColor; // 'w'|'b'|null (both)
      var canControlPiece = function (p) {
        if (!p) return false;
        if (self.cb.canSelectPiece) return self.cb.canSelectPiece(sq, p);
        if (myColor && p.color !== myColor) return false;
        return p.color === engine.turn || (myColor && p.color === myColor);
      };

      // Clicking a destination when a piece is already selected
      if (self.selected) {
        if (self.selected.r === sq.r && self.selected.c === sq.c) {
          // Allow drag start, or deselect on pointerup if not dragged
          if (piece && canControlPiece(piece)) {
            self._startDrag(ev, sq, piece, true);
          }
          return;
        }

        // Check if clicking another friendly piece of the active turn (unless Admin free-move allows capturing own or special)
        var isTurnPiece = piece && piece.color === engine.turn && (!myColor || piece.color === myColor);
        var selectedPiece = engine.getPiece(self.selected.r, self.selected.c);
        var sameOwnerAsSelected = piece && selectedPiece && piece.color === selectedPiece.color;

        if (sameOwnerAsSelected && !self.cb.allowSameColorTarget) {
          self.selectSquare(sq);
          if (canControlPiece(piece)) {
            self._startDrag(ev, sq, piece, false);
          }
          return;
        }

        // Attempt move (either on turn, admin override, or premove)
        if (self._tryOrQueueMove(self.selected, sq)) {
          self.clearSelection();
          return;
        }
        if (isTurnPiece) {
          self.selectSquare(sq);
          self._startDrag(ev, sq, piece, false);
          return;
        }
        self.clearSelection();
        return;
      }

      // Clear existing premove if clicking empty square
      if (!piece) {
        if (self.premove) {
          self.premove = null;
          self._refreshSquareClasses();
        }
        return;
      }

      if (canControlPiece(piece)) {
        self.selectSquare(sq);
        self._startDrag(ev, sq, piece, false);
      }
    });

    global.addEventListener('pointermove', function (ev) {
      if (!self._drag) return;
      var dx = ev.clientX - self._drag.startX;
      var dy = ev.clientY - self._drag.startY;
      if (!self._drag.active && (dx * dx + dy * dy) > 16) {
        self._drag.active = true;
        var sqEl = self._squares[self._drag.from.r][self._drag.from.c];
        sqEl.classList.add('dragging-origin');
        self.dragGhost.innerHTML = ChessApp.Pieces.getSVG(self._drag.piece.color, self._drag.piece.type);
        self.dragGhost.classList.remove('hidden');
      }
      if (self._drag.active) {
        self.dragGhost.style.left = ev.clientX + 'px';
        self.dragGhost.style.top = ev.clientY + 'px';
        var over = self._getCoordsFromClientPoint(ev.clientX, ev.clientY);
        self._setHoverSquare(over);
      }
    });

    global.addEventListener('pointerup', function (ev) {
      if (self._rightDragFrom && ev.button === 2) {
        var endSq = self._getCoordsFromClientPoint(ev.clientX, ev.clientY);
        var info = self._rightDragFrom;
        self._rightDragFrom = null;
        if (endSq) {
          if (endSq.r === info.sq.r && endSq.c === info.sq.c) {
            var key = endSq.r + ',' + endSq.c;
            if (self.userHighlights[key] === info.color) delete self.userHighlights[key];
            else self.userHighlights[key] = info.color;
            self._refreshSquareClasses();
          } else {
            self._toggleUserArrow(info.sq, endSq, info.color);
          }
        }
        return;
      }

      if (!self._drag) return;
      var drag = self._drag;
      self._drag = null;
      self._setHoverSquare(null);
      self.dragGhost.classList.add('hidden');
      self._squares[drag.from.r][drag.from.c].classList.remove('dragging-origin');

      if (!drag.active) {
        if (drag.wasAlreadySelected) {
          self.clearSelection();
        }
        return;
      }

      var dropSq = self._getCoordsFromClientPoint(ev.clientX, ev.clientY);
      if (dropSq && (dropSq.r !== drag.from.r || dropSq.c !== drag.from.c)) {
        if (self._tryOrQueueMove(drag.from, dropSq)) {
          self.clearSelection();
        }
      }
    });

    global.addEventListener('pointercancel', function () {
      if (self._drag) {
        self._squares[self._drag.from.r][self._drag.from.c].classList.remove('dragging-origin');
        self._drag = null;
        self.dragGhost.classList.add('hidden');
        self._setHoverSquare(null);
      }
    });
  };

  BoardUI.prototype._startDrag = function (ev, sq, piece, wasAlreadySelected) {
    this._drag = {
      from: { r: sq.r, c: sq.c },
      piece: piece,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
      wasAlreadySelected: wasAlreadySelected
    };
  };

  BoardUI.prototype._setHoverSquare = function (sq) {
    if (this._hoverKey) {
      var parts = this._hoverKey.split(',');
      this._squares[+parts[0]][+parts[1]].classList.remove('drag-over');
      this._hoverKey = null;
    }
    if (sq) {
      this._hoverKey = sq.r + ',' + sq.c;
      this._squares[sq.r][sq.c].classList.add('drag-over');
    }
  };

  BoardUI.prototype._toggleUserArrow = function (from, to, color) {
    for (var i = 0; i < this.userArrows.length; i++) {
      var a = this.userArrows[i];
      if (a.from.r === from.r && a.from.c === from.c && a.to.r === to.r && a.to.c === to.c) {
        this.userArrows.splice(i, 1);
        this._renderArrows();
        return;
      }
    }
    this.userArrows.push({ from: from, to: to, color: color });
    this._renderArrows();
  };

  BoardUI.prototype.selectSquare = function (sq) {
    if (!this._lastState) return;
    var engine = this._lastState.engine;
    this.selected = { r: sq.r, c: sq.c };
    // CRITICAL: Legal indicator dots use includeSecret: false ONLY!
    // Never show any dot/ring on backward pawn squares!
    var p = engine.getPiece(sq.r, sq.c);
    if (p && p.color === engine.turn && (!engine.lockedSquares[sq.r + ',' + sq.c] || this.bypassLocks)) {
      this.legalTargets = engine.getLegalMoves(sq.r, sq.c, { includeSecret: false });
    } else {
      this.legalTargets = [];
    }
    this._refreshSquareClasses();
  };

  BoardUI.prototype.clearSelection = function () {
    this.selected = null;
    this.legalTargets = [];
    this._refreshSquareClasses();
  };

  BoardUI.prototype._tryOrQueueMove = function (from, to) {
    if (!this._lastState) return false;
    var engine = this._lastState.engine;
    var opts = this._lastState.options || {};
    var myColor = opts.playerColor;
    var piece = engine.getPiece(from.r, from.c);
    if (!piece) return false;

    // Glue trap check (silent bounce for non-admin)
    if (!this.bypassLocks && engine.lockedSquares[from.r + ',' + from.c]) {
      return false;
    }

    var isAdminTurnOverride = this.cb.shouldAllowDirectAttempt && this.cb.shouldAllowDirectAttempt(from, to, piece);
    if (!isAdminTurnOverride && myColor && piece.color === myColor && engine.turn !== myColor) {
      // Queue premove
      this.premove = { from: { r: from.r, c: from.c }, to: { r: to.r, c: to.c } };
      this._refreshSquareClasses();
      return true;
    }

    if (this.cb.onAttemptMove) {
      return !!this.cb.onAttemptMove(from, to);
    }
    return false;
  };

  BoardUI.prototype.showPromotionPicker = function (toSq, color, onPick, onCancel) {
    var self = this;
    this.pendingPromotion = true;
    this.promoLayer.innerHTML = '';
    this.promoLayer.classList.remove('hidden');

    var vx = this.orientation === 'w' ? toSq.c : 7 - toSq.c;
    var vy = this.orientation === 'w' ? toSq.r : 7 - toSq.r;
    var openDown = vy === 0;

    var col = document.createElement('div');
    col.className = 'promo-column ' + (openDown ? 'down' : 'up');
    col.style.left = (vx * 12.5) + '%';
    if (openDown) col.style.top = '0%';
    else col.style.bottom = '0%';

    var types = ['q', 'n', 'r', 'b'];
    for (var i = 0; i < types.length; i++) {
      (function (t) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'promo-choice';
        btn.innerHTML = ChessApp.Pieces.getSVG(color, t);
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          self.hidePromotionPicker();
          onPick(t);
        });
        col.appendChild(btn);
      })(types[i]);
    }

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'promo-cancel';
    cancelBtn.textContent = '×';
    cancelBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      self.hidePromotionPicker();
      if (onCancel) onCancel();
    });
    col.appendChild(cancelBtn);

    this.promoLayer.appendChild(col);
  };

  BoardUI.prototype.hidePromotionPicker = function () {
    this.pendingPromotion = false;
    this.promoLayer.classList.add('hidden');
    this.promoLayer.innerHTML = '';
  };

  BoardUI.prototype.setAdminArrows = function (arrows) {
    this.adminArrows = arrows || [];
    this._renderArrows();
  };

  BoardUI.prototype.setStamp = function (sq, text, kind, durationMs) {
    if (!sq) {
      this.activeStamp = null;
      this._refreshSquareClasses();
      return;
    }
    this.activeStamp = { r: sq.r, c: sq.c, text: text, kind: kind || 'brilliant' };
    this._refreshSquareClasses();
    if (durationMs !== 0) {
      var self = this;
      clearTimeout(this._stampTimer);
      this._stampTimer = setTimeout(function () {
        self.activeStamp = null;
        self._refreshSquareClasses();
      }, durationMs || 6000);
    }
  };

  BoardUI.prototype.triggerFx = function (effect, params) {
    var self = this;
    params = params || {};
    if (effect === 'flip') {
      this.flip();
    } else if (effect === 'shake') {
      this.gridEl.classList.remove('fx-shake');
      void this.gridEl.offsetWidth;
      this.gridEl.classList.add('fx-shake');
      setTimeout(function () { self.gridEl.classList.remove('fx-shake'); }, 650);
    } else if (effect === 'drunk') {
      var enable = params.enable !== undefined ? !!params.enable : !this.gridEl.classList.contains('fx-drunk');
      this.gridEl.classList.toggle('fx-drunk', enable);
    } else if (effect === 'fog') {
      this.gridEl.dataset.fogColor = params.targetColor || '';
      this.gridEl.classList.add('fx-fog');
      clearTimeout(this._fogTimer);
      this._fogTimer = setTimeout(function () {
        self.gridEl.classList.remove('fx-fog');
      }, params.durationMs || 5000);
    } else if (effect === 'stamp') {
      this.setStamp(params.sq, params.text || '!!', params.kind || 'brilliant', params.durationMs || 6000);
    }
  };

  BoardUI.prototype.animateMove = function (from, to) {
    if (!from || !to) return;
    var destSq = this._squares[to.r] && this._squares[to.r][to.c];
    if (!destSq) return;
    var pieceEl = destSq.querySelector('.piece');
    if (!pieceEl) return;

    var fVisX = this.orientation === 'w' ? from.c : 7 - from.c;
    var fVisY = this.orientation === 'w' ? from.r : 7 - from.r;
    var tVisX = this.orientation === 'w' ? to.c : 7 - to.c;
    var tVisY = this.orientation === 'w' ? to.r : 7 - to.r;

    var dx = (fVisX - tVisX) * 100;
    var dy = (fVisY - tVisY) * 100;
    pieceEl.style.transition = 'none';
    pieceEl.style.transform = 'translate(' + dx + '%, ' + dy + '%)';
    void pieceEl.offsetWidth;
    pieceEl.style.transition = 'transform 145ms cubic-bezier(0.22, 1, 0.36, 1)';
    pieceEl.style.transform = 'translate(0%, 0%)';
  };

  BoardUI.prototype.render = function (engine, options) {
    options = options || {};
    this._lastState = { engine: engine, options: options };
    this.interactive = options.interactive !== undefined ? !!options.interactive : true;
    this.bypassLocks = !!options.bypassLocks;
    this.lastMove = options.lastMove !== undefined ? options.lastMove : null;

    var board = options.overrideBoard || engine.board;
    var turn = options.overrideTurn || engine.turn;
    var checkKingSq = null;
    if (!options.overrideBoard && engine.isInCheck(turn)) {
      checkKingSq = engine.findKing(turn);
    }

    var fogColor = this.gridEl.classList.contains('fx-fog') ? (this.gridEl.dataset.fogColor || '') : '';

    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var sqEl = this._squares[r][c];
        // Clear piece & coordinate spans cleanly
        sqEl.innerHTML = '';

        // Coordinates on edge squares
        var isLeftEdge = this.orientation === 'w' ? (c === 0) : (c === 7);
        var isBottomEdge = this.orientation === 'w' ? (r === 7) : (r === 0);
        if (isLeftEdge) {
          var rk = document.createElement('span');
          rk.className = 'coord coord-rank';
          rk.textContent = RANKS[r];
          sqEl.appendChild(rk);
        }
        if (isBottomEdge) {
          var fl = document.createElement('span');
          fl.className = 'coord coord-file';
          fl.textContent = FILES[c];
          sqEl.appendChild(fl);
        }

        var p = board[r][c];
        if (p) {
          var pieceEl = document.createElement('div');
          pieceEl.className = 'piece' + (fogColor && p.color === fogColor ? ' fogged' : '');
          pieceEl.innerHTML = ChessApp.Pieces.getSVG(p.color, p.type);
          sqEl.appendChild(pieceEl);
        }

        if (checkKingSq && checkKingSq.r === r && checkKingSq.c === c) {
          sqEl.classList.add('in-check');
        } else {
          sqEl.classList.remove('in-check');
        }
      }
    }

    this._refreshSquareClasses();
    this._renderArrows();
  };

  BoardUI.prototype._refreshSquareClasses = function () {
    if (!this._lastState) return;
    var engine = this._lastState.engine;
    var board = (this._lastState.options && this._lastState.options.overrideBoard) || engine.board;

    var legalMap = {};
    for (var i = 0; i < this.legalTargets.length; i++) {
      var m = this.legalTargets[i];
      legalMap[m.to.r + ',' + m.to.c] = m;
    }

    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var sqEl = this._squares[r][c];
        var key = r + ',' + c;

        sqEl.classList.toggle('selected', !!(this.selected && this.selected.r === r && this.selected.c === c));
        sqEl.classList.toggle('last-move', !!(this.lastMove && (
          (this.lastMove.from.r === r && this.lastMove.from.c === c) ||
          (this.lastMove.to.r === r && this.lastMove.to.c === c)
        )));
        sqEl.classList.toggle('premove', !!(this.premove && (
          (this.premove.from.r === r && this.premove.from.c === c) ||
          (this.premove.to.r === r && this.premove.to.c === c)
        )));

        var hl = this.userHighlights[key];
        sqEl.classList.remove('sq-hl-red', 'sq-hl-green', 'sq-hl-blue', 'sq-hl-amber');
        if (hl) sqEl.classList.add('sq-hl-' + hl);

        // Remove old indicators & stamps
        var oldDot = sqEl.querySelector('.move-dot, .capture-ring');
        if (oldDot) oldDot.remove();
        var oldStamp = sqEl.querySelector('.move-stamp');
        if (oldStamp) oldStamp.remove();

        var lm = legalMap[key];
        if (lm) {
          var targetOccupied = !!board[r][c] || !!lm.enPassantCapture;
          var ind = document.createElement('span');
          ind.className = targetOccupied ? 'capture-ring' : 'move-dot';
          sqEl.appendChild(ind);
        }

        if (this.activeStamp && this.activeStamp.r === r && this.activeStamp.c === c) {
          var st = document.createElement('span');
          st.className = 'move-stamp stamp-' + this.activeStamp.kind;
          st.textContent = this.activeStamp.text;
          sqEl.appendChild(st);
        }
      }
    }
  };

  BoardUI.prototype._renderArrows = function () {
    var adminLayer = this.overlaySvg.querySelector('.arrows-admin');
    var userLayer = this.overlaySvg.querySelector('.arrows-user');
    adminLayer.innerHTML = '';
    userLayer.innerHTML = '';

    var colorMap = {
      red: 'rgba(235, 87, 87, 0.82)',
      green: 'rgba(129, 182, 76, 0.85)',
      blue: 'rgba(72, 169, 230, 0.82)',
      amber: 'rgba(242, 174, 48, 0.85)',
      emerald: 'rgba(34, 197, 94, 0.88)',
      cyan: 'rgba(56, 189, 248, 0.65)',
      threat: 'rgba(239, 68, 68, 0.78)'
    };

    var self = this;
    function drawList(layer, list) {
      var svgNS = 'http://www.w3.org/2000/svg';
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        var p1 = self._sqCenter(a.from);
        var p2 = self._sqCenter(a.to);
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var len = Math.hypot(dx, dy);
        if (len < 1) continue;
        var ux = dx / len;
        var uy = dy / len;
        var startOff = 18;
        var headLen = 28;
        var headHalfW = 19;
        var strokeW = a.width || 14;
        var sx = p1.x + ux * startOff;
        var sy = p1.y + uy * startOff;
        var ex = p2.x - ux * headLen;
        var ey = p2.y - uy * headLen;

        var px = -uy;
        var py = ux;

        var tipX = p2.x - ux * 4;
        var tipY = p2.y - uy * 4;
        var b1x = ex + px * headHalfW;
        var b1y = ey + py * headHalfW;
        var b2x = ex - px * headHalfW;
        var b2y = ey - py * headHalfW;

        var g = document.createElementNS(svgNS, 'g');
        var fill = colorMap[a.color] || a.color || colorMap.green;
        if (a.opacity !== undefined) g.setAttribute('opacity', String(a.opacity));

        var line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', sx);
        line.setAttribute('y1', sy);
        line.setAttribute('x2', ex);
        line.setAttribute('y2', ey);
        line.setAttribute('stroke', fill);
        line.setAttribute('stroke-width', strokeW);
        line.setAttribute('stroke-linecap', 'round');

        var head = document.createElementNS(svgNS, 'polygon');
        head.setAttribute('points', tipX + ',' + tipY + ' ' + b1x + ',' + b1y + ' ' + b2x + ',' + b2y);
        head.setAttribute('fill', fill);

        g.appendChild(line);
        g.appendChild(head);
        layer.appendChild(g);
      }
    }

    drawList(adminLayer, this.adminArrows);
    drawList(userLayer, this.userArrows);
  };

  ChessApp.BoardUI = BoardUI;
})(window);
