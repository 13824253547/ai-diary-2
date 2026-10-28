# Discovery Read Contract v1

Status: DEV-63 first-party publish/read boundary. Non-private diary visibility now creates or refreshes a discovery snapshot in the same database transaction; private visibility withdraws it. Historical public diaries are not backfilled.

## Identity

Discovery list/detail/like endpoints require a non-empty `x-device-id`, resolved before query/body validation. The device ID scopes a user's like relation; story content itself is public. Public photo reads use a separate story-scoped route and do not accept a device identity header.

## Published Story Read Model

A story is readable only when all of the following are true:

- `publicationStatus = published`
- `publishedAt` is set
- `withdrawnAt` is null

The read model contains an explicit display snapshot: `title`, `authorDisplayName`, `coverUri`, `date`, `location`, `cityKey`, `body`, and selected `publicContent` blocks/photos. It is bound to `sourceDiaryId + sourceDiaryVersion`. Private diaries, unpublished rows, withdrawn rows, stale source versions, and private source diaries are not returned.

New publication snapshots store `publicContent` as `{ characterId, blocks }`, with only the paper's character/theme identifier and selected public blocks/photos. The response exposes `characterId` to render the same paper theme as the saved diary, without reading the source diary during discovery. Legacy block-array snapshots remain readable with the default paper theme until their owner updates publication. The cover prefers the saved diary cover only if that photo is among the selected public photos; otherwise it uses the first public photo or no cover.

The sharing transaction validates that every selected ID refers to a text/quote block, constructs a snapshot from only those blocks and their associated photos, and atomically publishes or updates the source diary's story. Switching to private withdraws the story and clears its public content/photo references. There is no bulk backfill for older public diaries.

Anonymous text replaces known person names and aliases and suppresses location. If selected content contains photos while anonymous photo masking is unavailable, publication fails closed with `publication_blocked`; the existing privacy value and prior story remain unchanged.

## Endpoints

### `GET /api/discovery/stories`

Query:

| Field | Rule |
| --- | --- |
| `keyword` | Optional; trimmed and matched against title, location, or author display name |
| `page` | Positive safe integer; defaults to `1` |
| `pageSize` | One of `10`, `20`, `50`, `100`; defaults to `20` |
| `category` | Required; `latest` or `same-city` |
| `city` | Required only for `same-city`; device-reverse-geocoded city label. Coordinates are never sent or stored. |

The client defaults to `latest`; `recommended` is not shown or served. Both categories use date-descending, ID-descending stable ordering and include server like count plus the current device's like state. `same-city` normalizes the requested city and the published diary location, then requires an exact city-key match; unknown locations have an empty city key and are excluded. The current-city permission is requested only after the user opens the same-city tab.

The HTTP wire values for `page` and `pageSize` must be decimal integer strings; exponent, hexadecimal, fractional, whitespace, and repeated parameter encodings return `invalid_input`. `keyword` must be a single string when present. The controller validates device identity before these query values and rejects malformed inputs before calling the read service.

### `GET /api/discovery/stories/:storyId`

Returns the exact currently published snapshot. The service rejects an empty/non-string story ID before querying; the client accepts a response only when its validated `id` exactly matches the requested ID. Missing, unpublished, and withdrawn IDs return the same `not_found` response and no story body.

### `GET /api/photos/discovery/:storyId/photo-content?photoId=...`

Public image access requires an active published story, an unchanged non-private source diary version, and a `photoId` included in that story's selected public content. Unselected photos, anonymous-story photos, withdrawn stories, and stale source versions return `not_found`.

### `PUT /api/discovery/stories/:storyId/like`

Body: `{ "liked": boolean }`.

The endpoint is a target-state operation, so replaying the same target does not create duplicate relations. The composite key is `(storyId, ownerDeviceId)`. Each write locks the currently published story row before applying the target and reading the relation/count, serializing mutations for that story. This does not guarantee the order in which callers issued requests when network arrivals race; caller-intent ordering remains subject to Q-007. Writes are rejected unless the explicit story record has `likesEnabled = true`; identity eligibility and withdrawal policy remain subject to Q-007. An existing story with likes disabled returns HTTP `409`, `error.code = interaction_not_available`, and `retryable = false`. This describes the current read-model capability gate and does not decide which stories should enable likes.

The operation requires a non-empty story ID, a valid device identity, and a boolean target state. The client accepts the returned like state only when `storyId` exactly matches the requested story ID.

## Deferred Decisions

- Q-007: comments are not offered in the current UI; if restored later, moderation, exact like eligibility, and retention of interaction rows after withdrawal must be decided first.
- Q-013: broader anonymous identity policy and withdrawal effects on previously exported files.
- Q-001: cache and interaction retention/recovery scope.
- Search length and special-character limits remain governed by Q-003.

DEV-63 adds migration `20261026150000_diary_discovery_publication`. Fresh/legacy/baseline migration checks passed; isolated MySQL E2E verified selected-block publication, latest/same-city reads, private withdrawal, and anonymous-photo failure. Client/backend unit tests, typecheck, and backend build passed. Historical public diaries are not backfilled; live simulator location permission and non-empty story UI still require device verification.
