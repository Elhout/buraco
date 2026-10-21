import { Redirect } from 'expo-router'

/**
 * Any unknown address (e.g. /game after a web reload, or an old link) goes to the start screen
 * instead of "Unmatched Route"; index.tsx then picks sign-in or Play.
 */
export default function NotFound() {
  return <Redirect href="/" />
}
