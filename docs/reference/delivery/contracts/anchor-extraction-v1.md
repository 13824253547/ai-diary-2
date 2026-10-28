# Anchor Extraction Contract v1

Status: DEV-62 production server-side summary boundary. Diary summaries are generated asynchronously after a successful save; only the saved diary version is processed. Chat summaries use the separate daily-batch lifecycle described by the read-model contract.

## Source Snapshot

Each diary request binds to a saved `diaryId` and positive `diaryVersion`, with all non-empty `text` and `quote` blocks identified by stable block IDs. Duplicate block IDs, empty source text, and malformed snapshots are rejected before provider invocation. A diary version produces at most one anchor. If there is no valid text/quote source, extraction is skipped with `no_source`; no model call or substitute content is used.

The backend enqueues extraction only after the diary and its photo copies have saved successfully. Editing a diary schedules only its new version; it does not reprocess other diaries or transfer a correction from an older version. Processing is asynchronous and idempotent for the device, diary, and version.

## Request and Result

The internal provider receives the source kind and source text; it does not receive prior chat history. It returns one Chinese sentence of at most 60 Unicode characters and one tag from `friends`, `light`, `mountains`, or `food`. These tags respectively represent old relationships/shared memories, growth/hope/goals, travel/nature/exploration, and food/table moments. The model chooses the closest supported theme. The summary is written from the pet's perspective and must be grounded in supplied source text.

The persisted diary anchor includes:

- A stable anchor ID.
- The selected theme.
- A primary source block ID and all contributing source block IDs.
- The summary.

The result remains bound to the request ID, device, diary, and saved version. The server validates the theme, summary length, source version, and source block references before persistence. Malformed provider output fails closed; no mock fallback is used.

Each batch has at most three total attempts including the first, with a three-second delay between failed attempts and the existing 240-second per-call timeout. Exhausted work is recorded as a backend terminal failure and is not exposed as a user retry action.

## Concurrency and Cancellation

Same-device model calls are serialized. Interactive chat work is prioritized over queued background summaries; different devices may run independently. A current-source-version guard prevents an older diary result from replacing a newer version.

## Chat Daily Summaries

Only newly created, complete provider-backed user/assistant turns with a valid device-local date are eligible. Existing turns default to ineligible and are not backfilled. When a later local date's first chat completes, unprocessed eligible turns before that date are summarized; multiple missed dates are combined into one batch. No new completed chat means no trigger.

The chat summary uses the same one-sentence, 60-character and four-theme output contract, from the pet's perspective. The batch records all source message IDs and conversation IDs. Its display date is the summary creation date. Original messages are not changed, and summaries/corrections are not added to later chat context.

## Remaining Scope

- Q-002 model-quality thresholds and broad AI evaluation remain open; one synthetic provider smoke per source type is not a quality pass.
- Q-001 global work/session retention and cross-device policy remain open. This feature scopes anchors and corrections to the device and retains them with their source.

The unified persistent read model and source navigation are specified in [Anchor Read Model v1](anchor-read-model-v1.md).
