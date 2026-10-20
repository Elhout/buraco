import { Redirect } from 'expo-router'

/** Club settings moved into Settings (/profile); keep old links working. */
export default function ClubSettingsRedirect() {
  return <Redirect href="/profile" />
}
