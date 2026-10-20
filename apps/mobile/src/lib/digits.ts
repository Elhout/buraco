/** Digit normalisation for number inputs. Pure; tested in digits.test.ts. */

const ARABIC_INDIC = /[٠-٩]/g
const EXTENDED_ARABIC_INDIC = /[۰-۹]/g

/** Converts Arabic-Indic and Persian digits to Latin so keyboards in either script work. */
export function toLatinDigits(input: string): string {
  return input
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
}

export const digitsOnly = (input: string): string => toLatinDigits(input).replace(/\D/g, '')
