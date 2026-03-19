---
"tablinum": minor
---

Add compact binary encoding for gift wrap storage and background self-healing loop. Gift wrap blobs are now kept in a compact binary format (~55-60% smaller) instead of being stripped after publishing, enabling automatic re-publishing to relays that lost data. A healing loop runs every 5 minutes to detect and backfill gaps using negentropy reconciliation.
