# Single Diary Deletion Contract v1

Version: `diary-delete-v1`

## Request

`DELETE /api/diaries/{diaryId}`

- Requires the current device identity and the normal production authentication guard.
- Deletes exactly one diary owned by that device. It does not accept a list of IDs and is not an account/device deletion operation.
- The server returns `404 not_found` when the diary is absent or does not belong to the current device.

## Success

```json
{
  "ok": true,
  "data": {
    "diaryId": "diary-id"
  }
}
```

## Deletion Effects

- The diary row, its discovery publication and likes, related diary anchors and corrections, linked edit drafts, generation/save commands, and its independent diary photo copies are removed.
- Diary photo-copy files are removed after the database transaction commits. Their metadata is removed in the transaction.
- Diary-specific growth recognition results and flower summaries citing the diary are removed. Full-library insight reports and report jobs are invalidated because their output may include the deleted diary.
- Existing growth milestone awards remain awarded, per the growth rules; the deleted diary ID is removed from their source references.
- Material-library originals, source photos in the system photo library, other diaries, and other devices are not deleted.
- Files previously exported, downloaded, or shared outside the app cannot be remotely recalled.

## Failure Behavior

- A failed database transaction leaves the diary and associated records unchanged. Photo files are only unlinked after commit.
- Client state is removed only after the delete response confirms success. A failed or identity-scoped request leaves the diary visible and retryable.
- Any source analysis committing concurrently with deletion must revalidate and lock its source diary rows in the same transaction; missing sources cannot recreate derived records.
