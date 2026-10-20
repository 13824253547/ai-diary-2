# Insight Report Contract v1

Version: `insight-report-v1`

This contract defines the application-side request/result boundary for GRW-006. It does not authorize generation, define report retention, or set AI quality/safety thresholds.

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
- `sourceDiaries` contains unique diary IDs and non-negative saved versions. The provider cannot add source IDs that were not submitted.
- An optional local `AbortSignal` is passed to the provider adapter for cancellation and is not serialized.

## Result

A successful result has the same contract version, request ID, and source version as the request. It includes explicit `source: mock | provider`, a non-empty unique subset of the submitted source diary IDs, and exactly one non-empty dimension for each of:

- `inner-contrast`
- `cherished-connections`
- `personality-traits`

The consumer rejects unknown/duplicate dimensions, blank content, foreign source IDs, malformed metadata, or a mismatched request/source version. Structural validity is not an AI quality or safety pass.

## State and failures

- Callers control attempt/retry policy; this contract does not select automatic retry count, delay, timeout, or overwrite behavior.
- A result is accepted only for the active request and unchanged source version. A stale result cannot replace a newer report.
- Development output is marked `source: mock`; it is not a real report, persisted report, unlock, or CASE pass. Provider failure does not silently fall back to mock success.

## Deferred decisions

- Q-002: trusted provider, quality/safety evaluation, timeout, cancellation, and retry policy.
- Q-005: source statistics and count semantics.
- Q-006: unlock, first-generation, and refresh timing.
- Q-016: anchor correction/source-change impact.
- Q-001: durable report retention, deletion, and recovery.

The provider boundary is implemented in `src/services/insight-report-provider.ts`; the runtime schema is in `src/contracts/insight-report-contract.ts`. The formal report page remains on its existing demo path; no provider credentials or persistence service are configured.
