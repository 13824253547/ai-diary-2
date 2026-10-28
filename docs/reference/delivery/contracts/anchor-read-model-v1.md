# Anchor Read Model v1

Version: `anchor-extraction-v1`

This contract defines the device-owned persistence/read boundary for diary and daily-chat anchors. Diary extraction and chat batch triggers, four themes, default feed, summary length, and feature-level retention are confirmed in [Anchor Extraction v1](anchor-extraction-v1.md). Global work/session retention remains governed by Q-001.

## Source and ownership

- Every API request requires `x-device-id`.
- Diary extraction runs are scoped to one `(ownerDeviceId, diaryId, diaryVersion)` source version and produce at most one current-version anchor. A source version has one request ID; repeated begin/complete/failure calls are idempotent for the same request and attempt.
- Before an extraction run is created or updated, the service locks the source diary row and checks device ownership, current diary version, and the saved text/quote blocks.
- Every persisted diary anchor refers to the exact current diary snapshot and stores all contributing text/quote block IDs. Invalid references and stale versions are rejected.
- `GET /anchors` remains the legacy tag-specific diary read. The unified `GET /anchors/feed` accepts optional `tagId`; absence means all supported themes and both source types. `page` defaults to 1 and `pageSize` to 20; supported sizes are 10, 20, 50, and 100. Decimal query values must be single values. The feed returns `sourceType`, theme, title, display date, summary, saved correction when present, and source-specific references.
- Diary feed entries include diary ID/version, cover photo ID, a primary source block ID and all source block IDs. Chat entries include batch ID, source date range, and every source conversation/message ID. Diary cards open the source diary; chat cards open the source conversation and focus a source message.
- `GET /anchors/summary` returns `{ "total": number }` for currently accessible successful anchors. Failed/skipped work, hidden old diary versions, and correction rows are not counted. The client does not substitute a fixed count when this request fails.
- Read queries validate device ownership and continued source accessibility for both diary and chat entries before counting or paging. Diary entries must match the current diary version and retain readable source blocks. Chat entries must retain their eligible source messages and turns. Count and page use one repeatable-read transaction so concurrent source edits cannot make the response internally inconsistent. Invalid or inaccessible sources are not returned. Historical diary rows are not exposed as current.

## State and retries

Diary extraction uses `pending`, `succeeded`, `failed`, and `skipped` states; chat batches use `pending`, `succeeded`, and terminal `failed` states. Each batch is attempted at most three times including the first, with three seconds between failures and a 240-second per-model-call timeout. Failure persistence stores fixed error codes, never raw provider errors or source text in logs.

Success and source references are committed atomically. Replaying the same successful result is idempotent; a different result, stale attempt, or stale diary version returns `version_conflict`. Chat batches atomically associate each eligible source turn/message with one stable batch to prevent duplicate summarization.

## Mock and production boundary

Only trusted server-side provider tasks can write persistent anchor rows. Public requests cannot mark their own result as provider output. Test fixtures are isolated to the protected E2E/unit test paths and are not production-provider or quality evidence.

The additive migration `20261026120000_daily_chat_anchors` has been applied to the local development schema and verified with isolated fresh/legacy/baseline migration and drift checks. Dedicated isolated MySQL E2E cases exercise the unified feed, source eligibility, device boundaries, corrections, and terminal retry behavior. This does not establish production deployment or device acceptance.
