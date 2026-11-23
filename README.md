# ChessP2P

Cross-platform, zero-server peer-to-peer chess with a sleek Chess.com-inspired interface.

## Quick Start (Zero Setup, Any OS)

Works out of the box on **Windows, macOS, Linux, iOS, and Android** directly from disk (`file://`) or any static web host:

- **Standard Edition (give to friends):** Open [`dist/ChessP2P.html`](dist/ChessP2P.html) (single self-contained file) or [`index.html`](index.html).

No Node.js, no Hamachi, no Radmin, no port-forwarding, and no backend server required.

## Connecting Peer-to-Peer

Click **Play / Online** in the top bar:

1. **Instant Room (1-Step, Default):** Click **Create Room Code** to get a 6-character code (e.g. `4K7M9P`), share it with your friend, and they enter it in **Join a Friend's Room**. Uses PeerJS public signaling strictly for the initial WebRTC handshake; all moves and chat flow directly peer-to-peer.
2. **Zero-Server Direct Code (100% Serverless Fallback):** If a corporate/school firewall blocks public signaling brokers, switch to **Zero-Server Direct** and exchange the compressed Offer/Answer codes directly over Discord, WhatsApp, or SMS.
3. **Solo / Local:** Play Pass & Play on the same device or practice against the built-in AI.
