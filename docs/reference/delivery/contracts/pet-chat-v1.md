# Pet Chat Contract v1

Version: `pet-chat-v1`

This first-party contract persists device-owned conversations and turns. Reply generation remains behind the replaceable client `ChatReplyProvider`; development replies are explicitly marked `mock`. The API does not generate fixed replies or treat them as provider output.

## Identity and ordering

- Every operation requires `x-device-id`. Conversation reads and writes are scoped to the exact device identity.
- The client supplies stable conversation, request, and message IDs. A request ID is unique within its device-owned conversation.
- User and assistant messages are stored separately and associated with a turn. A stable turn sequence determines display order, so out-of-order provider responses do not reorder the conversation.
- The welcome guide is not persisted as a user message.
- Text is trimmed at the boundary and whitespace-only turns are rejected. Q-003 still determines the final input length and keyboard policy.

## API

- `GET /chat/conversations?page=1&pageSize=20` lists only conversations owned by the current device. `page` and `pageSize` are single decimal-integer query values; exponent, hexadecimal, fractional, whitespace-padded, and repeated values are rejected. Supported page sizes are 10, 20, 50, and 100.
- `GET /chat/conversations/:conversationId` reads the ordered messages and turn states for one owned conversation.
- `POST /chat/conversations/:conversationId/turns` persists one user message and a pending turn. Replaying the same request ID with the same user message is idempotent; changing the content under that request ID is rejected.
- `POST /chat/conversations/:conversationId/turns/:requestId/reply` stores a reply only for the current pending attempt. Replaying the same result does not create a duplicate assistant message; a different result cannot replace an already completed response.
- `POST /chat/conversations/:conversationId/turns/:requestId/failure` stores only the fixed failure code (`timeout`, `cancelled`, `provider_failed`), never the provider's raw error text.
- `POST /chat/conversations/:conversationId/turns/:requestId/retry` advances a failed request to the explicitly supplied next attempt. Replaying the same pending attempt is idempotent. The contract does not choose an automatic retry count or timing.
- Because no trusted server-side chat provider is currently configured, `NODE_ENV=production` rejects turn creation, retries, and client-submitted replies before mutation; existing history remains readable. Development may persist explicitly marked `source: mock` replies, but every non-test runtime rejects client-declared `source: provider`; only isolated tests may exercise that provider contract.

## Persistence and open decisions

The Prisma schema and migration define device-owned conversations, turns, and ordered messages. The migration is additive and must only be applied through the project's approved migration process; it has not been applied as part of DEV work.

The controller validates query wire values after device identity and the service repeats pagination object/type/range validation before database access.

Q-001 still determines retention duration, deletion/cleanup, and cross-device recovery. No TTL, cross-device transfer, or deletion policy is inferred here. Until Q-001 is confirmed, the migration/API are implementation artifacts and do not establish a user-facing retention promise.

Q-002 still determines AI quality, safety, timeout, cancellation, and retry policy. Q-003 still determines the final message length and supported keyboard matrix. The API stores source (`mock`/`provider`) explicitly and never silently turns persistence/provider failure into a successful mock turn. The production provider adapter and its credentials remain unconfigured.
