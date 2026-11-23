(function (global) {
  'use strict';

  var ChessApp = global.ChessApp = global.ChessApp || {};
  var STORAGE_KEY = 'chessp2p_muted';

  function SoundEngine() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {}
  }

  SoundEngine.prototype._ensureCtx = function () {
    if (this.muted) return null;
    if (!this.ctx) {
      var AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (e) {}
    }
    return this.ctx;
  };

  SoundEngine.prototype.isMuted = function () {
    return this.muted;
  };

  SoundEngine.prototype.setMuted = function (flag) {
    this.muted = !!flag;
    try { localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0'); } catch (e) {}
  };

  SoundEngine.prototype.toggleMute = function () {
    this.setMuted(!this.muted);
    return this.muted;
  };

  SoundEngine.prototype._woodTap = function (delay, freq, gainVal, dur, noiseGain) {
    var ctx = this._ensureCtx();
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);

    // Resonant wood body oscillator
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(45, freq * 0.42), t + dur);
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);

    // Filtered click transient
    if (noiseGain > 0) {
      var bufSize = Math.floor(ctx.sampleRate * 0.035);
      var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));
      }
      var noise = ctx.createBufferSource();
      noise.buffer = buf;
      var filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, t);
      filter.Q.setValueAtTime(1.6, t);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(noiseGain, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t);
    }
  };

  SoundEngine.prototype._tone = function (delay, freq, type, gainVal, dur) {
    var ctx = this._ensureCtx();
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  };

  SoundEngine.prototype.play = function (name) {
    if (this.muted) return;
    try {
      switch (name) {
        case 'move':
          this._woodTap(0, 210, 0.24, 0.085, 0.16);
          break;
        case 'capture':
          this._woodTap(0, 165, 0.34, 0.11, 0.32);
          this._tone(0, 95, 'sine', 0.18, 0.07);
          break;
        case 'castle':
          this._woodTap(0, 220, 0.22, 0.075, 0.15);
          this._woodTap(0.085, 195, 0.24, 0.085, 0.16);
          break;
        case 'check':
          this._woodTap(0, 240, 0.26, 0.09, 0.18);
          this._tone(0.01, 520, 'triangle', 0.14, 0.14);
          this._tone(0.07, 680, 'sine', 0.11, 0.16);
          break;
        case 'promote':
          this._woodTap(0, 230, 0.22, 0.08, 0.15);
          this._tone(0.02, 523.25, 'triangle', 0.12, 0.13);
          this._tone(0.08, 659.25, 'triangle', 0.12, 0.13);
          this._tone(0.14, 783.99, 'triangle', 0.14, 0.22);
          break;
        case 'start':
          this._tone(0, 392, 'triangle', 0.12, 0.14);
          this._tone(0.09, 523.25, 'triangle', 0.14, 0.22);
          break;
        case 'gameover':
          this._tone(0, 440, 'triangle', 0.12, 0.18);
          this._tone(0.12, 349.23, 'triangle', 0.12, 0.28);
          break;
        case 'lowtime':
          this._tone(0, 880, 'sine', 0.08, 0.06);
          break;
        case 'illegal':
          this._tone(0, 140, 'sawtooth', 0.08, 0.09);
          break;
        case 'chat':
          this._tone(0, 740, 'sine', 0.06, 0.07);
          break;
        case 'cheat':
          this._tone(0, 620, 'sine', 0.05, 0.06);
          break;
      }
    } catch (e) {}
  };

  ChessApp.Sound = new SoundEngine();
})(window);
