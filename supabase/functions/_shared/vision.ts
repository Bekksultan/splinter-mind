/**
 * Vision provider selection. Mock is the default (AI mock mode, zero cost).
 * The real openai-compatible provider is used ONLY when explicitly configured
 * via VISION_PROVIDER=openai-compatible + VISION_API_KEY (+ optional
 * VISION_API_URL / VISION_MODEL). Config is passed in — no Deno APIs here.
 */
import {
  MockVisionAnalyzer,
  OpenAICompatibleVisionAnalyzer,
  type VisionAnalyzer,
} from '../../../packages/core/src/index.ts';

export interface VisionConfig {
  provider: string;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

export function getVisionAnalyzer(cfg: VisionConfig): VisionAnalyzer {
  if (cfg.provider === 'openai-compatible') {
    if (!cfg.apiKey || !cfg.apiUrl) {
      throw new Error('VISION_API_KEY and VISION_API_URL are required for VISION_PROVIDER=openai-compatible');
    }
    return new OpenAICompatibleVisionAnalyzer(cfg.apiUrl, cfg.apiKey, cfg.model ?? 'gpt-4o-mini');
  }
  return new MockVisionAnalyzer();
}
