/**
 * Account deletion is confirmed by typing a word: DELETE in English, حذف in Arabic. Either word
 * is accepted in both languages (people switch keyboards). Pure; tested in deleteConfirm.test.ts.
 */
export const DELETE_WORDS = ['DELETE', 'حذف'] as const

const ARABIC_MARKS = /[ً-ٰٟـ]/g // harakat and tatweel

export function isDeleteConfirmed(input: string): boolean {
  const typed = input.trim().replace(ARABIC_MARKS, '').toUpperCase()
  return DELETE_WORDS.some((w) => w === typed)
}
