/**
 * Small stand-ins for browser features older iPhones lack (Safari before iOS 15.4), so the web
 * build doesn't stop at a blank page there. Imported first by the root layout; no-ops elsewhere.
 */
const g = globalThis as unknown as Record<string, unknown>

if (typeof (Object as { hasOwn?: unknown }).hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    value: (target: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(target, key),
    configurable: true,
    writable: true,
  })
}

if (typeof g.structuredClone !== 'function') {
  // Enough for the plain data the app and its libraries copy (animation configs, cached JSON).
  g.structuredClone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T))
}

export {}
