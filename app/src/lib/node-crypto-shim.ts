// Browser shim for the node "crypto" import inside mainnet-js.
// mainnet-js only calls crypto.randomBytes on its node code path (in the
// browser it prefers window.crypto), but the static import itself would
// otherwise be externalized by Vite into a throwing stub. This shim makes
// the import functional with WebCrypto instead.
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export default { randomBytes };
