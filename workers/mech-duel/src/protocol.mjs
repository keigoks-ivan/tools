import { isMechId } from '../../../game/mech/duel/mech-roster.mjs';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const ROOM_CODE = /^[0-9abcdefghjkmnpqrstvwxyz]{24}$/;
const RESUME_TOKEN = /^[0-9a-f]{32}$/;

export const PROTOCOL = 1;
export const CLOSE = {
  room_not_found: 4404,
  room_full: 4409,
  resume_expired: 4410,
  replaced: 4411,
  room_expired: 4412,
  rate_limit: 4429,
};

export function roomCode(value) {
  return typeof value === 'string' && ROOM_CODE.test(value) ? value : null;
}

export function makeRoomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => ALPHABET[b & 31]).join('');
}

export function validResumeToken(value) {
  return typeof value === 'string' && RESUME_TOKEN.test(value);
}

export function makeResumeToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}

export function originAllowed(origin, allowlist) {
  if (!origin || !allowlist) return false;
  for (const entry of allowlist.split(',')) {
    const allowed = entry.trim();
    if (origin === allowed) return true;
    if (!allowed.endsWith(':*')) continue;
    const prefix = allowed.slice(0, -1);
    if (origin.startsWith(prefix) && /^\d{1,5}$/.test(origin.slice(prefix.length))) return true;
  }
  return false;
}

export function readPacket(message) {
  if (typeof message !== 'string' || message.length > 768) return null;
  let packet;
  try { packet = JSON.parse(message); } catch { return null; }
  switch (packet?.t) {
    case 'ready':
      return typeof packet.value === 'boolean' ? { t: 'ready', value: packet.value } : null;
    case 'mech':
      return isMechId(packet.id) ? {t:'mech',id:packet.id} : null;
    case 'rematch':
      return { t: 'rematch' };
    case 'leave':
      return { t: 'leave' };
    case 'input':
      return Number.isSafeInteger(packet.seq) && packet.seq >= 0 && packet.input && typeof packet.input === 'object' && !Array.isArray(packet.input)
        ? { t: 'input', seq: packet.seq, input: packet.input } : null;
    default:
      return null;
  }
}

// A selection never touches a pilot, weapon or collision value.
export function selectMech(record, slot, id) {
  const seat=record?.slots?.[slot];
  if (!seat || seat.ready || !isMechId(id) || (record.match && record.match.phase !== 'matchEnd')) return false;
  if (seat.mech === id) return false;
  seat.mech=id;
  return true;
}
