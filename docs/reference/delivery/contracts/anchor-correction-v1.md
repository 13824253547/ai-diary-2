# Anchor Correction Contract v1

Version: `anchor-correction-v1`

This contract stores a user's correction against one anchor ID, one saved diary version, and one text/quote source block. It does not change the diary snapshot or decide how corrections affect extraction, chat, or reports.

## Identity and source checks

- Every request requires `x-device-id`; data is scoped to that device identity.
- The diary must exist, belong to the device, and still have the requested `diaryVersion`.
- The `anchorId` must exist in a succeeded provider extraction for the same device, diary, and source version; its `sourceBlockId` must match the request and resolve to a text/quote block in the saved snapshot.
- A correction is addressed by `diaryId + diaryVersion + anchorId`. The same anchor ID in another diary version is a different record.

## Read

`GET /anchors/:anchorId/correction?diaryId=...&diaryVersion=...`

The query requires single string values for `diaryId` and decimal-integer `diaryVersion`; exponent, hexadecimal, fractional, whitespace-padded, and repeated values are rejected after device identity validation. The client accepts a record only when its `diaryId`, `diaryVersion`, and `anchorId` match the request.

Success returns the versioned envelope with either a correction record or `null`:

```json
{
  "ok": true,
  "version": "anchor-correction-v1",
  "data": {
    "id": "correction-1",
    "diaryId": "diary-1",
    "diaryVersion": 3,
    "anchorId": "anchor-1",
    "sourceBlockId": "block-1",
    "correction": "去空白后的理解",
    "version": 1,
    "source": "user",
    "updatedAt": "2026-10-16T00:00:00.000Z"
  }
}
```

An absent correction is represented as `"data": null`, distinct from a missing/inaccessible diary or stale source version.

## Write

`PUT /anchors/:anchorId/correction`

```json
{
  "diaryId": "diary-1",
  "diaryVersion": 3,
  "sourceBlockId": "block-1",
  "correction": "  去空白后的理解  ",
  "expectedVersion": 0,
  "idempotencyKey": "device-scoped-command-id"
}
```

- The backend trims the correction and rejects empty/whitespace-only values.
- `expectedVersion: 0` creates the first correction at version 1. A later update must provide the currently read correction version; the stored version increments atomically.
- The request and its device-scoped idempotency command are committed in one transaction. Reusing a key with the same request and an unchanged command result returns that result without another write; reusing it with different input is rejected. If the correction has since advanced beyond the version recorded by that command, replay returns `version_conflict` rather than presenting the newer correction as the old request's result.
- The client accepts a saved record only when diary, source version, anchor, source block, and trimmed correction match the submitted command and the resulting version is `expectedVersion + 1`.
- The source diary row is locked and its version checked in the same transaction as the persisted anchor lookup and correction read/write. A missing/unavailable persisted anchor returns `not_found`; a stale diary version or correction version returns `version_conflict`; no silent overwrite occurs.
- The service deliberately applies no product text-length limit until Q-003 is confirmed. Storage uses a large text column; this does not define an unlimited product input contract.

## Errors

| Code | Meaning |
| --- | --- |
| `device_identity_required` | Missing device identity |
| `permission_denied` | Diary belongs to another device |
| `not_found` | Diary or source block is unavailable |
| `invalid_input` | Malformed identity, blank correction, or idempotency-key payload mismatch |
| `version_conflict` | Diary or correction version is stale |
| `timeout`, `cancelled`, `provider_failed` | Transport/service failure |

## Decision boundary

Q-001 still determines retention duration and broader recovery scope. Q-003 still determines the user-visible length limit. Q-016 still determines extraction/source-change behavior and propagation to tags, chat, and reports. This contract does not carry an old correction into a newer diary version and does not delete old version-scoped rows; retention and source-change cleanup remain open.
