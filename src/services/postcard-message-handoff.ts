type PostcardMessageHandoff = {
  photoId: string;
  location: string;
  message: string;
  expiresAt: number;
};

const HANDOFF_TTL_MS = 2 * 60 * 1000;
const handoffs = new Map<string, PostcardMessageHandoff>();
let nextHandoffId = 0;

function removeExpiredHandoffs(now: number) {
  for (const [token, handoff] of handoffs) {
    if (handoff.expiresAt <= now) handoffs.delete(token);
  }
}

export function createPostcardMessageHandoff(
  photoId: string,
  location: string,
  message: string,
) {
  const now = Date.now();
  removeExpiredHandoffs(now);
  const token = `${now.toString(36)}-${(++nextHandoffId).toString(36)}`;
  handoffs.set(token, {
    photoId,
    location,
    message,
    expiresAt: now + HANDOFF_TTL_MS,
  });
  return token;
}

export function consumePostcardMessageHandoff(
  token: string,
  photoId: string,
  location: string,
) {
  const handoff = handoffs.get(token);
  handoffs.delete(token);
  if (!handoff || handoff.expiresAt <= Date.now()
    || handoff.photoId !== photoId || handoff.location !== location) return undefined;
  return handoff.message;
}
