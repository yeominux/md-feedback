export * from './types'
export * from './id'
export * from './errors'
export * from './utils'
export * from './feedback-collector'
export * from './legacy'
export * from './context-generator'
export * from './document-writer'
export * from './handoff-generator'
export * from './gate-evaluator'

// Export markdown-roundtrip (serializeCheckpoint now comes from document-writer via export *)
export {
  convertMemosToHtml,
  extractMemos,
  normalizeHighlights,
  extractMemosV2,
  generateReviewSummary,
  extractCheckpoints,
  extractHighlightMarks,
  stripHighlightMarks,
} from './markdown-roundtrip'

export {
  getAnnotationCounts,
  getSectionsWithAnnotations,
  getAllSections,
  createCheckpoint,
} from './checkpoint'

export type { AnnotationCounts } from './checkpoint'
