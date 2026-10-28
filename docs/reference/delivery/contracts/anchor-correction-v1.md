# Anchor Correction Contract v1

Version: `anchor-correction-v1`

This contract stores a user's correction against either one diary anchor/version/source block or one daily-chat anchor batch. Corrections only replace the displayed anchor summary; they do not change diary/chat source text, affect future extraction, or enter later chat context.

## Identity and source checks

- Every request requires `x-device-id`; data is scoped to that device identity.
- The diary must exist, belong to the device, and still have the requested `diaryVersion`.
- The `anchorId` must exist in a succeeded provider extraction for the same device, diary, and source version; its `sourceBlockId` must match the request and resolve to a text/quote block in the saved snapshot.
- A correction is addressed by `diaryId + diaryVersion + anchorId`. The same anchor ID in another diary version is a different record.
- Chat corrections are addressed by `anchorBatchId + anchorId`; the batch and its source messages must remain accessible to the same device.

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
- The normalized correction is limited to 240 Unicode code points. Client contracts and backend validation enforce the same limit.
- `expectedVersion: 0` creates the first correction at version 1. A later update must provide the currently read correction version; the stored version increments atomically.
- The request and its device-scoped idempotency command are committed in one transaction. Reusing a key with the same request and an unchanged command result returns that result without another write; reusing it with different input is rejected. If the correction has since advanced beyond the version recorded by that command, replay returns `version_conflict` rather than presenting the newer correction as the old request's result.
- The client accepts a saved record only when diary, source version, anchor, source block, and trimmed correction match the submitted command and the resulting version is `expectedVersion + 1`.
- The source diary row is locked and its version checked in the same transaction as the persisted anchor lookup and correction read/write. A missing/unavailable persisted anchor returns `not_found`; a stale diary version or correction version returns `version_conflict`; no silent overwrite occurs.
- Corrections are displayed only over the corresponding anchor summary. They are not copied to a newer diary version, another anchor, or the chat prompt.

## Chat Read and Write

`GET /anchors/:anchorId/chat-correction?anchorBatchId=...`

`PUT /anchors/:anchorId/chat-correction`

```json
{
  "anchorBatchId": "chat-batch-1",
  "correction": "  去空白后的理解  ",
  "expectedVersion": 0,
  "idempotencyKey": "device-scoped-command-id"
}
```

Chat writes use the same trimming, 240-code-point limit, expected-version compare-and-update, and device-scoped idempotency behavior as diary corrections. Their saved record is bound to the chat batch and anchor ID, not to a diary source block.

## Errors

| Code | Meaning |
| --- | --- |
| `device_identity_required` | Missing device identity |
| `permission_denied` | Diary belongs to another device |
| `not_found` | Diary/chat source, anchor, batch, or source block is unavailable |
| `invalid_input` | Malformed identity, blank/overlong correction, or idempotency-key payload mismatch |
| `version_conflict` | Diary/chat source or correction version is stale |
| `timeout`, `cancelled`, `provider_failed` | Transport/service failure |

## Decision boundary

This feature retains corrections with their source records and isolates them by device; broader Q-001 work/session retention and recovery policy remains open. The confirmed 240-code-point limit applies to both source types. A diary's newer version gets its own anchor and correction state; old corrections are not transferred.
