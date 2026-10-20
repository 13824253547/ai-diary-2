# AI Image Generation Contract v1

Version: `ai-image-generation-v1`

This contract defines the application-side boundary between MAT-005 and a replaceable image-generation provider. It does not define a network endpoint, a production provider, or a user-facing retention promise.

## Request

```json
{
  "version": "ai-image-generation-v1",
  "requestId": "image-request-1",
  "attempt": 1,
  "description": "雨后的老街",
  "generatedAt": "2026-10-16T10:00:00.000Z"
}
```

- `requestId` correlates the result and generated asset to this Store operation.
- `attempt` is a positive integer supplied by the caller. The contract does not choose retry count, delay, or automatic retry.
- `description` must contain non-whitespace text. The current Store trims only its outer whitespace and preserves the remaining text; no maximum length is selected here.
- `generatedAt` is a parseable timestamp supplied by the caller.
- The provider adapter also receives an optional local `AbortSignal`. It is runtime control and is not part of a serialized request.

## Result

```json
{
  "version": "ai-image-generation-v1",
  "requestId": "image-request-1",
  "source": "mock",
  "photo": {
    "id": "generated-image-request-1",
    "title": "雨后的老街",
    "location": "AI 配图",
    "emoji": "✨",
    "color": "#D9CCD4",
    "date": "2026.10.16",
    "uri": "file:///generated/image-request-1.png",
    "source": "generated",
    "generationRequestId": "image-request-1",
    "generationPrompt": "雨后的老街",
    "generationSource": "mock"
  }
}
```

Before registration, the consumer requires the supported contract version, matching request ID and exact submitted description, a `mock` or `provider` source marker, a generated asset with matching provenance fields, and a successful independent readability check. A malformed, stale, cancelled, unreadable, or conflicting asset is not added to the material catalog.

## State and failures

- A pending local request may be deduplicated with another in-flight request for the same normalized description. This is an in-process optimization, not durable or cross-device idempotency.
- Only a current pending request may register its result. Cancellation races the provider and readability check; a late result cannot be registered.
- The adapter may report `cancelled` or `provider_failed`. Raw provider details are not exposed as successful asset metadata.
- A development adapter must mark its result `source: mock`; mock success is not provider quality, durable asset storage, or a CASE pass. A real provider failure must not silently fall back to mock success.
- No timeout or automatic retry semantics are selected by this version.

## Deferred decisions

- Q-002: quality/safety criteria, timeout, cancellation, retry, and overwrite policy.
- Q-003: final description limits and image specification.
- Q-001/Q-015: asset retention, durable URI/storage, deletion, restart recovery, and downstream reuse scope.

The provider boundary is implemented in `src/services/ai-image-generation-provider.ts`; runtime request/result validation is in `src/contracts/ai-image-generation-contract.ts`. The formal material page is not wired to this Store action, and real provider/file integration remains unconfigured.
