export const SATS_PER_BCH = 100_000_000n;
export const TOKEN_DUST = 1000n; // sats carried by a CashTokens output
/** BCH dust carried by every share UTXO; it later pays the claim fee. */
export const SHARE_DUST = 5000n;
/** Contract transactions are ~3.5 KB, so keep generous fee headroom. */
export const FEE_RESERVE = 6000n;

/**
 * Reverse the byte order of a hex string. CashToken categories appear in
 * display order in UTXO token fields and config, but must be passed to
 * contract constructors byte-reversed.
 */
export function reverseHex(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const pairs: string[] = [];
  for (let i = 0; i + 2 <= clean.length; i += 2) pairs.push(clean.slice(i, i + 2));
  return pairs.reverse().join('');
}

/** Format a satoshi amount as a BCH string, trailing zeros trimmed. */
export function formatBch(sats: bigint | number, maxDecimals = 8): string {
  const value = typeof sats === 'bigint' ? sats : BigInt(Math.round(sats));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SATS_PER_BCH;
  const frac = abs % SATS_PER_BCH;
  let fracStr = frac.toString().padStart(8, '0').slice(0, maxDecimals);
  fracStr = fracStr.replace(/0+$/, '');
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${wholeStr}${fracStr ? `.${fracStr}` : ''}`;
}

export function formatSats(sats: bigint | number): string {
  const value = typeof sats === 'bigint' ? sats : BigInt(Math.round(sats));
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} sats`;
}

/** "63%" style percentage from a 0..1 probability. */
export function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Parse a user-typed BCH amount ("0.001", "1.5") into sats. Null when invalid. */
export function parseBchToSats(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === '' || trimmed === '.') return null;
  const [wholePart, fracPart = ''] = trimmed.split('.');
  if (fracPart.length > 8) return null;
  const whole = BigInt(wholePart || '0');
  const frac = BigInt((fracPart + '00000000').slice(0, 8));
  const sats = whole * SATS_PER_BCH + frac;
  return sats > 0n ? sats : null;
}

/** Human countdown to a unix-seconds deadline. */
export function countdown(deadlineSec: number, nowSec: number): string {
  const diff = deadlineSec - nowSec;
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

export function formatDateTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortValue(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
