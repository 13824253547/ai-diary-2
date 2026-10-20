# Discovery Read Contract v1

Status: DEV-2/3 implementation contract. It describes the first-party backend read/interaction boundary only; it does not decide which diary becomes public or authorize a publishing flow.

## Identity

Every endpoint requires a non-empty `x-device-id`, resolved before query/body validation so missing identity consistently returns `device_identity_required`. The device ID scopes a user's like relation. Published story content is served only from the independent `DiscoveryStory` read model and is not inferred from a diary's `privacy` value or `publicBlockIds`.

## Published Story Read Model

A story is readable only when all of the following are true:

- `publicationStatus = published`
- `publishedAt` is set
- `withdrawnAt` is null

The read model contains an explicit display snapshot: `title`, `authorDisplayName`, `coverUri`, `date`, `location`, and `body`. Private diaries, unpublished rows, withdrawn rows, and source diaries are not read by these endpoints.

No public API to create or withdraw a story is included. A future publication orchestrator must supply an approved projection after Q-007/Q-013 rules are confirmed.

## Endpoints

### `GET /api/discovery/stories`

Query:

| Field | Rule |
| --- | --- |
| `keyword` | Optional; trimmed and matched against title, location, or author display name |
| `page` | Positive safe integer; defaults to `1` |
| `pageSize` | One of `10`, `20`, `50`, `100`; defaults to `20` |
| `category` | Required; `latest` only until Q-007 confirms other categories |

An absent category, `recommended`, and `local` are rejected until Q-007 defines their source and behavior. `latest` results use date-descending, ID-descending stable ordering and include server like count plus the current device's like state. The service does not choose a default category on behalf of the product.

The HTTP wire values for `page` and `pageSize` must be decimal integer strings; exponent, hexadecimal, fractional, whitespace, and repeated parameter encodings return `invalid_input`. `keyword` must be a single string when present. The controller validates device identity before these query values and rejects malformed inputs before calling the read service.

### `GET /api/discovery/stories/:storyId`

Returns the exact currently published snapshot. The service rejects an empty/non-string story ID before querying; the client accepts a response only when its validated `id` exactly matches the requested ID. Missing, unpublished, and withdrawn IDs return the same `not_found` response and no story body.

### `PUT /api/discovery/stories/:storyId/like`

Body: `{ "liked": boolean }`.

The endpoint is a target-state operation, so replaying the same target does not create duplicate relations. The composite key is `(storyId, ownerDeviceId)`. Each write locks the currently published story row before applying the target and reading the relation/count, serializing mutations for that story. This does not guarantee the order in which callers issued requests when network arrivals race; caller-intent ordering remains subject to Q-007. Writes are rejected unless the explicit story record has `likesEnabled = true`; identity eligibility and withdrawal policy remain subject to Q-007. An existing story with likes disabled returns HTTP `409`, `error.code = interaction_not_available`, and `retryable = false`. This describes the current read-model capability gate and does not decide which stories should enable likes.

The operation requires a non-empty story ID, a valid device identity, and a boolean target state. The client accepts the returned like state only when `storyId` exactly matches the requested story ID.

## Deferred Decisions

- Q-007: publication source/trigger, anonymous author mapping, recommendation/local-city rules, and who may like.
- Q-013: public projection, anonymous fields, and withdrawal propagation.
- Q-001: cache and interaction retention/recovery scope.
- Search length and special-character limits remain governed by Q-003.

This contract has no complete CASE pass evidence. DEV-2/3 controller/service tests passed within `npm --prefix backend run test -- --silent` (8 suites / 77 tests) after correcting a missing `findFirst` Prisma mock and adding explicit controller-level category rejection; the backend build passed. No migration was applied and no public story rows were created, so these unit tests do not prove MySQL persistence, publication ingestion, UI wiring, or real story delivery.
