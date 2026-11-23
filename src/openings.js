(function (global) {
  'use strict';

  var ChessApp = global.ChessApp = global.ChessApp || {};

  // Longest-prefix opening book keyed by space-separated UCI moves
  var OPENINGS = [
    ['e2e4 e7e5 g1f3 b8c6 f1b5 a7a6', 'C70 Ruy Lopez: Morphy Defense'],
    ['e2e4 e7e5 g1f3 b8c6 f1b5 g8f6', 'C65 Ruy Lopez: Berlin Defense'],
    ['e2e4 e7e5 g1f3 b8c6 f1b5', 'C60 Ruy Lopez'],
    ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5', 'C50 Italian Game: Giuoco Piano'],
    ['e2e4 e7e5 g1f3 b8c6 f1c4 g8f6', 'C55 Italian Game: Two Knights Defense'],
    ['e2e4 e7e5 g1f3 b8c6 f1c4', 'C50 Italian Game'],
    ['e2e4 e7e5 g1f3 b8c6 d2d4', 'C45 Scotch Game'],
    ['e2e4 e7e5 g1f3 g8f6', 'C42 Petrov Defense'],
    ['e2e4 e7e5 g1f3 d7d6', 'C41 Philidor Defense'],
    ['e2e4 e7e5 f2f4', 'C30 King\'s Gambit'],
    ['e2e4 e7e5 b1c3', 'C25 Vienna Game'],
    ['e2e4 e7e5 f1c4', 'C23 Bishop\'s Opening'],
    ['e2e4 e7e5', 'C20 King\'s Pawn Game'],
    ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6', 'B90 Sicilian Defense: Najdorf'],
    ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6', 'B70 Sicilian Defense: Dragon'],
    ['e2e4 c7c5 g1f3 b8c6 d2d4', 'B32 Sicilian Defense: Open'],
    ['e2e4 c7c5 c2c3', 'B22 Sicilian Defense: Alapin'],
    ['e2e4 c7c5 b1c3', 'B23 Sicilian Defense: Closed'],
    ['e2e4 c7c5', 'B20 Sicilian Defense'],
    ['e2e4 e7e6 d2d4 d7d5 b1c3', 'C11 French Defense: Classical'],
    ['e2e4 e7e6 d2d4 d7d5 e4e5', 'C02 French Defense: Advance'],
    ['e2e4 e7e6 d2d4 d7d5', 'C00 French Defense'],
    ['e2e4 e7e6', 'C00 French Defense'],
    ['e2e4 c7c6 d2d4 d7d5 e4e5', 'B12 Caro-Kann: Advance'],
    ['e2e4 c7c6 d2d4 d7d5 b1c3', 'B15 Caro-Kann Defense'],
    ['e2e4 c7c6', 'B10 Caro-Kann Defense'],
    ['e2e4 d7d5', 'B01 Scandinavian Defense'],
    ['e2e4 d7d6 d2d4 g8f6 b1c3 g7g6', 'B07 Pirc Defense'],
    ['e2e4 g8f6', 'B02 Alekhine Defense'],
    ['e2e4 g7g6', 'B06 Modern Defense'],
    ['e2e4', 'B00 King\'s Pawn Opening'],
    ['d2d4 d7d5 c2c4 e7e6', 'D30 Queen\'s Gambit Declined'],
    ['d2d4 d7d5 c2c4 c7c6', 'D10 Slav Defense'],
    ['d2d4 d7d5 c2c4 d5c4', 'D20 Queen\'s Gambit Accepted'],
    ['d2d4 d7d5 c2c4', 'D06 Queen\'s Gambit'],
    ['d2d4 d7d5 c1f4', 'D02 London System'],
    ['d2d4 d7d5 g1f3 g8f6 c1f4', 'D02 London System'],
    ['d2d4 d7d5', 'D00 Queen\'s Pawn Game'],
    ['d2d4 g8f6 c2c4 g7g6 b1c3 f8g7', 'E60 King\'s Indian Defense'],
    ['d2d4 g8f6 c2c4 g7g6 b1c3 d7d5', 'D80 Grünfeld Defense'],
    ['d2d4 g8f6 c2c4 e7e6 b1c3 f8b4', 'E20 Nimzo-Indian Defense'],
    ['d2d4 g8f6 c2c4 e7e6 g1f3 b7b6', 'E12 Queen\'s Indian Defense'],
    ['d2d4 g8f6 c2c4 c7c5', 'A56 Benoni Defense'],
    ['d2d4 g8f6 c1f4', 'A45 Trompowsky / London'],
    ['d2d4 g8f6 c2c4', 'A50 Indian Defense'],
    ['d2d4 f7f5', 'A80 Dutch Defense'],
    ['d2d4', 'A40 Queen\'s Pawn Opening'],
    ['c2c4 e7e5', 'A20 English Opening: Reversed Sicilian'],
    ['c2c4 c7c5', 'A30 English Opening: Symmetrical'],
    ['c2c4', 'A10 English Opening'],
    ['g1f3 d7d5 c2c4', 'A09 Réti Opening'],
    ['g1f3 d7d5', 'A06 Réti Opening'],
    ['g1f3', 'A04 Zukertort Opening'],
    ['b2b3', 'A01 Nimzo-Larsen Attack'],
    ['f2f4', 'A02 Bird\'s Opening'],
    ['g2g3', 'A00 King\'s Fianchetto Opening']
  ];

  // Sort longest prefix first once
  OPENINGS.sort(function (a, b) {
    return b[0].length - a[0].length;
  });

  function identify(history) {
    if (!history || history.length === 0) return 'Starting Position';
    var ucis = [];
    var limit = Math.min(history.length, 16);
    for (var i = 0; i < limit; i++) {
      if (history[i] && history[i].uci) ucis.push(history[i].uci);
    }
    var seq = ucis.join(' ');
    for (var j = 0; j < OPENINGS.length; j++) {
      var prefix = OPENINGS[j][0];
      if (seq === prefix || seq.indexOf(prefix + ' ') === 0) {
        return OPENINGS[j][1];
      }
    }
    return '';
  }

  ChessApp.Openings = { identify: identify };
})(window);
