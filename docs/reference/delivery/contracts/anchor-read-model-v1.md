# Anchor Read Model v1

Version: `anchor-extraction-v1`

This contract adds a version-scoped, device-owned persistence/read boundary for provider-produced anchors. It does not choose an extraction trigger, taxonomy, default tag, anchor count, excerpt length, retention duration, or source-change propagation rule.

## Source and ownership

- Every API request requires `x-device-id`.
- Extraction runs are scoped to one `(ownerDeviceId, diaryId, diaryVersion)` source version. A source version has one request ID; repeated begin/complete/failure calls are idempotent for the same request and attempt.
- Before an extraction run is created or updated, the service locks the source diary row and checks device ownership, current diary version, and the saved text/quote blocks.
- Every persisted anchor must refer to a text/quote block in the exact current diary snapshot. Invalid references and stale versions are rejected.
- Reads require one non-empty `tagId`; no category/default tag is inferred. `page` and `pageSize` wire values are single decimal-integer strings, and repeated/non-decimal values are rejected. Results include the source diary ID/version, title, date, cover photo ID, and source block ID. The client accepts a page only when `tagId`, `page`, and `pageSize` match the request.
- Read queries join the current device-owned diary version and require a readable text/quote source block in MySQL before counting or paging results. Count and page use one repeatable-read transaction so concurrent source edits cannot make the response internally inconsistent. Rows for changed or missing source diaries and inaccessible blocks are not returned. The schema intentionally has no cascade/restrict foreign key from anchor history to `Diary`; old version-scoped rows are not automatically deleted or exposed as current.

## State and retries

Extraction runs use `pending`, `succeeded`, and `failed` states. A failed run can move to the caller-supplied next attempt; no retry limit, delay, or automatic retry is selected. Failure persistence stores only `timeout`, `cancelled`, or `provider_failed`, never raw provider errors.

Success is committed with its anchor rows in one transaction. Replaying the same successful result is idempotent; a different result, stale attempt, or stale diary version returns `version_conflict`.

## Mock and production boundary

Development `source: mock` output remains in the existing in-memory provider path and is never written to the persistent anchor read model. Persistent rows require `source: provider`. The public API currently has no trusted server-side extraction provider; extraction begin, completion, and failure writes fail closed in every non-test runtime. Test mode exists only for isolated contract tests. A caller-provided `source: provider` is not trusted-provider or quality evidence and cannot write the read model in development or production.

The schema and migration are implementation artifacts only and have not been applied. No user data has been written by this implementation.

## Deferred decisions

- Q-016: trigger timing, tag taxonomy/default, count, and diary source-change propagation.
- Q-002: trusted provider selection, quality, safety, timeout, and retry policy.
- Q-003: excerpt/input length and presentation boundaries.
- Q-001: retention duration, restart recovery, deletion, and cross-device scope.
