import arAuth from './locales/ar/auth.json'
import arCommon from './locales/ar/common.json'
import arGame from './locales/ar/game.json'
import arHistory from './locales/ar/history.json'
import arLobby from './locales/ar/lobby.json'
import arProfile from './locales/ar/profile.json'
import arStats from './locales/ar/stats.json'
import arTournament from './locales/ar/tournament.json'
import enAuth from './locales/en/auth.json'
import enCommon from './locales/en/common.json'
import enGame from './locales/en/game.json'
import enHistory from './locales/en/history.json'
import enLobby from './locales/en/lobby.json'
import enProfile from './locales/en/profile.json'
import enStats from './locales/en/stats.json'
import enTournament from './locales/en/tournament.json'

/** One namespace per feature so features never edit the same file. English is the source of truth for types. */
export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    lobby: enLobby,
    game: enGame,
    history: enHistory,
    stats: enStats,
    tournament: enTournament,
    profile: enProfile,
  },
  ar: {
    common: arCommon,
    auth: arAuth,
    lobby: arLobby,
    game: arGame,
    history: arHistory,
    stats: arStats,
    tournament: arTournament,
    profile: arProfile,
  },
} as const

export const NAMESPACES = ['common', 'auth', 'lobby', 'game', 'history', 'stats', 'tournament', 'profile'] as const
export type Namespace = (typeof NAMESPACES)[number]
export type Lang = keyof typeof resources
export const LANGS: readonly Lang[] = ['en', 'ar']
