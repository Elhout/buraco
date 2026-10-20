import type { Json } from './database.types'
import { DEFAULT_CONFIG, type ScoringConfig } from './scoring'

const isObject = (v: Json | unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Reads `games.config_snapshot` (written by the snapshot_game_config trigger) into a ScoringConfig. */
export function configFromSnapshot(snapshot: Json | unknown): ScoringConfig {
  if (!isObject(snapshot)) return DEFAULT_CONFIG
  const { target_score, cut_bonus, allow_negative } = snapshot
  return {
    targetScore: Number.isInteger(target_score) && (target_score as number) > 0 ? (target_score as number) : DEFAULT_CONFIG.targetScore,
    cutBonus: Number.isInteger(cut_bonus) && (cut_bonus as number) >= 0 ? (cut_bonus as number) : DEFAULT_CONFIG.cutBonus,
    allowNegative: typeof allow_negative === 'boolean' ? allow_negative : DEFAULT_CONFIG.allowNegative,
  }
}
