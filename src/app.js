(function (global) {
  'use strict';

  var ChessApp = global.ChessApp = global.ChessApp || {};
  var NAME_KEY = 'chessp2p_player_name';

  function parseTimeControl(spec) {
    if (!spec || spec === '0+0') return { baseMs: 0, incMs: 0, label: 'Unlimited' };
    var parts = String(spec).split('+');
    var secs = parseInt(parts[0], 10) || 0;
    var inc = parseInt(parts[1], 10) || 0;
    return { baseMs: secs * 1000, incMs: inc * 1000, label: spec };
  }

  function formatClock(ms) {
    if (ms === null || ms === undefined) return '∞';
    var clamped = Math.max(0, ms);
    var totalSec = Math.ceil(clamped / 1000);
    if (clamped > 0 && clamped < 10000) {
      var secs = Math.floor(clamped / 1000);
      var tenths = Math.floor((clamped % 1000) / 100);
      return '0:' + (secs < 10 ? '0' : '') + secs + '.' + tenths;
    }
    var mins = Math.floor(totalSec / 60);
    var rem = totalSec % 60;
    return mins + ':' + (rem < 10 ? '0' : '') + rem;
  }

  function cloneBoardOnly(board) {
    return board.map(function (row) {
      return row.map(function (p) { return p ? { color: p.color, type: p.type } : null; });
    });
  }

  function App() {
    this.engine = new ChessApp.Engine();
    this.mode = 'local'; // 'local' | 'bot' | 'p2p'
    this.myColor = null; // 'w'|'b' in bot/p2p, null in local pass&play
    this.localName = 'Player';
    try {
      this.localName = localStorage.getItem(NAME_KEY) || 'Player';
    } catch (e) {}
    this.opponentName = 'Guest';
    this.botLevel = 2;
    this.timeControl = { baseMs: 300000, incMs: 0, label: '300+0' };
    this.clocks = { w: 300000, b: 300000 };
    this.clockRates = { w: 1, b: 1 };
    this.gameOver = null;
    this.viewPly = null; // null = live, number = viewing history ply
    this.adminHooks = {};
    this._botTimer = null;
    this._clockTimer = null;
    this._lastTickTs = Date.now();
    this._lowTimeBeeped = { w: false, b: false };
    this._lastOpponentColor = 'b';
    this._isHost = true;

    this._cacheDOM();
    this._initBoard();
    this._initP2P();
    this._bindUI();
    this._startClockLoop();

    // Start in friendly solo/practice mode immediately so the board is playable out of the box
    this.startSoloGame({ mode: 'local', color: 'w', timeSpec: '0+0', level: 2 }, true);
  }

  App.prototype._cacheDOM = function () {
    this.el = {
      connPill: document.getElementById('conn-pill'),
      connText: document.getElementById('conn-text'),
      themeSelect: document.getElementById('theme-select'),
      btnSound: document.getElementById('btn-sound'),
      btnNewGame: document.getElementById('btn-new-game'),

      topName: document.getElementById('top-name'),
      topAvatar: document.getElementById('top-avatar'),
      topCaptured: document.getElementById('top-captured'),
      topAdv: document.getElementById('top-adv'),
      topClock: document.getElementById('top-clock'),

      bottomName: document.getElementById('bottom-name'),
      bottomAvatar: document.getElementById('bottom-avatar'),
      bottomCaptured: document.getElementById('bottom-captured'),
      bottomAdv: document.getElementById('bottom-adv'),
      bottomClock: document.getElementById('bottom-clock'),

      boardContainer: document.getElementById('board-container'),
      historyBanner: document.getElementById('history-banner'),
      btnJumpLive: document.getElementById('btn-jump-live'),

      openingName: document.getElementById('opening-name'),
      gameStatusBanner: document.getElementById('game-status-banner'),
      requestBanner: document.getElementById('request-banner'),
      moveList: document.getElementById('move-list'),

      btnNavStart: document.getElementById('btn-nav-start'),
      btnNavPrev: document.getElementById('btn-nav-prev'),
      btnNavNext: document.getElementById('btn-nav-next'),
      btnNavEnd: document.getElementById('btn-nav-end'),

      btnFlip: document.getElementById('btn-flip'),
      btnTakeback: document.getElementById('btn-takeback'),
      btnDraw: document.getElementById('btn-draw'),
      btnResign: document.getElementById('btn-resign'),
      btnCopyFen: document.getElementById('btn-copy-fen'),
      btnCopyPgn: document.getElementById('btn-copy-pgn'),

      chatLog: document.getElementById('chat-log'),
      chatInput: document.getElementById('chat-input'),
      btnChatSend: document.getElementById('btn-chat-send'),

      playModal: document.getElementById('play-modal'),
      btnCloseModal: document.getElementById('btn-close-modal'),
      inputPlayerName: document.getElementById('input-player-name'),

      createColorSelect: document.getElementById('create-color-select'),
      createTimeSelect: document.getElementById('create-time-select'),
      btnCreateRoom: document.getElementById('btn-create-room'),
      hostRoomBox: document.getElementById('host-room-box'),
      hostRoomCode: document.getElementById('host-room-code'),
      btnCopyRoomCode: document.getElementById('btn-copy-room-code'),
      hostRoomStatus: document.getElementById('host-room-status'),
      inputJoinCode: document.getElementById('input-join-code'),
      btnJoinRoom: document.getElementById('btn-join-room'),
      joinRoomStatus: document.getElementById('join-room-status'),

      directColorSelect: document.getElementById('direct-color-select'),
      directTimeSelect: document.getElementById('direct-time-select'),
      btnGenOffer: document.getElementById('btn-gen-offer'),
      directOfferOut: document.getElementById('direct-offer-out'),
      btnCopyOffer: document.getElementById('btn-copy-offer'),
      directAnswerIn: document.getElementById('direct-answer-in'),
      btnCompleteAnswer: document.getElementById('btn-complete-answer'),
      directOfferIn: document.getElementById('direct-offer-in'),
      btnAcceptOffer: document.getElementById('btn-accept-offer'),
      directAnswerOut: document.getElementById('direct-answer-out'),
      btnCopyAnswer: document.getElementById('btn-copy-answer'),
      directStatus: document.getElementById('direct-status'),

      soloModeSelect: document.getElementById('solo-mode-select'),
      soloColorSelect: document.getElementById('solo-color-select'),
      soloLevelSelect: document.getElementById('solo-level-select'),
      soloTimeSelect: document.getElementById('solo-time-select'),
      btnStartSolo: document.getElementById('btn-start-solo'),

      toastContainer: document.getElementById('toast-container')
    };
  };

  App.prototype._initBoard = function () {
    var self = this;
    this.boardUI = new ChessApp.BoardUI(this.el.boardContainer, {
      onAttemptMove: function (from, to) {
        return self.attemptUserMove(from, to);
      },
      onSquareIntercept: function (sq) {
        if (self.adminHooks.interceptSquareClick) {
          return !!self.adminHooks.interceptSquareClick(sq);
        }
        return false;
      },
      canSelectPiece: function (sq, piece) {
        if (self.adminHooks.canSelectPiece) {
          return self.adminHooks.canSelectPiece(sq, piece);
        }
        if (self.mode === 'local') return piece.color === self.engine.turn;
        return piece.color === self.myColor;
      },
      shouldAllowDirectAttempt: function (from, to, piece) {
        if (self.adminHooks.shouldAllowDirectAttempt) {
          return !!self.adminHooks.shouldAllowDirectAttempt(from, to, piece);
        }
        return false;
      }
    });
    if (this.el.themeSelect) {
      this.el.themeSelect.value = this.boardUI.theme;
    }
  };

  App.prototype._initP2P = function () {
    var self = this;
    this.p2p = new ChessApp.P2P({
      onStatus: function (state, text) {
        self._updateConnPill(state, text);
      },
      onPing: function (rtt) {
        if (self.p2p.connected) {
          self._updateConnPill('connected', 'P2P • ' + rtt + 'ms');
        }
      },
      onConnect: function (info) {
        self._onP2PConnected(info);
      },
      onDisconnect: function (reason) {
        self.toast(reason || 'Opponent disconnected', 'warn');
        self._updateConnPill('disconnected', 'Disconnected');
      },
      onMessage: function (msg) {
        self._handleP2PMessage(msg);
      },
      onError: function (msg) {
        self.toast(msg, 'error');
      }
    });
  };

  App.prototype._updateConnPill = function (state, text) {
    if (!this.el.connPill || !this.el.connText) return;
    this.el.connPill.dataset.state = state;
    this.el.connText.textContent = text;
  };

  App.prototype._bindUI = function () {
    var self = this;

    if (this.el.themeSelect) {
      this.el.themeSelect.addEventListener('change', function () {
        self.boardUI.setTheme(this.value);
      });
    }

    if (this.el.btnSound) {
      this._syncSoundIcon();
      this.el.btnSound.addEventListener('click', function () {
        ChessApp.Sound.toggleMute();
        self._syncSoundIcon();
      });
    }

    if (this.el.btnNewGame) {
      this.el.btnNewGame.addEventListener('click', function () {
        self.openModal();
      });
    }

    if (this.el.btnCloseModal) {
      this.el.btnCloseModal.addEventListener('click', function () {
        self.closeModal();
      });
    }

    if (this.el.playModal) {
      this.el.playModal.addEventListener('click', function (ev) {
        if (ev.target === self.el.playModal) self.closeModal();
      });
      var tabBtns = this.el.playModal.querySelectorAll('[data-modal-tab]');
      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var target = this.dataset.modalTab;
          tabBtns.forEach(function (b) { b.classList.toggle('active', b === btn); });
          self.el.playModal.querySelectorAll('.modal-pane').forEach(function (pane) {
            pane.classList.toggle('active', pane.dataset.pane === target);
          });
        });
      });
    }

    if (this.el.inputPlayerName) {
      this.el.inputPlayerName.value = this.localName;
      this.el.inputPlayerName.addEventListener('input', function () {
        self.localName = this.value.trim() || 'Player';
        try { localStorage.setItem(NAME_KEY, self.localName); } catch (e) {}
        self.renderAll();
      });
    }

    // Room Code P2P
    if (this.el.btnCreateRoom) {
      this.el.btnCreateRoom.addEventListener('click', function () {
        self._handleCreateRoom();
      });
    }
    if (this.el.btnCopyRoomCode) {
      this.el.btnCopyRoomCode.addEventListener('click', function () {
        self._copyText(self.el.hostRoomCode.textContent, 'Room code copied!');
      });
    }
    if (this.el.btnJoinRoom) {
      this.el.btnJoinRoom.addEventListener('click', function () {
        self._handleJoinRoom();
      });
    }
    if (this.el.inputJoinCode) {
      this.el.inputJoinCode.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') self._handleJoinRoom();
      });
    }

    // Zero-Server Direct SDP P2P
    if (this.el.btnGenOffer) {
      this.el.btnGenOffer.addEventListener('click', async function () {
        try {
          self.el.directStatus.textContent = 'Gathering ICE candidates...';
          self._pendingDirectConfig = {
            color: self.el.directColorSelect.value,
            timeSpec: self.el.directTimeSelect.value
          };
          var code = await self.p2p.createDirectOffer();
          self.el.directOfferOut.value = code;
          self.el.directStatus.textContent = 'Offer ready! Send it to your opponent, then paste their Answer below.';
        } catch (err) {
          self.el.directStatus.textContent = 'Error: ' + err.message;
        }
      });
    }
    if (this.el.btnCopyOffer) {
      this.el.btnCopyOffer.addEventListener('click', function () {
        if (self.el.directOfferOut.value) self._copyText(self.el.directOfferOut.value, 'Offer code copied!');
      });
    }
    if (this.el.btnCompleteAnswer) {
      this.el.btnCompleteAnswer.addEventListener('click', async function () {
        try {
          await self.p2p.completeDirectAnswer(self.el.directAnswerIn.value);
          self.el.directStatus.textContent = 'Connecting directly...';
        } catch (err) {
          self.el.directStatus.textContent = 'Error: ' + err.message;
        }
      });
    }
    if (this.el.btnAcceptOffer) {
      this.el.btnAcceptOffer.addEventListener('click', async function () {
        try {
          self.el.directStatus.textContent = 'Creating Answer code...';
          var ans = await self.p2p.acceptDirectOffer(self.el.directOfferIn.value);
          self.el.directAnswerOut.value = ans;
          self.el.directStatus.textContent = 'Answer ready! Send it back to the Host to connect.';
        } catch (err) {
          self.el.directStatus.textContent = 'Error: ' + err.message;
        }
      });
    }
    if (this.el.btnCopyAnswer) {
      this.el.btnCopyAnswer.addEventListener('click', function () {
        if (self.el.directAnswerOut.value) self._copyText(self.el.directAnswerOut.value, 'Answer code copied!');
      });
    }

    // Solo / Local
    if (this.el.btnStartSolo) {
      this.el.btnStartSolo.addEventListener('click', function () {
        self.p2p.disconnect(true);
        self.startSoloGame({
          mode: self.el.soloModeSelect.value,
          color: self.el.soloColorSelect.value,
          level: parseInt(self.el.soloLevelSelect.value, 10) || 2,
          timeSpec: self.el.soloTimeSelect.value
        });
        self.closeModal();
      });
    }

    // History Nav & Controls
    this.el.btnJumpLive.addEventListener('click', function () { self.jumpToPly(null); });
    this.el.btnNavStart.addEventListener('click', function () { self.jumpToPly(0); });
    this.el.btnNavPrev.addEventListener('click', function () {
      var cur = self.viewPly === null ? self.engine.history.length : self.viewPly;
      self.jumpToPly(Math.max(0, cur - 1));
    });
    this.el.btnNavNext.addEventListener('click', function () {
      if (self.viewPly === null) return;
      var next = self.viewPly + 1;
      self.jumpToPly(next >= self.engine.history.length ? null : next);
    });
    this.el.btnNavEnd.addEventListener('click', function () { self.jumpToPly(null); });

    document.addEventListener('keydown', function (ev) {
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'SELECT')) return;
      if (ev.key === 'ArrowLeft') {
        var cur = self.viewPly === null ? self.engine.history.length : self.viewPly;
        self.jumpToPly(Math.max(0, cur - 1));
      } else if (ev.key === 'ArrowRight') {
        if (self.viewPly === null) return;
        var next = self.viewPly + 1;
        self.jumpToPly(next >= self.engine.history.length ? null : next);
      } else if (ev.key === 'f' || ev.key === 'F') {
        self.boardUI.flip();
        self.renderPlayers();
      }
    });

    this.el.btnFlip.addEventListener('click', function () {
      self.boardUI.flip();
      self.renderPlayers();
    });

    this.el.btnTakeback.addEventListener('click', function () {
      self.requestTakeback();
    });
    this.el.btnDraw.addEventListener('click', function () {
      self.offerDraw();
    });
    this.el.btnResign.addEventListener('click', function () {
      self.resign();
    });
    this.el.btnCopyFen.addEventListener('click', function () {
      self._copyText(self.engine.toFEN(), 'FEN copied!');
    });
    this.el.btnCopyPgn.addEventListener('click', function () {
      var whiteN = self.myColor === 'w' ? self.localName : (self.mode === 'local' ? 'White' : self.opponentName);
      var blackN = self.myColor === 'b' ? self.localName : (self.mode === 'local' ? 'Black' : self.opponentName);
      self._copyText(self.engine.toPGN({
        white: whiteN,
        black: blackN,
        result: self.gameOver ? self.gameOver.result : '*'
      }), 'PGN copied!');
    });

    // Chat
    this.el.btnChatSend.addEventListener('click', function () {
      self._sendChatFromInput();
    });
    this.el.chatInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') self._sendChatFromInput();
    });
    document.querySelectorAll('.quick-emoji-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.sendChat(this.textContent);
      });
    });
  };

  App.prototype._syncSoundIcon = function () {
    if (!this.el.btnSound) return;
    var muted = ChessApp.Sound.isMuted();
    this.el.btnSound.textContent = muted ? '🔇' : '🔊';
    this.el.btnSound.title = muted ? 'Unmute sounds' : 'Mute sounds';
  };

  App.prototype.openModal = function () {
    if (this.el.playModal) this.el.playModal.classList.remove('hidden');
  };

  App.prototype.closeModal = function () {
    if (this.el.playModal) this.el.playModal.classList.add('hidden');
  };

  App.prototype._handleCreateRoom = async function () {
    this.el.hostRoomStatus.textContent = 'Creating room...';
    this.el.btnCreateRoom.disabled = true;
    try {
      this._pendingRoomConfig = {
        color: this.el.createColorSelect.value,
        timeSpec: this.el.createTimeSelect.value
      };
      var res = await this.p2p.createRoom();
      this.el.hostRoomBox.classList.remove('hidden');
      this.el.hostRoomCode.textContent = res.code;
      this.el.hostRoomStatus.textContent = 'Waiting for opponent to join room ' + res.code + '...';
    } catch (err) {
      this.el.hostRoomStatus.textContent = 'Failed: ' + err.message;
    } finally {
      this.el.btnCreateRoom.disabled = false;
    }
  };

  App.prototype._handleJoinRoom = async function () {
    var code = this.el.inputJoinCode.value.trim();
    if (!code) {
      this.el.joinRoomStatus.textContent = 'Enter a room code first.';
      return;
    }
    this.el.joinRoomStatus.textContent = 'Connecting...';
    this.el.btnJoinRoom.disabled = true;
    try {
      await this.p2p.joinRoom(code);
      this.el.joinRoomStatus.textContent = 'Connected!';
    } catch (err) {
      this.el.joinRoomStatus.textContent = err.message;
    } finally {
      this.el.btnJoinRoom.disabled = false;
    }
  };

  App.prototype._onP2PConnected = function (info) {
    this.mode = 'p2p';
    this._isHost = info.role === 'host';
    this.closeModal();

    if (this._isHost) {
      var cfg = (info.mode === 'direct' ? this._pendingDirectConfig : this._pendingRoomConfig) || { color: 'w', timeSpec: '300+0' };
      var hostColor = cfg.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : cfg.color;
      this._startP2PNewGame(hostColor, cfg.timeSpec);
      this.p2p.send({
        type: 'hello',
        name: this.localName,
        hostColor: hostColor,
        timeSpec: cfg.timeSpec,
        state: this.engine.serialize(),
        clocks: this.clocks,
        clockRates: this.clockRates
      });
    } else {
      this.p2p.send({ type: 'hello_ack', name: this.localName });
    }
    this.toast('Peer-to-peer link active!', 'success');
  };

  App.prototype._startP2PNewGame = function (myColor, timeSpec) {
    this.engine.reset();
    this.myColor = myColor;
    this.timeControl = parseTimeControl(timeSpec);
    this.clocks = { w: this.timeControl.baseMs, b: this.timeControl.baseMs };
    this.clockRates = { w: 1, b: 1 };
    this.gameOver = null;
    this.viewPly = null;
    this._lowTimeBeeped = { w: false, b: false };
    this.boardUI.setOrientation(myColor);
    this.boardUI.clearSelection();
    this.boardUI.premove = null;
    this.clearRequests();
    this.addChatSystem('New P2P match started (' + (myColor === 'w' ? 'You are White' : 'You are Black') + ').');
    ChessApp.Sound.play('start');
    this.renderAll();
    this._notifyStateChanged('new_game');
  };

  App.prototype.startSoloGame = function (cfg, silent) {
    clearTimeout(this._botTimer);
    this.mode = cfg.mode === 'bot' ? 'bot' : 'local';
    this.botLevel = cfg.level || 2;
    this.engine.reset();
    this.timeControl = parseTimeControl(cfg.timeSpec || '0+0');
    this.clocks = { w: this.timeControl.baseMs, b: this.timeControl.baseMs };
    this.clockRates = { w: 1, b: 1 };
    this.gameOver = null;
    this.viewPly = null;
    this._lowTimeBeeped = { w: false, b: false };
    this.boardUI.clearSelection();
    this.boardUI.premove = null;
    this.clearRequests();

    if (this.mode === 'bot') {
      var c = cfg.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : (cfg.color || 'w');
      this.myColor = c;
      var names = { 1: 'Bot (Beginner)', 2: 'Bot (Casual)', 3: 'Bot (Club)', 4: 'Bot (Strong)' };
      this.opponentName = names[this.botLevel] || 'Computer';
      this.boardUI.setOrientation(c);
      this._updateConnPill('local', 'vs ' + this.opponentName);
    } else {
      this.myColor = null;
      this.opponentName = 'Black';
      this.boardUI.setOrientation('w');
      this._updateConnPill('local', 'Local • Pass & Play');
    }

    if (!silent) {
      ChessApp.Sound.play('start');
      this.addChatSystem(this.mode === 'bot' ? ('Match vs ' + this.opponentName + ' started.') : 'Local Pass & Play started.');
    }
    this.renderAll();
    this._notifyStateChanged('new_game');
    this._maybeTriggerBot();
  };

  App.prototype._handleP2PMessage = function (msg) {
    switch (msg.type) {
      case 'hello':
        this.opponentName = msg.name || 'Opponent';
        var guestColor = msg.hostColor === 'w' ? 'b' : 'w';
        this.timeControl = parseTimeControl(msg.timeSpec);
        this.engine.deserialize(msg.state);
        this.myColor = guestColor;
        this.clocks = msg.clocks || { w: this.timeControl.baseMs, b: this.timeControl.baseMs };
        this.clockRates = msg.clockRates || { w: 1, b: 1 };
        this.gameOver = null;
        this.viewPly = null;
        this.boardUI.setOrientation(guestColor);
        this.boardUI.clearSelection();
        this.boardUI.premove = null;
        this.p2p.send({ type: 'hello_ack', name: this.localName });
        this.addChatSystem(this.opponentName + ' connected. You play as ' + (guestColor === 'w' ? 'White' : 'Black') + '.');
        ChessApp.Sound.play('start');
        this.renderAll();
        this._notifyStateChanged('sync');
        break;

      case 'hello_ack':
        this.opponentName = msg.name || 'Opponent';
        this.renderPlayers();
        break;

      case 'move':
        this._applyRemoteMove(msg);
        break;

      case 'sync':
        this.engine.deserialize(msg.state);
        if (msg.clocks) this.clocks = msg.clocks;
        if (msg.clockRates) this.clockRates = msg.clockRates;
        if (msg.gameOver !== undefined) this.gameOver = msg.gameOver;
        this.viewPly = null;
        this.boardUI.clearSelection();
        this.renderAll();
        if (msg.animFrom && msg.animTo) {
          this.boardUI.animateMove(msg.animFrom, msg.animTo);
        }
        if (msg.sound) {
          ChessApp.Sound.play(msg.sound);
        }
        this._notifyStateChanged('sync');
        this._tryQueuedPremove();
        break;

      case 'fx':
        this.boardUI.triggerFx(msg.effect, msg.params || {});
        if (msg.effect === 'toast' && msg.params && msg.params.text) {
          this.toast(msg.params.text, msg.params.kind || 'info');
        }
        if (msg.effect === 'flip') {
          this.renderPlayers();
        }
        break;

      case 'chat':
        this.addChatMessage(msg.sender || this.opponentName, msg.text, false);
        ChessApp.Sound.play('chat');
        break;

      case 'resign':
        var winner = this.myColor || (this.engine.turn === 'w' ? 'b' : 'w');
        this._finishGame({
          over: true,
          result: winner === 'w' ? '1-0' : '0-1',
          winner: winner,
          reason: 'resign',
          label: (this.opponentName || 'Opponent') + ' resigned'
        });
        break;

      case 'draw_offer':
        this._showIncomingRequest('Opponent offers a draw.', function (app) {
          app.p2p.send({ type: 'draw_accept' });
          app._finishGame({ over: true, result: '1/2-1/2', winner: null, reason: 'agreement', label: 'Draw by agreement' });
        }, function (app) {
          app.p2p.send({ type: 'draw_decline' });
        });
        break;

      case 'draw_accept':
        this._finishGame({ over: true, result: '1/2-1/2', winner: null, reason: 'agreement', label: 'Draw by agreement' });
        break;

      case 'draw_decline':
        this.toast('Draw offer declined.', 'info');
        break;

      case 'takeback_req':
        this._showIncomingRequest('Opponent requests a takeback.', function (app) {
          app.engine.undoPly(1);
          app.gameOver = null;
          app.viewPly = null;
          app.p2p.send({ type: 'takeback_accept', state: app.engine.serialize(), clocks: app.clocks });
          app.renderAll();
          app._notifyStateChanged('undo');
        }, function (app) {
          app.p2p.send({ type: 'takeback_decline' });
        });
        break;

      case 'takeback_accept':
        this.engine.deserialize(msg.state);
        if (msg.clocks) this.clocks = msg.clocks;
        this.gameOver = null;
        this.viewPly = null;
        this.renderAll();
        this._notifyStateChanged('undo');
        this.toast('Takeback accepted.', 'success');
        break;

      case 'takeback_decline':
        this.toast('Takeback declined.', 'info');
        break;

      case 'rematch_req':
        this._showIncomingRequest('Opponent wants a rematch!', function (app) {
          var nextMy = app.myColor === 'w' ? 'b' : 'w';
          app._startP2PNewGame(nextMy, app.timeControl.label);
          app.p2p.send({
            type: 'rematch_accept',
            guestColor: nextMy === 'w' ? 'b' : 'w',
            timeSpec: app.timeControl.label,
            state: app.engine.serialize(),
            clocks: app.clocks
          });
        }, function () {});
        break;

      case 'rematch_accept':
        this.engine.deserialize(msg.state);
        this.myColor = msg.guestColor;
        this.clocks = msg.clocks || { w: this.timeControl.baseMs, b: this.timeControl.baseMs };
        this.clockRates = { w: 1, b: 1 };
        this.gameOver = null;
        this.viewPly = null;
        this.boardUI.setOrientation(this.myColor);
        this.boardUI.clearSelection();
        this.boardUI.premove = null;
        ChessApp.Sound.play('start');
        this.renderAll();
        this._notifyStateChanged('new_game');
        break;
    }
  };

  App.prototype._applyRemoteMove = function (msg) {
    var res = this.engine.makeMove(msg.from, msg.to, msg.promotion, { includeSecret: true });
    if (!res.ok) {
      if (msg.state) {
        this.engine.deserialize(msg.state);
      } else {
        return;
      }
    }
    if (msg.clocks) this.clocks = msg.clocks;
    this.viewPly = null;
    this.boardUI.clearSelection();
    this._playMoveSound(res.move);
    this.renderAll();
    this.boardUI.animateMove(msg.from, msg.to);
    this._checkGameEnd();
    this._notifyStateChanged('move');
    this._tryQueuedPremove();
  };

  App.prototype._tryQueuedPremove = function () {
    if (!this.boardUI.premove || this.gameOver) return;
    if (this.mode !== 'local' && this.engine.turn !== this.myColor) return;
    var pm = this.boardUI.premove;
    this.boardUI.premove = null;
    var self = this;
    setTimeout(function () {
      self.attemptUserMove(pm.from, pm.to, true);
    }, 35);
  };

  App.prototype.attemptUserMove = function (from, to, isPremove) {
    if (this.gameOver || this.viewPly !== null) return false;

    // Admin hook (e.g. Puppet Master, Free Move, Double Turn, Blunder Guard)
    if (this.adminHooks.interceptAttemptMove) {
      var handled = this.adminHooks.interceptAttemptMove(from, to, { isPremove: !!isPremove });
      if (handled !== undefined && handled !== null) {
        return !!handled;
      }
    }

    if (this.mode !== 'local' && this.engine.turn !== this.myColor) return false;
    var piece = this.engine.getPiece(from.r, from.c);
    if (!piece || piece.color !== this.engine.turn) return false;

    // Validate against full engine rules INCLUDING secret backwards pawn!
    var legal = this.engine.getLegalMoves(from.r, from.c, { includeSecret: true });
    var matches = [];
    for (var i = 0; i < legal.length; i++) {
      if (legal[i].to.r === to.r && legal[i].to.c === to.c) {
        matches.push(legal[i]);
      }
    }
    if (matches.length === 0) {
      if (!isPremove) ChessApp.Sound.play('illegal');
      return false;
    }

    // Promotion picker if needed
    var isPromo = matches.some(function (m) { return !!m.promotion; });
    if (isPromo) {
      if (isPremove) {
        return this.commitMove(from, to, 'q', {});
      }
      var self = this;
      this.boardUI.showPromotionPicker(to, piece.color, function (promoType) {
        self.commitMove(from, to, promoType, {});
      }, function () {
        self.renderAll();
      });
      return true;
    }

    return this.commitMove(from, to, null, {});
  };

  App.prototype.commitMove = function (from, to, promotion, opts) {
    opts = opts || {};

    // Admin Blunder Guard hook
    if (!opts.skipGuard && this.adminHooks.onBeforeMove) {
      var allow = this.adminHooks.onBeforeMove(from, to, promotion);
      if (allow === false) return false;
    }

    var movingColor = this.engine.turn;
    var res = this.engine.makeMove(from, to, promotion, {
      includeSecret: true,
      keepTurn: !!opts.keepTurn
    });
    if (!res.ok) return false;

    // Add increment after move (only if game already started with >= 1 move)
    if (this.timeControl.baseMs > 0 && this.engine.history.length > 1) {
      this.clocks[movingColor] += this.timeControl.incMs;
    }

    this.viewPly = null;
    this._playMoveSound(res.move);
    this.renderAll();
    this.boardUI.animateMove(from, to);

    if (this.mode === 'p2p' && this.p2p.connected) {
      if (opts.keepTurn || res.move.forced) {
        this.broadcastAdminSync({ animFrom: from, animTo: to });
      } else {
        this.p2p.send({
          type: 'move',
          from: from,
          to: to,
          promotion: promotion,
          clocks: this.clocks,
          state: this.engine.serialize()
        });
      }
    }

    this._checkGameEnd();
    this._notifyStateChanged('move');
    this._maybeTriggerBot();
    return true;
  };

  App.prototype._playMoveSound = function (move) {
    if (!move) {
      ChessApp.Sound.play('move');
      return;
    }
    if (move.san && (move.san.indexOf('+') !== -1 || move.san.indexOf('#') !== -1)) {
      ChessApp.Sound.play('check');
    } else if (move.promotion) {
      ChessApp.Sound.play('promote');
    } else if (move.castle) {
      ChessApp.Sound.play('castle');
    } else if (move.captured) {
      ChessApp.Sound.play('capture');
    } else {
      ChessApp.Sound.play('move');
    }
  };

  App.prototype._checkGameEnd = function () {
    var status = this.engine.getGameStatus();
    if (status.over) {
      this._finishGame(status);
    }
  };

  App.prototype._finishGame = function (status) {
    this.gameOver = status;
    clearTimeout(this._botTimer);
    ChessApp.Sound.play('gameover');
    this.renderAll();
    this._notifyStateChanged('gameover');
  };

  App.prototype._maybeTriggerBot = function () {
    if (this.mode !== 'bot' || this.gameOver) return;
    if (this.engine.turn === this.myColor) return;
    var self = this;
    clearTimeout(this._botTimer);
    var delay = 280 + Math.floor(Math.random() * 260);
    this._botTimer = setTimeout(function () {
      if (self.gameOver || self.mode !== 'bot' || self.engine.turn === self.myColor) return;
      var move = ChessApp.Bot.chooseMove(self.engine, self.botLevel);
      if (move) {
        self.commitMove(move.from, move.to, move.promotion || null, { skipGuard: true });
      }
    }, delay);
  };

  App.prototype._startClockLoop = function () {
    var self = this;
    this._lastTickTs = Date.now();
    this._clockTimer = setInterval(function () {
      var now = Date.now();
      var dt = now - self._lastTickTs;
      self._lastTickTs = now;

      if (self.gameOver || self.timeControl.baseMs <= 0) return;
      if (self.engine.history.length < 2) return; // Clocks start after White & Black move once

      var active = self.engine.turn;
      var rate = (self.clockRates && self.clockRates[active]) || 1;
      self.clocks[active] = Math.max(0, self.clocks[active] - dt * rate);

      if (self.clocks[active] > 0 && self.clocks[active] < 10000 && !self._lowTimeBeeped[active]) {
        self._lowTimeBeeped[active] = true;
        if (self.mode === 'local' || active === self.myColor) {
          ChessApp.Sound.play('lowtime');
        }
      }

      self.renderClocks();

      if (self.clocks[active] <= 0) {
        var winner = active === 'w' ? 'b' : 'w';
        self._finishGame({
          over: true,
          result: winner === 'w' ? '1-0' : '0-1',
          winner: winner,
          reason: 'timeout',
          label: (winner === 'w' ? 'White' : 'Black') + ' wins on time'
        });
      }
    }, 100);
  };

  App.prototype.jumpToPly = function (ply) {
    if (ply === null || ply >= this.engine.history.length) {
      this.viewPly = null;
    } else {
      this.viewPly = Math.max(0, ply);
    }
    this.boardUI.clearSelection();
    this.renderBoardAndHistory();
  };

  App.prototype.renderAll = function () {
    this.renderBoardAndHistory();
    this.renderPlayers();
    this.renderClocks();
    this.renderStatusBanner();
  };

  App.prototype.renderBoardAndHistory = function () {
    var hist = this.engine.history;
    var overrideBoard = null;
    var overrideTurn = null;
    var lastMove = hist.length > 0 ? hist[hist.length - 1] : null;
    var isLive = this.viewPly === null;

    if (!isLive) {
      if (this.viewPly === 0) {
        var startEng = new ChessApp.Engine();
        overrideBoard = startEng.board;
        overrideTurn = 'w';
        lastMove = null;
      } else {
        var rec = hist[this.viewPly - 1];
        if (rec && rec.fenAfter) {
          var tmp = new ChessApp.Engine();
          tmp.loadFEN(rec.fenAfter);
          overrideBoard = tmp.board;
          overrideTurn = tmp.turn;
        }
        lastMove = rec || null;
      }
    }

    if (this.el.historyBanner) {
      this.el.historyBanner.classList.toggle('hidden', isLive);
    }

    this.boardUI.render(this.engine, {
      interactive: isLive && !this.gameOver,
      playerColor: this.mode === 'local' ? null : this.myColor,
      overrideBoard: overrideBoard,
      overrideTurn: overrideTurn,
      lastMove: lastMove,
      bypassLocks: !!(this.adminHooks && this.adminHooks.bypassLocks)
    });

    // Opening identification
    if (this.el.openingName) {
      var op = ChessApp.Openings.identify(hist);
      this.el.openingName.textContent = op || 'Custom Position';
    }

    // Move list 2-column table
    if (this.el.moveList) {
      var activePly = isLive ? hist.length : this.viewPly;
      var html = '';
      for (var i = 0; i < hist.length; i += 2) {
        var num = Math.floor(i / 2) + 1;
        var wMove = hist[i];
        var bMove = hist[i + 1];
        var wCls = 'move-cell' + (activePly === i + 1 ? ' active' : '');
        var bCls = 'move-cell' + (bMove && activePly === i + 2 ? ' active' : '');
        var wBadge = wMove.badge ? '<span class="hist-badge badge-' + wMove.badge.kind + '">' + wMove.badge.text + '</span>' : '';
        var bBadge = (bMove && bMove.badge) ? '<span class="hist-badge badge-' + bMove.badge.kind + '">' + bMove.badge.text + '</span>' : '';
        html += '<div class="move-row">' +
          '<span class="move-num">' + num + '.</span>' +
          '<button type="button" class="' + wCls + '" data-ply="' + (i + 1) + '">' + this._esc(wMove.san) + wBadge + '</button>' +
          (bMove
            ? '<button type="button" class="' + bCls + '" data-ply="' + (i + 2) + '">' + this._esc(bMove.san) + bBadge + '</button>'
            : '<span class="move-cell empty"></span>') +
          '</div>';
      }
      if (!html) {
        html = '<div class="move-empty">Make a move on the board to begin.</div>';
      }
      this.el.moveList.innerHTML = html;
      var self = this;
      this.el.moveList.querySelectorAll('button[data-ply]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var p = parseInt(this.dataset.ply, 10);
          self.jumpToPly(p >= self.engine.history.length ? null : p);
        });
      });
      if (isLive) {
        this.el.moveList.scrollTop = this.el.moveList.scrollHeight;
      }
    }
  };

  App.prototype.renderPlayers = function () {
    var topColor = this.boardUI.orientation === 'w' ? 'b' : 'w';
    var bottomColor = this.boardUI.orientation === 'w' ? 'w' : 'b';
    var mat = this.engine.getCapturedAndMaterial();

    var getName = function (color, app) {
      if (app.mode === 'local') return color === 'w' ? (app.localName + ' (White)') : 'Player 2 (Black)';
      return color === app.myColor ? app.localName : (app.opponentName || (color === 'w' ? 'White' : 'Black'));
    };

    var renderCaptured = function (el, pieces) {
      var out = '';
      for (var i = 0; i < pieces.length; i++) {
        out += '<span class="cap-icon">' + ChessApp.Pieces.getSVG(pieces[i].color, pieces[i].type) + '</span>';
      }
      el.innerHTML = out;
    };

    this.el.topName.textContent = getName(topColor, this);
    this.el.bottomName.textContent = getName(bottomColor, this);
    this.el.topAvatar.className = 'player-avatar ' + (topColor === 'w' ? 'avatar-w' : 'avatar-b');
    this.el.bottomAvatar.className = 'player-avatar ' + (bottomColor === 'w' ? 'avatar-w' : 'avatar-b');

    var topCap = topColor === 'w' ? mat.capturedByWhite : mat.capturedByBlack;
    var botCap = bottomColor === 'w' ? mat.capturedByWhite : mat.capturedByBlack;
    var topAdv = topColor === 'w' ? mat.whiteAdvantage : mat.blackAdvantage;
    var botAdv = bottomColor === 'w' ? mat.whiteAdvantage : mat.blackAdvantage;

    renderCaptured(this.el.topCaptured, topCap);
    renderCaptured(this.el.bottomCaptured, botCap);
    this.el.topAdv.textContent = topAdv > 0 ? ('+' + topAdv) : '';
    this.el.bottomAdv.textContent = botAdv > 0 ? ('+' + botAdv) : '';

    this.renderClocks();
  };

  App.prototype.renderClocks = function () {
    var topColor = this.boardUI.orientation === 'w' ? 'b' : 'w';
    var bottomColor = this.boardUI.orientation === 'w' ? 'w' : 'b';
    var unlimited = this.timeControl.baseMs <= 0;

    var applyClock = function (el, color, activeTurn, ms, isOver) {
      el.textContent = unlimited ? '∞' : formatClock(ms);
      el.classList.toggle('active', !isOver && activeTurn === color);
      el.classList.toggle('low-time', !unlimited && !isOver && ms > 0 && ms < 20000);
    };

    applyClock(this.el.topClock, topColor, this.engine.turn, this.clocks[topColor], !!this.gameOver);
    applyClock(this.el.bottomClock, bottomColor, this.engine.turn, this.clocks[bottomColor], !!this.gameOver);
  };

  App.prototype.renderStatusBanner = function () {
    if (!this.el.gameStatusBanner) return;
    if (!this.gameOver) {
      this.el.gameStatusBanner.classList.add('hidden');
      this.el.gameStatusBanner.innerHTML = '';
      return;
    }
    this.el.gameStatusBanner.classList.remove('hidden');
    var rematchBtn = '<button type="button" class="btn btn-primary btn-sm" id="btn-rematch-action">' +
      (this.mode === 'p2p' ? 'Request Rematch' : 'Rematch') + '</button>';
    this.el.gameStatusBanner.innerHTML =
      '<div class="status-title">' + this._esc(this.gameOver.result) + ' • ' + this._esc(this.gameOver.label) + '</div>' +
      rematchBtn;

    var self = this;
    var btn = document.getElementById('btn-rematch-action');
    if (btn) {
      btn.addEventListener('click', function () {
        if (self.mode === 'p2p' && self.p2p.connected) {
          self.p2p.send({ type: 'rematch_req' });
          self.toast('Rematch request sent!', 'info');
        } else {
          var nextC = self.myColor === 'w' ? 'b' : 'w';
          self.startSoloGame({
            mode: self.mode,
            color: self.mode === 'bot' ? nextC : 'w',
            level: self.botLevel,
            timeSpec: self.timeControl.label
          });
        }
      });
    }
  };

  App.prototype.requestTakeback = function () {
    if (this.engine.history.length === 0) return;
    if (this.mode === 'p2p' && this.p2p.connected) {
      this.p2p.send({ type: 'takeback_req' });
      this.toast('Takeback request sent.', 'info');
    } else {
      var plies = this.mode === 'bot' && this.engine.turn === this.myColor && this.engine.history.length >= 2 ? 2 : 1;
      this.engine.undoPly(plies);
      this.gameOver = null;
      this.viewPly = null;
      this.renderAll();
      this._notifyStateChanged('undo');
    }
  };

  App.prototype.offerDraw = function () {
    if (this.gameOver) return;
    if (this.mode === 'p2p' && this.p2p.connected) {
      this.p2p.send({ type: 'draw_offer' });
      this.toast('Draw offer sent.', 'info');
    } else {
      this._finishGame({ over: true, result: '1/2-1/2', winner: null, reason: 'agreement', label: 'Draw by agreement' });
    }
  };

  App.prototype.resign = function () {
    if (this.gameOver) return;
    var loser = this.mode === 'local' ? this.engine.turn : this.myColor;
    var winner = loser === 'w' ? 'b' : 'w';
    if (this.mode === 'p2p' && this.p2p.connected) {
      this.p2p.send({ type: 'resign' });
    }
    this._finishGame({
      over: true,
      result: winner === 'w' ? '1-0' : '0-1',
      winner: winner,
      reason: 'resign',
      label: (loser === 'w' ? 'White' : 'Black') + ' resigned'
    });
  };

  App.prototype._showIncomingRequest = function (text, onAccept, onDecline) {
    if (!this.el.requestBanner) return;
    this.el.requestBanner.classList.remove('hidden');
    this.el.requestBanner.innerHTML =
      '<span>' + this._esc(text) + '</span>' +
      '<div class="req-actions">' +
        '<button type="button" class="btn btn-primary btn-xs" id="btn-req-yes">Accept</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" id="btn-req-no">Decline</button>' +
      '</div>';
    var self = this;
    document.getElementById('btn-req-yes').addEventListener('click', function () {
      self.clearRequests();
      onAccept(self);
    });
    document.getElementById('btn-req-no').addEventListener('click', function () {
      self.clearRequests();
      onDecline(self);
    });
  };

  App.prototype.clearRequests = function () {
    if (this.el.requestBanner) {
      this.el.requestBanner.classList.add('hidden');
      this.el.requestBanner.innerHTML = '';
    }
  };

  App.prototype._sendChatFromInput = function () {
    var text = this.el.chatInput.value.trim();
    if (!text) return;
    this.el.chatInput.value = '';
    this.sendChat(text);
  };

  App.prototype.sendChat = function (text) {
    this.addChatMessage(this.localName, text, true);
    if (this.mode === 'p2p' && this.p2p.connected) {
      this.p2p.send({ type: 'chat', sender: this.localName, text: text });
    }
  };

  App.prototype.addChatMessage = function (sender, text, isSelf) {
    if (!this.el.chatLog) return;
    var div = document.createElement('div');
    div.className = 'chat-msg ' + (isSelf ? 'self' : 'peer');
    div.innerHTML = '<span class="chat-sender">' + this._esc(sender) + ':</span> ' + this._esc(text);
    this.el.chatLog.appendChild(div);
    this.el.chatLog.scrollTop = this.el.chatLog.scrollHeight;
  };

  App.prototype.addChatSystem = function (text) {
    if (!this.el.chatLog) return;
    var div = document.createElement('div');
    div.className = 'chat-msg system';
    div.textContent = text;
    this.el.chatLog.appendChild(div);
    this.el.chatLog.scrollTop = this.el.chatLog.scrollHeight;
  };

  App.prototype.toast = function (text, kind) {
    if (!this.el.toastContainer) return;
    var div = document.createElement('div');
    div.className = 'toast toast-' + (kind || 'info');
    div.textContent = text;
    this.el.toastContainer.appendChild(div);
    setTimeout(function () {
      div.classList.add('fade-out');
      setTimeout(function () { div.remove(); }, 250);
    }, 3400);
  };

  App.prototype._copyText = function (text, okMessage) {
    var self = this;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        self.toast(okMessage || 'Copied!', 'success');
      }).catch(function () {
        self._fallbackCopy(text, okMessage);
      });
    } else {
      this._fallbackCopy(text, okMessage);
    }
  };

  App.prototype._fallbackCopy = function (text, okMessage) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      this.toast(okMessage || 'Copied!', 'success');
    } catch (e) {
      this.toast('Copy failed.', 'error');
    }
    ta.remove();
  };

  App.prototype._esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  // --- Admin Extension Hooks ---
  App.prototype.registerAdminHooks = function (hooks) {
    this.adminHooks = hooks || {};
  };

  App.prototype.broadcastAdminSync = function (options) {
    options = options || {};
    if (this.mode === 'p2p' && this.p2p.connected) {
      this.p2p.send({
        type: 'sync',
        state: this.engine.serialize(),
        clocks: this.clocks,
        clockRates: this.clockRates,
        gameOver: this.gameOver,
        animFrom: options.animFrom || null,
        animTo: options.animTo || null,
        sound: options.sound || null
      });
    }
  };

  App.prototype.sendAdminFx = function (effect, params) {
    if (this.mode === 'p2p' && this.p2p.connected) {
      this.p2p.send({ type: 'fx', effect: effect, params: params || {} });
    }
  };

  App.prototype._notifyStateChanged = function (reason) {
    if (this.adminHooks && typeof this.adminHooks.onStateChange === 'function') {
      this.adminHooks.onStateChange(reason);
    }
  };

  ChessApp.App = App;

  document.addEventListener('DOMContentLoaded', function () {
    global.chessApp = new App();
  });
})(window);
