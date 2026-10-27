import arAuth from './locales/ar/auth.json'
import arChat from './locales/ar/chat.json'
import arCommon from './locales/ar/common.json'
import arGame from './locales/ar/game.json'
import arHistory from './locales/ar/history.json'
import arLobby from './locales/ar/lobby.json'
import arPlayers from './locales/ar/players.json'
import arProfile from './locales/ar/profile.json'
import arQuick from './locales/ar/quick.json'
import arSettings from './locales/ar/settings.json'
import arStats from './locales/ar/stats.json'
import arTournament from './locales/ar/tournament.json'
import enAuth from './locales/en/auth.json'
import enChat from './locales/en/chat.json'
import enCommon from './locales/en/common.json'
import enGame from './locales/en/game.json'
import enHistory from './locales/en/history.json'
import enLobby from './locales/en/lobby.json'
import enPlayers from './locales/en/players.json'
import enProfile from './locales/en/profile.json'
import enQuick from './locales/en/quick.json'
import enSettings from './locales/en/settings.json'
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
    quick: enQuick,
    players: enPlayers,
    settings: enSettings,
    chat: enChat,
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
    quick: arQuick,
    players: arPlayers,
    settings: arSettings,
    chat: arChat,
  },
} as const

export const NAMESPACES = [
  'common',
  'auth',
  'lobby',
  'game',
  'history',
  'stats',
  'tournament',
  'profile',
  'quick',
  'players',
  'settings',
  'chat',
] as const
export type Namespace = (typeof NAMESPACES)[number]
export type Lang = keyof typeof resources
export const LANGS: readonly Lang[] = ['en', 'ar']
