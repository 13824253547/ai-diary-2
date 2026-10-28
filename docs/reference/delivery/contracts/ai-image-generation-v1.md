# AI Image Generation Contract v1

Version: `ai-image-generation-v1`

This contract defines the versioned boundary between MAT-005 and a replaceable image-generation provider. The current production path is a device-authenticated backend endpoint; provider credentials remain server-side. It does not define a user-facing retention promise.

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
  "source": "provider",
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
    "generationSource": "provider"
  }
}
```

The device-authenticated server endpoint is `POST /api/photos/materials/ai`. In the production path it calls the configured Ark Seedream image endpoint, validates returned image bytes, persists the image through the material-photo asset service, and only then returns the asset envelope. The client constructs an authenticated content URL rather than trusting a provider-returned temporary URL.

This server-side write is the asset upload: the client must not POST the returned image again. Generated and device-uploaded images share the device-scoped 100-item material quota (the 12-item per-request limit applies to album uploads only). A full library returns `409` with `limit_exceeded` before calling the paid provider; the final transactional write still checks quota for concurrent changes. The same authenticated material-list endpoint returns both sources on restart.

## Provider Prompt Policy

The request `description` and persisted `generationPrompt` remain the user's original text. Before calling the image provider, the server wraps that text with a fixed, higher-priority style instruction: output must use realistic photography / photorealism, and must not use anime, cartoon, illustration, comics, painting, sketch, 3D render, CGI, game-art, or other non-photographic styles. The user description controls scene content but cannot override this style rule. Provider prompt policy is server-owned and is not supplied by the client.

Before registration, the consumer requires the supported contract version, matching request ID and exact submitted description, a `mock` or `provider` source marker, a generated asset with matching provenance fields, and a successful independent readability check. The production UI accepts only `source: provider`. A malformed, stale, cancelled, unreadable, or conflicting asset is not added to the material catalog.

## State and failures

- A pending local request may be deduplicated with another in-flight request for the same normalized description. This is an in-process optimization, not durable or cross-device idempotency.
- Only a current pending request may register its result. Cancellation races the provider and readability check; a late result cannot be registered.
- The adapter may report `cancelled`, `provider_failed`, or `limit_exceeded`. Raw provider details are not exposed as successful asset metadata; capacity errors use a fixed user-facing message.
- A development adapter must mark its result `source: mock`; mock success is not provider quality, durable asset storage, or a CASE pass. A real provider failure must not silently fall back to mock success.
- No timeout or automatic retry semantics are selected by this version.

## Deferred decisions

- Q-002: quality/safety criteria, timeout, cancellation, retry, and overwrite policy.
- Q-003: final description limits and image specification.
- Q-001/Q-015: asset retention, durable URI/storage, deletion, restart recovery, and downstream reuse scope.

The Store provider boundary is implemented in `src/services/ai-image-generation-provider.ts`; the production client adapter is `src/services/http-ai-image-generation-provider.ts`. The NestJS provider and endpoint live under `backend/src/modules/ai-images/`. Server configuration requires `AI_IMAGE_PROVIDER=ark-seedream`, `AI_IMAGE_MODEL`, and either `AI_IMAGE_API_KEY` or the explicitly reusable `PET_CHAT_API_KEY`; credentials remain server-side. The current local model is `doubao-seedream-5-0-flash-260915`, with `1.5K` output size. The generated-asset provenance migration is recorded as applied in the current local database progress. One real provider-to-persistent-asset smoke succeeded on 2026-10-26; see [MAT-005 cases](../test-cases/MAT-005.md). Full UI and native Photos acceptance remains open.
