import { USERNAME_MAX, validateUsername } from '@buraco/shared'

/**
 * A username guessed from the player's name ("Abu Ali" → "abuali"), so adding a player is just
 * name + password. Latin letters and digits only; returns '' when nothing usable (e.g. an Arabic
 * name), and the admin types one. Pure; tested in usernameSuggestion.test.ts.
 */
export function suggestUsername(name: string): string {
  const latin = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, USERNAME_MAX)
  return validateUsername(latin).ok ? latin : ''
}
