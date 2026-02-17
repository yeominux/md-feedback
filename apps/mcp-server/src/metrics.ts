import type { MemoV2, MemoImpl, Gate, Checkpoint, MemoArtifact, MemoDependency } from '@md-feedback/shared'
import { isResolved } from '@md-feedback/shared'

export interface ReviewMetrics {
  totalMemos: number
  byStatus: Record<string, number>
  byType: Record<string, number>
  resolutionRate: number

  totalImpls: number
  implsByStatus: Record<string, number>
  appliedCount: number
  revertedCount: number
  failedCount: number

  totalGates: number
  gatesByStatus: Record<string, number>

  totalArtifacts: number
  linkedFiles: number

  totalDependencies: number
  blockingChains: number

  totalCheckpoints: number
  lastCheckpoint: string | null

  avgResolutionTime: number | null
}

export function computeMetrics(
  memos: MemoV2[],
  impls: MemoImpl[],
  gates: Gate[],
  checkpoints: Checkpoint[],
  artifacts: MemoArtifact[],
  dependencies: MemoDependency[],
): ReviewMetrics {
  // Annotation metrics
  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}
  let resolvedCount = 0

  for (const memo of memos) {
    byStatus[memo.status] = (byStatus[memo.status] || 0) + 1
    byType[memo.type] = (byType[memo.type] || 0) + 1
    if (isResolved(memo.status)) resolvedCount++
  }

  const resolutionRate = memos.length > 0 ? resolvedCount / memos.length : 0

  // Implementation metrics
  const implsByStatus: Record<string, number> = {}
  let appliedCount = 0
  let revertedCount = 0
  let failedCount = 0

  for (const impl of impls) {
    implsByStatus[impl.status] = (implsByStatus[impl.status] || 0) + 1
    if (impl.status === 'applied') appliedCount++
    if (impl.status === 'reverted') revertedCount++
    if (impl.status === 'failed') failedCount++
  }

  // Gate metrics
  const gatesByStatus: Record<string, number> = {}
  for (const gate of gates) {
    gatesByStatus[gate.status] = (gatesByStatus[gate.status] || 0) + 1
  }

  // Artifact metrics
  const fileSet = new Set<string>()
  for (const art of artifacts) {
    for (const f of art.files) {
      fileSet.add(f)
    }
  }

  // Dependency metrics
  const blockingChains = dependencies.filter(d => d.type === 'blocks').length

  // Checkpoint metrics
  let lastCheckpoint: string | null = null
  if (checkpoints.length > 0) {
    lastCheckpoint = checkpoints.reduce((latest, cp) =>
      cp.timestamp > latest ? cp.timestamp : latest,
      checkpoints[0].timestamp,
    )
  }

  // Time metrics — avg resolution time for resolved memos with valid timestamps
  let avgResolutionTime: number | null = null
  const resolvedMemos = memos.filter(m => isResolved(m.status) && m.createdAt && m.updatedAt)
  if (resolvedMemos.length > 0) {
    let totalMs = 0
    let validCount = 0
    for (const memo of resolvedMemos) {
      const created = new Date(memo.createdAt).getTime()
      const updated = new Date(memo.updatedAt).getTime()
      if (!isNaN(created) && !isNaN(updated) && updated > created) {
        totalMs += updated - created
        validCount++
      }
    }
    if (validCount > 0) {
      avgResolutionTime = totalMs / validCount
    }
  }

  return {
    totalMemos: memos.length,
    byStatus,
    byType,
    resolutionRate,

    totalImpls: impls.length,
    implsByStatus,
    appliedCount,
    revertedCount,
    failedCount,

    totalGates: gates.length,
    gatesByStatus,

    totalArtifacts: artifacts.length,
    linkedFiles: fileSet.size,

    totalDependencies: dependencies.length,
    blockingChains,

    totalCheckpoints: checkpoints.length,
    lastCheckpoint,

    avgResolutionTime,
  }
}
