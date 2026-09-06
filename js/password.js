function toBase36(n) {
  return n.toString(36).toUpperCase();
}

function fromBase36(s) {
  return parseInt(s, 36);
}

function checksumFor(index) {
  return (index * 7 + 13) % 36;
}

export function encodeStageIndex(index) {
  const idxPart = toBase36(index).padStart(2, '0');
  const checkPart = toBase36(checksumFor(index));
  return `${idxPart}-${checkPart}`;
}

export function decodeStagePassword(raw) {
  const cleaned = raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (cleaned.length < 3) return { ok: false };

  const idxPart = cleaned.slice(0, -1);
  const checkPart = cleaned.slice(-1);
  const index = fromBase36(idxPart);
  const check = fromBase36(checkPart);
  if (Number.isNaN(index) || Number.isNaN(check)) return { ok: false };
  if (checksumFor(index) !== check) return { ok: false };

  return { ok: true, index };
}
