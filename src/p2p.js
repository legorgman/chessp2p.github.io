(function (global) {
  'use strict';

  var ChessApp = global.ChessApp = global.ChessApp || {};

  var ROOM_PREFIX = 'agchess-v1-';
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];

  function randomCode(len) {
    var out = '';
    for (var i = 0; i < (len || 6); i++) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return out;
  }

  function normalizeCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function bytesToBase64Url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(str) {
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  async function encodeSignalPayload(obj) {
    var jsonStr = JSON.stringify(obj);
    var rawBytes = new TextEncoder().encode(jsonStr);
    if (typeof CompressionStream === 'function') {
      try {
        var cs = new CompressionStream('deflate-raw');
        var writer = cs.writable.getWriter();
        writer.write(rawBytes);
        writer.close();
        var buf = await new Response(cs.readable).arrayBuffer();
        return 'C1:' + bytesToBase64Url(new Uint8Array(buf));
      } catch (e) {}
    }
    return 'C0:' + bytesToBase64Url(rawBytes);
  }

  async function decodeSignalPayload(code) {
    var trimmed = String(code || '').trim();
    if (trimmed.indexOf('C1:') === 0) {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('This browser cannot decode compressed direct codes (missing DecompressionStream).');
      }
      var compBytes = base64UrlToBytes(trimmed.slice(3));
      var ds = new DecompressionStream('deflate-raw');
      var writer = ds.writable.getWriter();
      writer.write(compBytes);
      writer.close();
      var buf = await new Response(ds.readable).arrayBuffer();
      return JSON.parse(new TextDecoder().decode(buf));
    }
    if (trimmed.indexOf('C0:') === 0) {
      var raw = base64UrlToBytes(trimmed.slice(3));
      return JSON.parse(new TextDecoder().decode(raw));
    }
    // Try raw JSON fallback
    return JSON.parse(trimmed);
  }

  function waitForIceGathering(pc, maxMs) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      var done = false;
      var hasCandidate = false;
      var timer = setTimeout(function () {
        finish();
      }, maxMs || 3500);

      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', onState);
        pc.removeEventListener('icecandidate', onCand);
        resolve();
      }

      function onState() {
        if (pc.iceGatheringState === 'complete') {
          finish();
        }
      }

      function onCand(ev) {
        if (ev.candidate) {
          hasCandidate = true;
        } else if (hasCandidate) {
          finish();
        }
      }

      pc.addEventListener('icegatheringstatechange', onState);
      pc.addEventListener('icecandidate', onCand);
    });
  }

  function P2PTransport(callbacks) {
    this.cb = callbacks || {};
    this.mode = null; // 'peerjs' | 'direct'
    this.role = null; // 'host' | 'guest'
    this.roomCode = null;
    this.peer = null;
    this.conn = null;
    this.pc = null;
    this.dc = null;
    this.connected = false;
    this.rttMs = null;
    this._pingTimer = null;
    this._connectTimer = null;
  }

  P2PTransport.prototype._emit = function (name, arg1, arg2) {
    if (this.cb && typeof this.cb[name] === 'function') {
      this.cb[name](arg1, arg2);
    }
  };

  P2PTransport.prototype._setStatus = function (state, text) {
    this._emit('onStatus', state, text);
  };

  P2PTransport.prototype._startHeartbeat = function () {
    this._stopHeartbeat();
    var self = this;
    this._pingTimer = setInterval(function () {
      if (self.connected) {
        self.send({ type: 'ping', ts: Date.now() });
      }
    }, 3000);
  };

  P2PTransport.prototype._stopHeartbeat = function () {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  };

  P2PTransport.prototype._handleIncomingRaw = function (data) {
    var msg = data;
    if (typeof data === 'string') {
      try {
        msg = JSON.parse(data);
      } catch (e) {
        return;
      }
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') {
      this.send({ type: 'pong', ts: msg.ts });
      return;
    }
    if (msg.type === 'pong' && typeof msg.ts === 'number') {
      this.rttMs = Math.max(1, Date.now() - msg.ts);
      this._emit('onPing', this.rttMs);
      return;
    }
    this._emit('onMessage', msg);
  };

  P2PTransport.prototype.send = function (msg) {
    if (!this.connected) return false;
    try {
      if (this.mode === 'peerjs' && this.conn && this.conn.open) {
        this.conn.send(msg);
        return true;
      }
      if (this.mode === 'direct' && this.dc && this.dc.readyState === 'open') {
        this.dc.send(JSON.stringify(msg));
        return true;
      }
    } catch (e) {}
    return false;
  };

  P2PTransport.prototype.disconnect = function (silent) {
    var wasConnected = this.connected;
    this.connected = false;
    this.rttMs = null;
    this._stopHeartbeat();
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
    try { if (this.conn) this.conn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    try { if (this.dc) this.dc.close(); } catch (e) {}
    try { if (this.pc) this.pc.close(); } catch (e) {}
    this.conn = null;
    this.peer = null;
    this.dc = null;
    this.pc = null;
    this.mode = null;
    this.roomCode = null;
    if (!silent && wasConnected) {
      this._emit('onDisconnect', 'Disconnected');
    }
  };

  // --- Mode 1: Instant PeerJS Room Code ---
  P2PTransport.prototype.createRoom = function (customCode) {
    var self = this;
    this.disconnect(true);
    if (typeof global.Peer !== 'function') {
      return Promise.reject(new Error('PeerJS library not loaded. Use Direct Code mode instead.'));
    }

    this.mode = 'peerjs';
    this.role = 'host';
    this._setStatus('connecting', 'Allocating room code...');

    var attempt = 0;
    return new Promise(function (resolve, reject) {
      function tryCreate(codeToUse) {
        var code = normalizeCode(codeToUse) || randomCode(6);
        var peerId = ROOM_PREFIX + code;
        var peer = new global.Peer(peerId, {
          debug: 0,
          config: { iceServers: ICE_SERVERS }
        });
        self.peer = peer;
        var opened = false;

        peer.on('open', function () {
          opened = true;
          self.roomCode = code;
          self._setStatus('waiting', 'Room ' + code + ' ready');
          resolve({ code: code });
        });

        peer.on('connection', function (conn) {
          if (self.conn && self.conn.open) {
            try { conn.close(); } catch (e) {}
            return;
          }
          self.conn = conn;
          self._attachPeerJSConn(conn);
        });

        peer.on('error', function (err) {
          if (!opened) {
            if (err && err.type === 'unavailable-id' && attempt < 4 && !customCode) {
              attempt++;
              try { peer.destroy(); } catch (e) {}
              tryCreate(randomCode(6));
              return;
            }
            var msg = (err && err.message) || (err && err.type) || 'Could not reach PeerJS broker';
            self._setStatus('error', msg);
            reject(new Error(msg));
          } else {
            self._emit('onError', (err && err.message) || 'P2P connection error');
          }
        });
      }

      tryCreate(customCode);
    });
  };

  P2PTransport.prototype.joinRoom = function (rawCode) {
    var self = this;
    var code = normalizeCode(rawCode);
    if (!code || code.length < 4) {
      return Promise.reject(new Error('Please enter a valid room code.'));
    }
    if (typeof global.Peer !== 'function') {
      return Promise.reject(new Error('PeerJS library not loaded. Use Direct Code mode instead.'));
    }

    this.disconnect(true);
    this.mode = 'peerjs';
    this.role = 'guest';
    this.roomCode = code;
    this._setStatus('connecting', 'Connecting to room ' + code + '...');

    return new Promise(function (resolve, reject) {
      var settled = false;
      var peer = new global.Peer({
        debug: 0,
        config: { iceServers: ICE_SERVERS }
      });
      self.peer = peer;

      self._connectTimer = setTimeout(function () {
        if (!settled) {
          settled = true;
          self.disconnect(true);
          reject(new Error('Connection timed out. Check the room code or try Direct Code mode.'));
        }
      }, 15000);

      peer.on('open', function () {
        var conn = peer.connect(ROOM_PREFIX + code, {
          reliable: true,
          serialization: 'json'
        });
        self.conn = conn;
        self._attachPeerJSConn(conn, function () {
          if (!settled) {
            settled = true;
            if (self._connectTimer) {
              clearTimeout(self._connectTimer);
              self._connectTimer = null;
            }
            resolve({ code: code });
          }
        }, function (errMsg) {
          if (!settled) {
            settled = true;
            if (self._connectTimer) {
              clearTimeout(self._connectTimer);
              self._connectTimer = null;
            }
            reject(new Error(errMsg));
          }
        });
      });

      peer.on('error', function (err) {
        var msg = err && err.type === 'peer-unavailable'
          ? 'Room "' + code + '" was not found. Make sure the host has the room open.'
          : ((err && err.message) || 'Connection failed');
        if (!settled) {
          settled = true;
          if (self._connectTimer) {
            clearTimeout(self._connectTimer);
            self._connectTimer = null;
          }
          self._setStatus('error', msg);
          reject(new Error(msg));
        } else {
          self._emit('onError', msg);
        }
      });
    });
  };

  P2PTransport.prototype._attachPeerJSConn = function (conn, onOpenOnce, onErrOnce) {
    var self = this;
    conn.on('open', function () {
      self.connected = true;
      self._setStatus('connected', 'Connected (P2P)');
      self._startHeartbeat();
      self._emit('onConnect', { role: self.role, mode: 'peerjs', code: self.roomCode });
      if (onOpenOnce) onOpenOnce();
    });
    conn.on('data', function (data) {
      self._handleIncomingRaw(data);
    });
    conn.on('close', function () {
      var was = self.connected;
      self.connected = false;
      self._stopHeartbeat();
      if (was) {
        self._setStatus('disconnected', 'Opponent disconnected');
        self._emit('onDisconnect', 'Opponent disconnected');
      }
    });
    conn.on('error', function (err) {
      var m = (err && err.message) || 'DataChannel error';
      if (onErrOnce) onErrOnce(m);
      self._emit('onError', m);
    });
  };

  // --- Mode 2: 100% Zero-Server Direct SDP Code ---
  P2PTransport.prototype._setupDirectDataChannel = function (dc) {
    var self = this;
    this.dc = dc;
    dc.onopen = function () {
      self.connected = true;
      self._setStatus('connected', 'Connected (Zero-Server Direct)');
      self._startHeartbeat();
      self._emit('onConnect', { role: self.role, mode: 'direct' });
    };
    dc.onmessage = function (ev) {
      self._handleIncomingRaw(ev.data);
    };
    dc.onclose = function () {
      var was = self.connected;
      self.connected = false;
      self._stopHeartbeat();
      if (was) {
        self._setStatus('disconnected', 'Opponent disconnected');
        self._emit('onDisconnect', 'Opponent disconnected');
      }
    };
  };

  P2PTransport.prototype.createDirectOffer = async function () {
    this.disconnect(true);
    this.mode = 'direct';
    this.role = 'host';
    this._setStatus('connecting', 'Generating direct offer...');

    var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    var dc = pc.createDataChannel('chess', { ordered: true });
    this._setupDirectDataChannel(dc);

    var offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc, 3500);

    var code = await encodeSignalPayload({ t: 'o', s: pc.localDescription.sdp });
    this._setStatus('waiting', 'Waiting for opponent Answer code');
    return code;
  };

  P2PTransport.prototype.acceptDirectOffer = async function (offerCode) {
    var payload = await decodeSignalPayload(offerCode);
    if (!payload || payload.t !== 'o' || !payload.s) {
      throw new Error('Invalid Offer code.');
    }

    this.disconnect(true);
    this.mode = 'direct';
    this.role = 'guest';
    this._setStatus('connecting', 'Generating direct answer...');

    var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    var self = this;
    pc.ondatachannel = function (ev) {
      self._setupDirectDataChannel(ev.channel);
    };

    await pc.setRemoteDescription({ type: 'offer', sdp: payload.s });
    var answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc, 3500);

    var code = await encodeSignalPayload({ t: 'a', s: pc.localDescription.sdp });
    this._setStatus('waiting', 'Send Answer code back to Host');
    return code;
  };

  P2PTransport.prototype.completeDirectAnswer = async function (answerCode) {
    if (!this.pc || this.mode !== 'direct' || this.role !== 'host') {
      throw new Error('Create a Direct Offer first.');
    }
    var payload = await decodeSignalPayload(answerCode);
    if (!payload || payload.t !== 'a' || !payload.s) {
      throw new Error('Invalid Answer code.');
    }
    await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.s });
    this._setStatus('connecting', 'Establishing direct P2P link...');
  };

  ChessApp.P2P = P2PTransport;
})(window);
