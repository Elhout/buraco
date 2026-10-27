/**
 * Every TanStack Query key in one place, so Realtime invalidation and screens agree.
 * Convention: ['<entity>', id, '<facet>'].
 */
export const qk = {
  session: ['session'] as const,
  me: (userId: string) => ['profile', userId] as const,
  hasPin: (userId: string) => ['profile', userId, 'hasPin'] as const,
  devices: (userId: string) => ['profile', userId, 'devices'] as const,

  myClubs: (userId: string) => ['clubs', 'mine', userId] as const,
  club: (clubId: string) => ['club', clubId] as const,
  members: (clubId: string) => ['club', clubId, 'members'] as const,
  accounts: (clubId: string) => ['club', clubId, 'accounts'] as const,
  lobby: (clubId: string) => ['club', clubId, 'lobby'] as const,

  game: (gameId: string) => ['game', gameId] as const,

  history: (clubId: string, filters: unknown) => ['club', clubId, 'history', filters] as const,
  historyAll: (clubId: string) => ['club', clubId, 'history'] as const,
  stats: (clubId: string) => ['club', clubId, 'stats'] as const,
  chat: (clubId: string) => ['club', clubId, 'chat'] as const,

  tournaments: (clubId: string) => ['club', clubId, 'tournaments'] as const,
  tournament: (tournamentId: string) => ['tournament', tournamentId] as const,
} as const
