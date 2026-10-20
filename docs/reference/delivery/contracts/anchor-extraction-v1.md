# Anchor Extraction Contract v1

Status: DEV-3 provider/validation boundary. It does not finalize when extraction runs, the production tag vocabulary, anchor counts, or retained-storage policy.

## Source Snapshot

Each request binds to a saved `diaryId` and positive `diaryVersion`, with the source text/quote blocks identified by stable block IDs. Duplicate block IDs, empty source text, and malformed snapshots are rejected before provider invocation.

The caller explicitly starts extraction. This contract does not subscribe to save events or choose an automatic trigger; that remains subject to Q-016.

## Request and Result

Requests include `requestId`, caller-supplied `attempt`, source diary ID/version, and source blocks. The provider may return any number of anchors; no product count or tag vocabulary is imposed here.

Each extracted anchor includes:

- A stable anchor ID.
- A provider-selected tag ID.
- The source block ID.
- An excerpt/summary.

The result carries the same request ID and source diary/version, plus an explicit `source: mock | provider` field. The consumer rejects malformed output, duplicate anchor IDs, mismatched request/source versions, and references to blocks outside the request snapshot.

## Concurrency and Cancellation

Concurrent calls for the same diary/version and identical source snapshot share one in-flight provider operation. Different content under the same diary/version is rejected as a conflict. Cancelling one caller detaches only that caller; the shared provider operation is cancelled when its last waiter leaves. Late provider results are discarded. A current-source-version guard must confirm the source remains current before a result is returned.

The contract does not select retry limits or persistence behavior. Callers supply attempts; automatic retry is not performed. This prevents the boundary from inventing Q-002 retry rules.

## Development Adapter

`createMockAnchorExtractionProvider()` is a deterministic development-only example. Every record is explicitly marked `source: mock` and uses the synthetic `mock-unclassified` tag. Its result is not a production tag, quality result, saved anchor, or CASE pass.

## Deferred

- Q-016: extraction trigger, taxonomy/default collection, anchor-count and source-change behavior, downstream correction effects.
- Q-002: provider selection, quality, timeout and retry strategy.
- Q-003: excerpt/input length rules.
- Q-001: durable retention, restart recovery and identity scope.

The versioned persistent read model is specified separately in [Anchor Read Model v1](anchor-read-model-v1.md). Its Prisma schema and migration exist but remain unapplied; mock outputs are not written to that model. Retention and source-change cleanup remain undecided.
