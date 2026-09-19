/** Prevent device-local profile edits from being uploaded to a different account. */
const OWNER_KEY = 'teeready-profile-owner-v1';
let memoryOwner: string | null = null;

export function profileOwner(): string | null {
  try { return localStorage.getItem(OWNER_KEY) ?? memoryOwner; }
  catch { return memoryOwner; }
}

export function bindProfileOwner(userId: string, reset: () => void): boolean {
  const previous = profileOwner();
  if (previous && previous !== userId) reset();
  memoryOwner = userId;
  try { localStorage.setItem(OWNER_KEY, userId); } catch { /* Storage may be disabled. */ }
  return previous === userId;
}
