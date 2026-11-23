(function (global) {
  'use strict';

  var ChessApp = global.ChessApp = global.ChessApp || {};

  var FILES = 'abcdefgh';
  var RANKS = '87654321';
  var PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var BOT_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  // Piece-square tables (from White's perspective: row 0 = rank 8, row 7 = rank 1)
  var PST = {
    p: [
      [0,  0,  0,  0,  0,  0,  0,  0],
      [50, 50, 50, 50, 50, 50, 50, 50],
      [10, 10, 20, 30, 30, 20, 10, 10],
      [5,  5, 10, 25, 25, 10,  5,  5],
      [0,  0,  0, 20, 20,  0,  0,  0],
      [5, -5,-10,  0,  0,-10, -5,  5],
      [5, 10, 10,-20,-20, 10, 10,  5],
      [0,  0,  0,  0,  0,  0,  0,  0]
    ],
    n: [
      [-50,-40,-30,-30,-30,-30,-40,-50],
      [-40,-20,  0,  0,  0,  0,-20,-40],
      [-30,  0, 10, 15, 15, 10,  0,-30],
      [-30,  5, 15, 20, 20, 15,  5,-30],
      [-30,  0, 15, 20, 20, 15,  0,-30],
      [-30,  5, 10, 15, 15, 10,  5,-30],
      [-40,-20,  0,  5,  5,  0,-20,-40],
      [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    b: [
      [-20,-10,-10,-10,-10,-10,-10,-20],
      [-10,  0,  0,  0,  0,  0,  0,-10],
      [-10,  0,  5, 10, 10,  5,  0,-10],
      [-10,  5,  5, 10, 10,  5,  5,-10],
      [-10,  0, 10, 10, 10, 10,  0,-10],
      [-10, 10, 10, 10, 10, 10, 10,-10],
      [-10,  5,  0,  0,  0,  0,  5,-10],
      [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    r: [
      [0,  0,  0,  0,  0,  0,  0,  0],
      [5, 10, 10, 10, 10, 10, 10,  5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [0,  0,  0,  5,  5,  0,  0,  0]
    ],
    q: [
      [-20,-10,-10, -5, -5,-10,-10,-20],
      [-10,  0,  0,  0,  0,  0,  0,-10],
      [-10,  0,  5,  5,  5,  5,  0,-10],
      [-5,  0,  5,  5,  5,  5,  0, -5],
      [0,  0,  5,  5,  5,  5,  0, -5],
      [-10,  5,  5,  5,  5,  5,  0,-10],
      [-10,  0,  5,  0,  0,  0,  0,-10],
      [-20,-10,-10, -5, -5,-10,-10,-20]
    ],
    k: [
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-20,-30,-30,-40,-40,-30,-30,-20],
      [-10,-20,-20,-20,-20,-20,-20,-10],
      [20, 20,  0,  0,  0,  0, 20, 20],
      [20, 30, 10,  0,  0, 10, 30, 20]
    ]
  };

  function clonePiece(p) {
    return p ? { color: p.color, type: p.type } : null;
  }

  function cloneBoard(b) {
    var out = new Array(8);
    for (var r = 0; r < 8; r++) {
      out[r] = new Array(8);
      for (var c = 0; c < 8; c++) {
        out[r][c] = clonePiece(b[r][c]);
      }
    }
    return out;
  }

  function cloneObj(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function sqToAlgebraic(r, c) {
    return FILES[c] + RANKS[r];
  }

  function algebraicToSq(sq) {
    if (!sq || sq.length < 2) return null;
    var c = FILES.indexOf(sq[0]);
    var r = RANKS.indexOf(sq[1]);
    if (c === -1 || r === -1) return null;
    return { r: r, c: c };
  }

  function opposite(color) {
    return color === 'w' ? 'b' : 'w';
  }

  function Engine() {
    this.reset();
  }

  Engine.START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  Engine.sqToAlgebraic = sqToAlgebraic;
  Engine.algebraicToSq = algebraicToSq;

  Engine.prototype.reset = function () {
    this.rules = {
      allowWhiteBackwardPawn: true,
      allowBlackBackwardPawn: true,
      superPawnsColor: null
    };
    this.lockedSquares = {};
    this.loadFEN(Engine.START_FEN);
  };

  Engine.prototype.loadFEN = function (fen) {
    var parts = String(fen || Engine.START_FEN).trim().split(/\s+/);
    var rows = (parts[0] || '').split('/');
    if (rows.length !== 8) {
      throw new Error('Invalid FEN board rows');
    }
    var board = new Array(8);
    for (var r = 0; r < 8; r++) {
      board[r] = new Array(8);
      var c = 0;
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (ch >= '1' && ch <= '8') {
          var empty = parseInt(ch, 10);
          for (var k = 0; k < empty; k++) {
            board[r][c++] = null;
          }
        } else {
          var color = ch === ch.toUpperCase() ? 'w' : 'b';
          var type = ch.toLowerCase();
          board[r][c++] = { color: color, type: type };
        }
      }
      if (c !== 8) {
        throw new Error('Invalid FEN row length at rank ' + (8 - r));
      }
    }
    this.board = board;
    this.turn = parts[1] === 'b' ? 'b' : 'w';
    var castStr = parts[2] || '-';
    this.castling = {
      K: castStr.indexOf('K') !== -1,
      Q: castStr.indexOf('Q') !== -1,
      k: castStr.indexOf('k') !== -1,
      q: castStr.indexOf('q') !== -1
    };
    this.enPassant = parts[3] && parts[3] !== '-' ? algebraicToSq(parts[3]) : null;
    this.halfMoveClock = parseInt(parts[4] || '0', 10) || 0;
    this.fullMoveNumber = parseInt(parts[5] || '1', 10) || 1;
    this.history = [];
    this.positionCounts = {};
    this._recordPositionCount();
  };

  Engine.prototype._positionKey = function () {
    var fenParts = this.toFEN().split(' ');
    return fenParts[0] + ' ' + fenParts[1] + ' ' + fenParts[2] + ' ' + fenParts[3];
  };

  Engine.prototype._recordPositionCount = function () {
    var key = this._positionKey();
    this.positionCounts[key] = (this.positionCounts[key] || 0) + 1;
  };

  Engine.prototype.toFEN = function () {
    var rows = [];
    for (var r = 0; r < 8; r++) {
      var str = '';
      var empty = 0;
      for (var c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (!p) {
          empty++;
        } else {
          if (empty > 0) {
            str += empty;
            empty = 0;
          }
          str += p.color === 'w' ? p.type.toUpperCase() : p.type;
        }
      }
      if (empty > 0) str += empty;
      rows.push(str);
    }
    var cast = '';
    if (this.castling.K) cast += 'K';
    if (this.castling.Q) cast += 'Q';
    if (this.castling.k) cast += 'k';
    if (this.castling.q) cast += 'q';
    if (!cast) cast = '-';
    var ep = this.enPassant ? sqToAlgebraic(this.enPassant.r, this.enPassant.c) : '-';
    return rows.join('/') + ' ' + this.turn + ' ' + cast + ' ' + ep + ' ' + this.halfMoveClock + ' ' + this.fullMoveNumber;
  };

  Engine.prototype.getPiece = function (r, c) {
    if (!inBounds(r, c)) return null;
    return this.board[r][c];
  };

  Engine.prototype.findKing = function (color) {
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (p && p.color === color && p.type === 'k') {
          return { r: r, c: c };
        }
      }
    }
    return null;
  };

  // Standard attack geometry ONLY (never reveal secret backward pawn attacks)
  Engine.prototype.isSquareAttacked = function (r, c, byColor) {
    var pDir = byColor === 'w' ? 1 : -1; // Pawn attacking (r,c) stands at r + pDir
    var pr = r + pDir;
    if (inBounds(pr, c - 1)) {
      var pl = this.board[pr][c - 1];
      if (pl && pl.color === byColor && pl.type === 'p') return true;
    }
    if (inBounds(pr, c + 1)) {
      var prp = this.board[pr][c + 1];
      if (prp && prp.color === byColor && prp.type === 'p') return true;
    }

    var knightJumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (var i = 0; i < knightJumps.length; i++) {
      var nr = r + knightJumps[i][0];
      var nc = c + knightJumps[i][1];
      if (inBounds(nr, nc)) {
        var np = this.board[nr][nc];
        if (np && np.color === byColor && np.type === 'n') return true;
      }
    }

    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var kr = r + dr;
        var kc = c + dc;
        if (inBounds(kr, kc)) {
          var kp = this.board[kr][kc];
          if (kp && kp.color === byColor && kp.type === 'k') return true;
        }
      }
    }

    var ortho = [[-1,0],[1,0],[0,-1],[0,1]];
    for (var o = 0; o < ortho.length; o++) {
      var sr = r + ortho[o][0];
      var sc = c + ortho[o][1];
      while (inBounds(sr, sc)) {
        var sp = this.board[sr][sc];
        if (sp) {
          if (sp.color === byColor && (sp.type === 'r' || sp.type === 'q')) return true;
          break;
        }
        sr += ortho[o][0];
        sc += ortho[o][1];
      }
    }

    var diag = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (var d = 0; d < diag.length; d++) {
      var dr2 = r + diag[d][0];
      var dc2 = c + diag[d][1];
      while (inBounds(dr2, dc2)) {
        var dp = this.board[dr2][dc2];
        if (dp) {
          if (dp.color === byColor && (dp.type === 'b' || dp.type === 'q')) return true;
          break;
        }
        dr2 += diag[d][0];
        dc2 += diag[d][1];
      }
    }

    return false;
  };

  Engine.prototype.isInCheck = function (color) {
    var k = this.findKing(color);
    if (!k) return false;
    return this.isSquareAttacked(k.r, k.c, opposite(color));
  };

  Engine.prototype._generatePseudoMovesForPiece = function (r, c, includeSecret) {
    var p = this.board[r][c];
    if (!p) return [];
    var moves = [];
    var color = p.color;
    var enemy = opposite(color);

    if (p.type === 'p') {
      var dir = color === 'w' ? -1 : 1;
      var startRank = color === 'w' ? 6 : 1;
      var promoRank = color === 'w' ? 0 : 7;

      // Forward 1
      var f1 = r + dir;
      if (inBounds(f1, c) && !this.board[f1][c]) {
        if (f1 === promoRank) {
          var promos = ['q', 'r', 'b', 'n'];
          for (var pr = 0; pr < promos.length; pr++) {
            moves.push({ from: { r: r, c: c }, to: { r: f1, c: c }, promotion: promos[pr], secret: false });
          }
        } else {
          moves.push({ from: { r: r, c: c }, to: { r: f1, c: c }, secret: false });
          // Forward 2 from start rank
          var f2 = r + dir * 2;
          if (r === startRank && inBounds(f2, c) && !this.board[f2][c]) {
            moves.push({ from: { r: r, c: c }, to: { r: f2, c: c }, doublePawn: true, secret: false });
          }
        }
      }

      // Forward diagonal captures + En Passant
      var capCols = [c - 1, c + 1];
      for (var ci = 0; ci < capCols.length; ci++) {
        var cc = capCols[ci];
        if (!inBounds(f1, cc)) continue;
        var target = this.board[f1][cc];
        if (target && target.color === enemy) {
          if (f1 === promoRank) {
            var promos2 = ['q', 'r', 'b', 'n'];
            for (var pr2 = 0; pr2 < promos2.length; pr2++) {
              moves.push({ from: { r: r, c: c }, to: { r: f1, c: cc }, captured: target, promotion: promos2[pr2], secret: false });
            }
          } else {
            moves.push({ from: { r: r, c: c }, to: { r: f1, c: cc }, captured: target, secret: false });
          }
        } else if (this.enPassant && this.enPassant.r === f1 && this.enPassant.c === cc) {
          var epVictim = this.board[r][cc];
          if (epVictim && epVictim.color === enemy && epVictim.type === 'p') {
            moves.push({ from: { r: r, c: c }, to: { r: f1, c: cc }, captured: epVictim, enPassantCapture: { r: r, c: cc }, secret: false });
          }
        }
      }

      // SECRET BACKWARDS PAWN MOVES (NEVER revealed in indicator dots)
      if (includeSecret) {
        var allowedBack = color === 'w' ? this.rules.allowWhiteBackwardPawn : this.rules.allowBlackBackwardPawn;
        if (allowedBack) {
          var backDir = color === 'w' ? 1 : -1;
          var br = r + backDir;
          // Strictly constrain to ranks 2..7 (row 1..6) so FEN never has pawns on rank 1 or 8
          if (br >= 1 && br <= 6) {
            if (!this.board[br][c]) {
              moves.push({ from: { r: r, c: c }, to: { r: br, c: c }, secret: true });
            }
            for (var bci = 0; bci < capCols.length; bci++) {
              var bcc = capCols[bci];
              if (!inBounds(br, bcc)) continue;
              var bTarget = this.board[br][bcc];
              if (bTarget && bTarget.color === enemy && bTarget.type !== 'k') {
                moves.push({ from: { r: r, c: c }, to: { r: br, c: bcc }, captured: bTarget, secret: true });
              }
            }
          }
        }
        // Admin Super Pawns quirk: sideways 1-square moves
        if (this.rules.superPawnsColor === color) {
          for (var sci = 0; sci < capCols.length; sci++) {
            var scc = capCols[sci];
            if (!inBounds(r, scc)) continue;
            var sTarget = this.board[r][scc];
            if (!sTarget) {
              moves.push({ from: { r: r, c: c }, to: { r: r, c: scc }, secret: true });
            } else if (sTarget.color === enemy && sTarget.type !== 'k') {
              moves.push({ from: { r: r, c: c }, to: { r: r, c: scc }, captured: sTarget, secret: true });
            }
          }
        }
      }
      return moves;
    }

    if (p.type === 'n') {
      var jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (var ni = 0; ni < jumps.length; ni++) {
        var nr = r + jumps[ni][0];
        var nc = c + jumps[ni][1];
        if (!inBounds(nr, nc)) continue;
        var nt = this.board[nr][nc];
        if (!nt || nt.color === enemy) {
          moves.push({ from: { r: r, c: c }, to: { r: nr, c: nc }, captured: nt || null, secret: false });
        }
      }
      return moves;
    }

    if (p.type === 'b' || p.type === 'r' || p.type === 'q') {
      var dirs = [];
      if (p.type === 'b' || p.type === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if (p.type === 'r' || p.type === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      for (var di = 0; di < dirs.length; di++) {
        var sr = r + dirs[di][0];
        var sc = c + dirs[di][1];
        while (inBounds(sr, sc)) {
          var st = this.board[sr][sc];
          if (!st) {
            moves.push({ from: { r: r, c: c }, to: { r: sr, c: sc }, secret: false });
          } else {
            if (st.color === enemy) {
              moves.push({ from: { r: r, c: c }, to: { r: sr, c: sc }, captured: st, secret: false });
            }
            break;
          }
          sr += dirs[di][0];
          sc += dirs[di][1];
        }
      }
      return moves;
    }

    if (p.type === 'k') {
      for (var kr = -1; kr <= 1; kr++) {
        for (var kc = -1; kc <= 1; kc++) {
          if (kr === 0 && kc === 0) continue;
          var tr = r + kr;
          var tc = c + kc;
          if (!inBounds(tr, tc)) continue;
          var kt = this.board[tr][tc];
          if (!kt || kt.color === enemy) {
            moves.push({ from: { r: r, c: c }, to: { r: tr, c: tc }, captured: kt || null, secret: false });
          }
        }
      }
      // Castling
      var homeRow = color === 'w' ? 7 : 0;
      if (r === homeRow && c === 4 && !this.isSquareAttacked(homeRow, 4, enemy)) {
        var ksRight = color === 'w' ? this.castling.K : this.castling.k;
        var ksRook = this.board[homeRow][7];
        if (ksRight && ksRook && ksRook.color === color && ksRook.type === 'r' &&
            !this.board[homeRow][5] && !this.board[homeRow][6] &&
            !this.isSquareAttacked(homeRow, 5, enemy) &&
            !this.isSquareAttacked(homeRow, 6, enemy)) {
          moves.push({ from: { r: r, c: c }, to: { r: homeRow, c: 6 }, castle: 'K', secret: false });
        }
        var qsRight = color === 'w' ? this.castling.Q : this.castling.q;
        var qsRook = this.board[homeRow][0];
        if (qsRight && qsRook && qsRook.color === color && qsRook.type === 'r' &&
            !this.board[homeRow][3] && !this.board[homeRow][2] && !this.board[homeRow][1] &&
            !this.isSquareAttacked(homeRow, 3, enemy) &&
            !this.isSquareAttacked(homeRow, 2, enemy)) {
          moves.push({ from: { r: r, c: c }, to: { r: homeRow, c: 2 }, castle: 'Q', secret: false });
        }
      }
      return moves;
    }

    return moves;
  };

  Engine.prototype._isMoveKingSafe = function (move, color) {
    var b = this.board;
    var f = move.from;
    var t = move.to;
    var moving = b[f.r][f.c];
    var captured = b[t.r][t.c];
    var epCaptured = null;

    b[t.r][t.c] = moving;
    b[f.r][f.c] = null;
    if (move.enPassantCapture) {
      epCaptured = b[move.enPassantCapture.r][move.enPassantCapture.c];
      b[move.enPassantCapture.r][move.enPassantCapture.c] = null;
    }

    var safe = !this.findKing(color) || !this.isInCheck(color);

    b[f.r][f.c] = moving;
    b[t.r][t.c] = captured;
    if (move.enPassantCapture) {
      b[move.enPassantCapture.r][move.enPassantCapture.c] = epCaptured;
    }
    return safe;
  };

  Engine.prototype.getLegalMoves = function (r, c, options) {
    var includeSecret = !!(options && options.includeSecret);
    var p = this.getPiece(r, c);
    if (!p || p.color !== this.turn) return [];
    var pseudo = this._generatePseudoMovesForPiece(r, c, includeSecret);
    var legal = [];
    for (var i = 0; i < pseudo.length; i++) {
      if (this._isMoveKingSafe(pseudo[i], p.color)) {
        legal.push(pseudo[i]);
      }
    }
    return legal;
  };

  Engine.prototype.getAllLegalMoves = function (options) {
    var includeSecret = !!(options && options.includeSecret);
    var all = [];
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (p && p.color === this.turn) {
          var pieceMoves = this.getLegalMoves(r, c, { includeSecret: includeSecret });
          for (var i = 0; i < pieceMoves.length; i++) {
            all.push(pieceMoves[i]);
          }
        }
      }
    }
    return all;
  };

  Engine.prototype._computeSAN = function (move, piece, standardLegalBefore) {
    if (move.castle === 'K') return 'O-O';
    if (move.castle === 'Q') return 'O-O-O';
    var san = '';
    var destSq = sqToAlgebraic(move.to.r, move.to.c);
    var isCapture = !!(move.captured || move.enPassantCapture);

    if (piece.type === 'p') {
      if (isCapture) {
        san += FILES[move.from.c] + 'x';
      }
      san += destSq;
      if (move.promotion) {
        san += '=' + move.promotion.toUpperCase();
      }
    } else {
      san += piece.type.toUpperCase();
      var sameType = [];
      for (var i = 0; i < standardLegalBefore.length; i++) {
        var m = standardLegalBefore[i];
        var mp = this.board[m.from.r][m.from.c];
        if (mp && mp.type === piece.type && m.to.r === move.to.r && m.to.c === move.to.c &&
            (m.from.r !== move.from.r || m.from.c !== move.from.c)) {
          sameType.push(m);
        }
      }
      if (sameType.length > 0) {
        var sameFile = false;
        var sameRank = false;
        for (var j = 0; j < sameType.length; j++) {
          if (sameType[j].from.c === move.from.c) sameFile = true;
          if (sameType[j].from.r === move.from.r) sameRank = true;
        }
        if (!sameFile) san += FILES[move.from.c];
        else if (!sameRank) san += RANKS[move.from.r];
        else san += FILES[move.from.c] + RANKS[move.from.r];
      }
      if (isCapture) san += 'x';
      san += destSq;
    }
    return san;
  };

  Engine.prototype.takeSnapshot = function () {
    return {
      board: cloneBoard(this.board),
      turn: this.turn,
      castling: cloneObj(this.castling),
      enPassant: this.enPassant ? { r: this.enPassant.r, c: this.enPassant.c } : null,
      halfMoveClock: this.halfMoveClock,
      fullMoveNumber: this.fullMoveNumber,
      rules: cloneObj(this.rules),
      lockedSquares: cloneObj(this.lockedSquares)
    };
  };

  Engine.prototype._restoreSnapshotStateOnly = function (snap) {
    this.board = cloneBoard(snap.board);
    this.turn = snap.turn;
    this.castling = cloneObj(snap.castling);
    this.enPassant = snap.enPassant ? { r: snap.enPassant.r, c: snap.enPassant.c } : null;
    this.halfMoveClock = snap.halfMoveClock;
    this.fullMoveNumber = snap.fullMoveNumber;
    if (snap.rules) this.rules = cloneObj(snap.rules);
    if (snap.lockedSquares) this.lockedSquares = cloneObj(snap.lockedSquares);
  };

  Engine.prototype.serialize = function () {
    return {
      board: cloneBoard(this.board),
      turn: this.turn,
      castling: cloneObj(this.castling),
      enPassant: this.enPassant ? { r: this.enPassant.r, c: this.enPassant.c } : null,
      halfMoveClock: this.halfMoveClock,
      fullMoveNumber: this.fullMoveNumber,
      history: cloneObj(this.history),
      positionCounts: cloneObj(this.positionCounts),
      rules: cloneObj(this.rules),
      lockedSquares: cloneObj(this.lockedSquares)
    };
  };

  Engine.prototype.deserialize = function (data) {
    this.board = cloneBoard(data.board);
    this.turn = data.turn;
    this.castling = cloneObj(data.castling);
    this.enPassant = data.enPassant ? { r: data.enPassant.r, c: data.enPassant.c } : null;
    this.halfMoveClock = data.halfMoveClock || 0;
    this.fullMoveNumber = data.fullMoveNumber || 1;
    this.history = cloneObj(data.history || []);
    this.positionCounts = cloneObj(data.positionCounts || {});
    this.rules = cloneObj(data.rules || { allowWhiteBackwardPawn: true, allowBlackBackwardPawn: true, superPawnsColor: null });
    this.lockedSquares = cloneObj(data.lockedSquares || {});
  };

  Engine.prototype._updateCastlingRightsForSquare = function (r, c, piece) {
    if (!piece) return;
    if (piece.type === 'k') {
      if (piece.color === 'w') { this.castling.K = false; this.castling.Q = false; }
      else { this.castling.k = false; this.castling.q = false; }
    } else if (piece.type === 'r') {
      if (r === 7 && c === 7) this.castling.K = false;
      if (r === 7 && c === 0) this.castling.Q = false;
      if (r === 0 && c === 7) this.castling.k = false;
      if (r === 0 && c === 0) this.castling.q = false;
    }
  };

  Engine.prototype.makeMove = function (from, to, promotion, options) {
    var opts = options || {};
    var includeSecret = opts.includeSecret !== undefined ? !!opts.includeSecret : true;
    var legal = this.getLegalMoves(from.r, from.c, { includeSecret: includeSecret });
    var chosen = null;
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (m.to.r === to.r && m.to.c === to.c) {
        if (m.promotion) {
          if (m.promotion === (promotion || 'q')) {
            chosen = m;
            break;
          }
        } else {
          chosen = m;
          break;
        }
      }
    }
    if (!chosen) return { ok: false, reason: 'illegal' };

    var prevSnap = this.takeSnapshot();
    var piece = clonePiece(this.board[from.r][from.c]);
    var standardLegalBefore = this.getAllLegalMoves({ includeSecret: false });
    var sanBase = this._computeSAN(chosen, piece, standardLegalBefore);

    // Execute move on board
    var captured = clonePiece(this.board[to.r][to.c]);
    if (chosen.enPassantCapture) {
      captured = clonePiece(this.board[chosen.enPassantCapture.r][chosen.enPassantCapture.c]);
      this.board[chosen.enPassantCapture.r][chosen.enPassantCapture.c] = null;
    }

    var placedPiece = clonePiece(piece);
    if (chosen.promotion) {
      placedPiece.type = chosen.promotion;
    }
    this.board[to.r][to.c] = placedPiece;
    this.board[from.r][from.c] = null;

    if (chosen.castle === 'K') {
      var rowK = piece.color === 'w' ? 7 : 0;
      this.board[rowK][5] = this.board[rowK][7];
      this.board[rowK][7] = null;
    } else if (chosen.castle === 'Q') {
      var rowQ = piece.color === 'w' ? 7 : 0;
      this.board[rowQ][3] = this.board[rowQ][0];
      this.board[rowQ][0] = null;
    }

    // Castling rights updates
    this._updateCastlingRightsForSquare(from.r, from.c, piece);
    if (captured && captured.type === 'r') {
      if (to.r === 7 && to.c === 7) this.castling.K = false;
      if (to.r === 7 && to.c === 0) this.castling.Q = false;
      if (to.r === 0 && to.c === 7) this.castling.k = false;
      if (to.r === 0 && to.c === 0) this.castling.q = false;
    }

    // En passant target
    if (chosen.doublePawn) {
      this.enPassant = { r: (from.r + to.r) / 2, c: from.c };
    } else {
      this.enPassant = null;
    }

    // Clocks
    if (piece.type === 'p' || captured) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock += 1;
    }
    if (this.turn === 'b') {
      this.fullMoveNumber += 1;
    }

    // Switch turn (unless Admin keepTurn override is set)
    if (!opts.keepTurn) {
      this.turn = opposite(this.turn);
    }

    // Check / mate suffix for SAN
    var suffix = '';
    var oppInCheck = this.isInCheck(this.turn);
    if (oppInCheck) {
      var oppMoves = this.getAllLegalMoves({ includeSecret: false });
      suffix = oppMoves.length === 0 ? '#' : '+';
    }
    var san = sanBase + suffix;
    var uci = sqToAlgebraic(from.r, from.c) + sqToAlgebraic(to.r, to.c) + (chosen.promotion || '');
    var fenAfter = this.toFEN();

    var record = {
      from: { r: from.r, c: from.c },
      to: { r: to.r, c: to.c },
      piece: piece,
      captured: captured,
      promotion: chosen.promotion || null,
      castle: chosen.castle || null,
      enPassantCapture: chosen.enPassantCapture || null,
      secret: !!chosen.secret,
      san: san,
      uci: uci,
      fenAfter: fenAfter,
      prevStateSnapshot: prevSnap,
      badge: null
    };
    this.history.push(record);
    this._recordPositionCount();

    return { ok: true, move: record };
  };

  // Admin Force Move (Puppet Master / Free Move / Double Turn / Stealth Nudge)
  Engine.prototype.applyForceMove = function (from, to, opts) {
    opts = opts || {};
    var moving = clonePiece(this.board[from.r][from.c]);
    if (!moving) return { ok: false, reason: 'empty' };

    var prevSnap = this.takeSnapshot();
    var captured = clonePiece(this.board[to.r][to.c]);
    if (captured && captured.type === 'k' && !opts.allowKingCapture) {
      return { ok: false, reason: 'cannot_capture_king' };
    }

    var placed = clonePiece(moving);
    if (opts.promotion) {
      placed.type = opts.promotion;
    } else if (placed.type === 'p' && (to.r === 0 || to.r === 7)) {
      placed.type = 'q';
    }

    this.board[to.r][to.c] = placed;
    this.board[from.r][from.c] = null;

    this._updateCastlingRightsForSquare(from.r, from.c, moving);
    if (captured && captured.type === 'r') {
      if (to.r === 7 && to.c === 7) this.castling.K = false;
      if (to.r === 7 && to.c === 0) this.castling.Q = false;
      if (to.r === 0 && to.c === 7) this.castling.k = false;
      if (to.r === 0 && to.c === 0) this.castling.q = false;
    }
    this.enPassant = null;

    if (opts.flipTurn) {
      if (this.turn === 'b') this.fullMoveNumber += 1;
      this.turn = opposite(this.turn);
    } else if (opts.setTurn) {
      this.turn = opts.setTurn;
    }

    var record = null;
    if (opts.recordHistory !== false) {
      var capStr = captured ? 'x' : '';
      var prefix = moving.type === 'p' ? (captured ? FILES[from.c] : '') : moving.type.toUpperCase();
      var san = opts.fakeSan || (prefix + capStr + sqToAlgebraic(to.r, to.c) + (opts.promotion ? '=' + opts.promotion.toUpperCase() : ''));
      record = {
        from: { r: from.r, c: from.c },
        to: { r: to.r, c: to.c },
        piece: moving,
        captured: captured,
        promotion: opts.promotion || null,
        castle: null,
        enPassantCapture: null,
        secret: false,
        forced: true,
        san: san,
        uci: sqToAlgebraic(from.r, from.c) + sqToAlgebraic(to.r, to.c),
        fenAfter: this.toFEN(),
        prevStateSnapshot: prevSnap,
        badge: null
      };
      this.history.push(record);
    }
    this._recordPositionCount();
    return { ok: true, move: record };
  };

  Engine.prototype.setPieceAt = function (r, c, pieceObj) {
    if (!inBounds(r, c)) return false;
    this.board[r][c] = pieceObj ? clonePiece(pieceObj) : null;
    this._recordPositionCount();
    return true;
  };

  Engine.prototype.swapPieces = function (sqA, sqB) {
    if (!inBounds(sqA.r, sqA.c) || !inBounds(sqB.r, sqB.c)) return false;
    var tmp = this.board[sqA.r][sqA.c];
    this.board[sqA.r][sqA.c] = this.board[sqB.r][sqB.c];
    this.board[sqB.r][sqB.c] = tmp;
    this._recordPositionCount();
    return true;
  };

  Engine.prototype.promotePieceAt = function (r, c, newType) {
    if (!inBounds(r, c) || !this.board[r][c]) return false;
    this.board[r][c] = { color: this.board[r][c].color, type: newType };
    this._recordPositionCount();
    return true;
  };

  Engine.prototype.undoPly = function (count) {
    var steps = Math.max(1, count || 1);
    var undone = 0;
    while (steps > 0 && this.history.length > 0) {
      var last = this.history.pop();
      if (last && last.prevStateSnapshot) {
        this._restoreSnapshotStateOnly(last.prevStateSnapshot);
        undone++;
      }
      steps--;
    }
    return undone;
  };

  Engine.prototype.getGameStatus = function () {
    var wKing = this.findKing('w');
    var bKing = this.findKing('b');
    if (!wKing && bKing) {
      return { over: true, result: '0-1', winner: 'b', reason: 'king_captured', label: 'Black wins' };
    }
    if (!bKing && wKing) {
      return { over: true, result: '1-0', winner: 'w', reason: 'king_captured', label: 'White wins' };
    }

    // Standard legal moves only for mate/stalemate checks
    var stdMoves = this.getAllLegalMoves({ includeSecret: false });
    if (stdMoves.length === 0) {
      if (this.isInCheck(this.turn)) {
        var winner = opposite(this.turn);
        return {
          over: true,
          result: winner === 'w' ? '1-0' : '0-1',
          winner: winner,
          reason: 'checkmate',
          label: (winner === 'w' ? 'White' : 'Black') + ' wins by checkmate'
        };
      }
      return { over: true, result: '1/2-1/2', winner: null, reason: 'stalemate', label: 'Draw by stalemate' };
    }

    if (this.halfMoveClock >= 100) {
      return { over: true, result: '1/2-1/2', winner: null, reason: 'fifty_move', label: 'Draw by 50-move rule' };
    }

    var key = this._positionKey();
    if ((this.positionCounts[key] || 0) >= 3) {
      return { over: true, result: '1/2-1/2', winner: null, reason: 'repetition', label: 'Draw by repetition' };
    }

    if (this._isInsufficientMaterial()) {
      return { over: true, result: '1/2-1/2', winner: null, reason: 'insufficient', label: 'Draw by insufficient material' };
    }

    return { over: false, result: '*', winner: null, reason: null, label: '' };
  };

  Engine.prototype._isInsufficientMaterial = function () {
    var minors = [];
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (!p || p.type === 'k') continue;
        if (p.type === 'p' || p.type === 'r' || p.type === 'q') return false;
        minors.push({ color: p.color, type: p.type, squareColor: (r + c) % 2 });
      }
    }
    if (minors.length <= 1) return true;
    if (minors.length === 2 && minors[0].type === 'b' && minors[1].type === 'b' && minors[0].squareColor === minors[1].squareColor) {
      return true;
    }
    return false;
  };

  Engine.prototype.getCapturedAndMaterial = function () {
    var startCounts = {
      w: { q: 1, r: 2, b: 2, n: 2, p: 8 },
      b: { q: 1, r: 2, b: 2, n: 2, p: 8 }
    };
    var currentCounts = {
      w: { q: 0, r: 0, b: 0, n: 0, p: 0 },
      b: { q: 0, r: 0, b: 0, n: 0, p: 0 }
    };
    var matW = 0;
    var matB = 0;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (!p || p.type === 'k') continue;
        currentCounts[p.color][p.type] = (currentCounts[p.color][p.type] || 0) + 1;
        if (p.color === 'w') matW += PIECE_VALUES[p.type] || 0;
        else matB += PIECE_VALUES[p.type] || 0;
      }
    }

    var order = ['q', 'r', 'b', 'n', 'p'];
    var capturedByWhite = [];
    var capturedByBlack = [];
    for (var i = 0; i < order.length; i++) {
      var t = order[i];
      var missingB = Math.max(0, startCounts.b[t] - currentCounts.b[t]);
      for (var j = 0; j < missingB; j++) capturedByWhite.push({ color: 'b', type: t });
      var missingW = Math.max(0, startCounts.w[t] - currentCounts.w[t]);
      for (var k = 0; k < missingW; k++) capturedByBlack.push({ color: 'w', type: t });
    }

    return {
      capturedByWhite: capturedByWhite,
      capturedByBlack: capturedByBlack,
      whiteAdvantage: matW - matB,
      blackAdvantage: matB - matW
    };
  };

  Engine.prototype.toPGN = function (headers) {
    var h = headers || {};
    var lines = [
      '[Event "' + (h.event || 'ChessP2P Casual') + '"]',
      '[White "' + (h.white || 'White') + '"]',
      '[Black "' + (h.black || 'Black') + '"]',
      '[Result "' + (h.result || '*') + '"]',
      ''
    ];
    var movesStr = [];
    for (var i = 0; i < this.history.length; i++) {
      if (i % 2 === 0) {
        movesStr.push((Math.floor(i / 2) + 1) + '.');
      }
      movesStr.push(this.history[i].san);
    }
    if (h.result && h.result !== '*') movesStr.push(h.result);
    lines.push(movesStr.join(' '));
    return lines.join('\n');
  };

  Engine.isValidStockfishFEN = function (fen) {
    if (!fen || typeof fen !== 'string') return false;
    var parts = fen.trim().split(/\s+/);
    if (parts.length < 2) return false;
    var rows = parts[0].split('/');
    if (rows.length !== 8) return false;

    var wKings = 0;
    var bKings = 0;
    for (var r = 0; r < 8; r++) {
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (ch === 'K') wKings++;
        else if (ch === 'k') bKings++;
        else if ((ch === 'P' || ch === 'p') && (r === 0 || r === 7)) return false;
      }
    }
    if (wKings !== 1 || bKings !== 1) return false;

    try {
      var temp = new Engine();
      temp.loadFEN(fen);
      var nonActive = opposite(temp.turn);
      if (temp.isInCheck(nonActive)) return false;
    } catch (e) {
      return false;
    }
    return true;
  };

  Engine.uciToMove = function (uci) {
    if (!uci || uci.length < 4) return null;
    var from = algebraicToSq(uci.slice(0, 2));
    var to = algebraicToSq(uci.slice(2, 4));
    if (!from || !to) return null;
    var promotion = uci.length >= 5 ? uci[4].toLowerCase() : null;
    return { from: from, to: to, promotion: promotion };
  };

  Engine.pvToSAN = function (fen, pvUciArray, maxPlies) {
    if (!pvUciArray || !pvUciArray.length) return '';
    try {
      var sim = new Engine();
      sim.loadFEN(fen);
      var out = [];
      var limit = Math.min(pvUciArray.length, maxPlies || 5);
      for (var i = 0; i < limit; i++) {
        var parsed = Engine.uciToMove(pvUciArray[i]);
        if (!parsed) break;
        var res = sim.makeMove(parsed.from, parsed.to, parsed.promotion, { includeSecret: false });
        if (!res.ok) break;
        out.push(res.move.san);
      }
      return out.join(' ');
    } catch (e) {
      return pvUciArray.slice(0, 4).join(' ');
    }
  };

  // Built-in Alpha-Beta Practice Bot (for Normal Play vs Computer)
  function Bot() {}

  Bot.evaluate = function (engine, perspectiveColor) {
    var score = 0;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = engine.board[r][c];
        if (!p) continue;
        var pstRow = p.color === 'w' ? r : 7 - r;
        var val = (BOT_VALUES[p.type] || 0) + (PST[p.type] ? PST[p.type][pstRow][c] : 0);
        score += (p.color === perspectiveColor ? val : -val);
      }
    }
    return score;
  };

  Bot._scoreMoveForOrder = function (m, engine) {
    var s = 0;
    if (m.captured) {
      var attacker = engine.board[m.from.r][m.from.c];
      s += 10 * (BOT_VALUES[m.captured.type] || 0) - (attacker ? (BOT_VALUES[attacker.type] || 0) : 0);
    }
    if (m.promotion) s += 800;
    if (m.castle) s += 60;
    return s;
  };

  Bot._negamax = function (engine, depth, alpha, beta, color) {
    if (depth === 0) {
      return Bot.evaluate(engine, color);
    }
    var moves = engine.getAllLegalMoves({ includeSecret: false });
    if (moves.length === 0) {
      if (engine.isInCheck(color)) return -90000 - depth * 10;
      return 0;
    }
    moves.sort(function (a, b) {
      return Bot._scoreMoveForOrder(b, engine) - Bot._scoreMoveForOrder(a, engine);
    });

    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var snap = engine.takeSnapshot();
      var res = engine.makeMove(m.from, m.to, m.promotion, { includeSecret: false });
      if (!res.ok) continue;
      var val = -Bot._negamax(engine, depth - 1, -beta, -alpha, opposite(color));
      engine._restoreSnapshotStateOnly(snap);
      engine.history.pop();

      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return best;
  };

  Bot.chooseMove = function (engine, level) {
    var depthMap = { 1: 1, 2: 2, 3: 3, 4: 3 };
    var depth = depthMap[level] || 2;
    var moves = engine.getAllLegalMoves({ includeSecret: false });
    if (moves.length === 0) return null;

    if (level === 1 && Math.random() < 0.35) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    moves.sort(function (a, b) {
      return Bot._scoreMoveForOrder(b, engine) - Bot._scoreMoveForOrder(a, engine);
    });

    var color = engine.turn;
    var bestScore = -Infinity;
    var bestMoves = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var snap = engine.takeSnapshot();
      var res = engine.makeMove(m.from, m.to, m.promotion, { includeSecret: false });
      if (!res.ok) continue;
      var score = -Bot._negamax(engine, depth - 1, -Infinity, Infinity, opposite(color));
      engine._restoreSnapshotStateOnly(snap);
      engine.history.pop();

      if (score > bestScore + 15) {
        bestScore = score;
        bestMoves = [m];
      } else if (score >= bestScore - 15) {
        bestMoves.push(m);
      }
    }
    if (bestMoves.length === 0) return moves[0];
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  };

  ChessApp.Engine = Engine;
  ChessApp.Bot = Bot;
})(window);
