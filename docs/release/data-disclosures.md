# Store data disclosures (draft)

Answers for App Store Connect "App Privacy" and Google Play "Data safety", matching
`privacy-policy.md`. Re-check if analytics or new providers are added.

## App Store — App Privacy

Tracking: **No** (no data used to track users across apps/websites; no IDFA).

| Data type | Collected | Linked to user | Purpose |
| --- | --- | --- | --- |
| Contact info → Name | Yes | Yes | App functionality |
| User content → Other user content (game scores, tournament results) | Yes | Yes | App functionality |
| Identifiers → User ID | Yes | Yes | App functionality |
| Identifiers → Device ID (push token) | Yes | Yes | App functionality |
| Diagnostics → Crash data | Yes | No | App functionality |

Sign-in is a username and password created by a club admin. No third-party login is offered,
so Sign in with Apple (guideline 4.8) is not required. Account deletion
starts inside the app (guideline 5.1.1(v)); see below.

## Google Play — Data safety

- Data encrypted in transit: **Yes** (TLS to Supabase, Expo, Sentry).
- Users can request deletion: **Yes** (in the app: Profile → Delete account).
- Collected: Personal info (name, user IDs), App activity (other
  user-generated content: scores), App info and performance (crash logs), Device or other IDs
  (push token). None shared with third parties for their own purposes; processors only.
- Purposes: App functionality; crash logs for analytics/diagnostics.

## Account deletion

In-app deletion is implemented: Profile → Delete account calls the `delete-account` Edge
Function, which runs `anonymize_user` (migration 20261025000000: seats become "Former member",
club ownership passes on, PIN/devices/memberships removed) and then deletes the auth user.
Answer "Users can request deletion: Yes (in the app)".
