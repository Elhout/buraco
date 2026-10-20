import { describe, expect, it } from 'vitest'
import { digitsOnly, toLatinDigits } from './digits'

describe('toLatinDigits', () => {
  it('converts Arabic-Indic and Persian digits', () => {
    expect(toLatinDigits('٥٥٥١٢٣٤')).toBe('5551234')
    expect(toLatinDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789')
  })

  it('leaves Latin digits and other characters alone', () => {
    expect(toLatinDigits('+974 55')).toBe('+974 55')
  })
})

describe('digitsOnly', () => {
  it('keeps only digits, in Latin', () => {
    expect(digitsOnly('2,0٠0 pts')).toBe('2000')
  })
})
