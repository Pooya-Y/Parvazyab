// Each search mode weighs the criteria differently.
// Each mode's weights always sum to 1 so the final score stays in [0,1].
export const RANKING_MODES = ["relevance", "price", "fastest", "personal"] as const;
export type RankingMode = (typeof RANKING_MODES)[number];

export interface RankingWeights {
  price: number;
  duration: number;
  stops: number;
  reliability: number;
}

export const RANKING_WEIGHT_PRESETS: Record<RankingMode, RankingWeights> = {
  relevance: { price: 0.4, duration: 0.25, stops: 0.2, reliability: 0.15 },
  price: { price: 0.8, duration: 0.1, stops: 0.05, reliability: 0.05 },
  fastest: { price: 0.15, duration: 0.55, stops: 0.2, reliability: 0.1 },
  personal: { price: 0.25, duration: 0.35, stops: 0.15, reliability: 0.25 },
};

export const DEFAULT_RANKING_MODE: RankingMode = "relevance";

export function getRankingWeights(mode: string): RankingWeights {
  return RANKING_WEIGHT_PRESETS[mode as RankingMode] ?? RANKING_WEIGHT_PRESETS[DEFAULT_RANKING_MODE];
}
