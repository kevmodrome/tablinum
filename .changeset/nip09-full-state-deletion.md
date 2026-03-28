---
"tablinum": minor
---

Add NIP-09 deletion requests to reduce relay storage

- Gift wraps now carry full record state, making each event self-contained
- After publishing a new gift wrap for a record, a NIP-09 deletion request is sent for the previous one, signed with the epoch key (per NIP-59's p-tag recipient recommendation)
- On key rotation (removeMember/leave), all records are re-published under the new epoch so removed members cannot cause data loss by deleting old-epoch events
- Includes a one-time migration that re-publishes existing records on first launch after upgrade
