import { extractMemos, generateReviewSummary } from './markdown-roundtrip'

/**
 * Legacy helpers for v0.3-era memo workflows.
 * Prefer MemoV2-based APIs for new integrations.
 */
export const legacy = {
  extractMemos,
  generateReviewSummary,
}

