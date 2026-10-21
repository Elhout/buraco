import { toLatinDigits } from '../../../lib/digits'

/** "-120", "١٢٠" → -120; anything else → null. */
export const parseScore = (input: string): number | null => {
  const s = toLatinDigits(input)
    .trim()
    .replace(/[\s,٬]/g, '')
    .replace(/^[−–]/, '-')
  return /^-?\d{1,5}$/.test(s) ? Number(s) : null
}
