import { describe, expect, it } from 'vitest'
import { AUTO_RELOAD_WINDOW_MS, isStaleBundleError, mayAutoReload } from './staleBundle'

describe('isStaleBundleError', () => {
  it.each([
    new Error('Loading chunk 42 failed.'),
    new TypeError('Failed to fetch dynamically imported module: https://x/_expo/a.js'),
    new TypeError('Importing a module script failed.'),
    new SyntaxError("Unexpected token '<'"),
    new Error('Requiring unknown module "1234".'),
  ])('recognises %s', (error) => {
    expect(isStaleBundleError(error)).toBe(true)
  })

  it('ignores ordinary errors', () => {
    expect(isStaleBundleError(new Error('game is not live'))).toBe(false)
    expect(isStaleBundleError(null)).toBe(false)
  })
})

describe('mayAutoReload', () => {
  it('reloads once, then waits a minute before trying again', () => {
    expect(mayAutoReload(null, 1_000)).toBe(true)
    expect(mayAutoReload(1_000, 1_000 + AUTO_RELOAD_WINDOW_MS)).toBe(false)
    expect(mayAutoReload(1_000, 1_001 + AUTO_RELOAD_WINDOW_MS)).toBe(true)
  })
})
