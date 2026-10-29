# Insight Report Contract v1

Version: `insight-report-v1`

This remains the legacy application-side request/result validator. Production report generation is now server-owned and uses the `growth-insight-v2` read contract from `src/contracts/growth-insight-contract.ts`; diary text is never sent in this client request shape.

## Request

```json
{
  "version": "insight-report-v1",
  "requestId": "report-request-1",
  "sourceVersion": "stable-source-snapshot",
  "sourceDiaries": [
    {
      "id": "diary-1",
      "version": 2,
      "title": "海边散步",
      "summary": "沿海边慢慢走。"
    }
  ]
}
```

- `requestId` identifies one generation operation.
- `sourceVersion` binds the result to the caller's deterministic source snapshot.
- `sourceDiaries` contains unique diary IDs and saved versions. The provider cannot add source IDs that were not submitted.
- An optional local `AbortSignal` is passed to the provider adapter for cancellation and is not serialized.

## Result

A successful result has the same contract version, request ID, and source version as the request. It includes explicit `source: mock | provider`, a non-empty unique subset of the submitted source diary IDs, and exactly one non-empty dimension for each of:

- `inner-contrast`
- `cherished-connections`
- `personality-traits`

The consumer rejects unknown/duplicate dimensions, blank content, foreign source IDs, malformed metadata, or a mismatched request/source version. Structural validity is not an AI quality or safety pass.

## State and failures

- A result is accepted only for the active request and unchanged source version. A stale result cannot replace a newer report.
- This contract remains useful for isolated legacy adapter tests only; its `source: mock` fixtures are never used to unlock or render the production report.

## Production Growth API

All production requests require the device identity header. The server derives eligible diaries from the authenticated device and does not accept client-supplied diary text, source IDs, or unlock flags.

- `GET /growth/state` returns milestone-bound flower status, analysis progress, first-trip evidence, the current continuous record-date streak, anchor count availability, and report authorization/status.
- `POST /growth/flowers/initialize` starts the device's one-time full-history recognition. New/edited diary versions enter the same service incrementally after a successful save.
- `POST /growth/flowers/retry` is the only way to retry failed recognition batches.
- `POST /growth/reports/ensure-current` checks all three server-persisted milestone awards and starts/reuses an analysis for the current diary source version.
- `GET /growth/reports/current` returns the last successful report (when unlocked) and whether it is stale/updating.
- `POST /growth/reports/retry` creates an explicit retry for the current failed report version.

Reports contain `reportId`, `sourceVersion`, source diary IDs/versions and count, generation time, and exactly one entry for each fixed dimension. Each dimension carries only source diary IDs that appeared in that report's server-created evidence input. Insufficient evidence may produce a cautious explanation with no dimension-level source IDs.

Flower/report jobs and results are persisted per device. A source change never overwrites the last successful report until the replacement is complete. The server uses `PET_CHAT_*` configuration with separate prompts and no chat history/SSE. Each batch receives one automatic attempt; user action is required to retry.

The flower-to-milestone mapping is fixed: `pathfinder` ← first trip, `self-awareness` ← a 30-day historical consecutive diary run, and `healing` ← 100 memory anchors. Milestone awards are permanent per device; displayed streak and anchor counts remain live. AI flower recognition supplies evidence-bound summaries and first-trip evidence but cannot independently unlock flowers or reports. A flower may be unlocked before its optional AI summary is available.

## Remaining Scope

- Q-002: global AI quality thresholds and human content evaluation remain open. Both synthetic provider smoke workflows recorded `invalid_response`; the first serial workflow did not record which stage failed, so the actual HTTP request count may be 2 or 3 and it is not possible to confirm whether the original two-request authorization limit was exceeded. Neither workflow is a quality pass, no business data was written, and no further request was made.
- Q-005: unrelated global profile statistics remain open; this feature uses its locally confirmed source count and milestone rules.
- Q-006: leaf growth outside this three-flower/report flow remains open.
- Q-001: general work/session retention remains open; this feature's growth/report rows are device-scoped and do not sync across devices.

Implementation: server provider/service in `backend/src/modules/growth/`, runtime client DTO in `src/contracts/growth-insight-contract.ts`, and the report UI at `app/profile/report.tsx`.
