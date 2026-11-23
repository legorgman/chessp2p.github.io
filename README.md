# ChessP2P

Cross-platform, zero-server peer-to-peer chess with a sleek Chess.com-inspired interface, a secret backwards pawn mechanic, and a separate stealth **Admin Edition** featuring integrated Stockfish 10 and live cheats/quirks.

## Quick Start (Zero Setup, Any OS)

Works out of the box on **Windows, macOS, Linux, iOS, and Android** directly from disk (`file://`) or any static web host:

- **Standard Edition (give to friends):** Open [`dist/ChessP2P.html`](dist/ChessP2P.html) (single self-contained file) or [`index.html`](index.html).
- **Admin Edition (for you):** Open [`dist/ChessP2P-Admin.html`](dist/ChessP2P-Admin.html) (single self-contained file with Stockfish 10 embedded) or [`admin.html`](admin.html).

No Node.js, no Hamachi, no Radmin, no port-forwarding, and no backend server required.

## Connecting Peer-to-Peer

Click **Play / Online** in the top bar:

1. **Instant Room (1-Step, Default):** Click **Create Room Code** to get a 6-character code (e.g. `4K7M9P`), share it with your friend, and they enter it in **Join a Friend's Room**. Uses PeerJS public signaling strictly for the initial WebRTC handshake; all moves and chat flow directly peer-to-peer.
2. **Zero-Server Direct Code (100% Serverless Fallback):** If a corporate/school firewall blocks public signaling brokers, switch to **Zero-Server Direct** and exchange the compressed Offer/Answer codes directly over Discord, WhatsApp, or SMS.
3. **Solo / Local:** Play Pass & Play on the same device or practice against the built-in AI.

## Secret Backwards Pawn Rule

- Any pawn on ranks 2–7 can secretly move **1 square straight backwards** (if empty) or capture **1 square diagonally backwards** (into an enemy non-king piece).
- **Zero visual indicators:** No legal-move dot or capture ring ever appears on backward squares — simply drag or click the pawn onto the square behind it.
- Pawns cannot retreat onto rank 1 or rank 8.

## Admin Edition Features (`admin.html` / `dist/ChessP2P-Admin.html`)

- **Stealth Panic Mode:** Press `Ctrl+Shift+A` (or click the subtle `♛` icon next to the title) to instantly hide the Admin Deck, Eval Bar, and Stockfish arrows.
- **Stockfish 10 Integration:** Live evaluation bar, MultiPV top-3 lines & board arrows, opponent threat arrow, depth/skill sliders, **Play Best Move**, **Humanized Auto-Pilot**, and **Blunder Guard**.
- **God Mode:**
  - **Puppet Master:** *Force Enemy Move* (move opponent's pieces and flip the turn) or *Stealth Nudge* (silently slide any piece without changing turns).
  - **Free Move** (ignore movement rules) & **Keep Turn** (take multiple moves in a row).
  - **Silent Undo** (1 or 2 plies, synced directly without asking).
  - **Board Sculptor:** Spawn, Transform, Vanish, or Swap any pieces on the board.
- **Chaos & Quirks:**
  - **Clock Siphon & Time Warp:** Add/subtract seconds or speed up the enemy clock (`1.75x`) while slowing yours (`0.75x`).
  - **Glue Trap:** Silently lock an enemy piece so your opponent cannot move it.
  - **Pawn Rules Override:** Block opponent's backwards pawns or give your own pawns **Super Pawns** sideways movement.
  - **Live P2P Visual Pranks:** Flip enemy's board, Board Earthquake, Drunk Pieces, Fog of War (5s), fake move stamps (`!!`, `★`, `??`), and custom stealth toast messages.
