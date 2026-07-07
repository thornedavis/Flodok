// Pipeline colour per lifecycle stage — the single source of truth so the board
// column dots, the stage pills, and the path tracker all read the same:
// grey → orange → blue → green(done). Kept out of the component files so fast
// refresh stays happy (a component module shouldn't also export constants).

import { pathIndex } from './recruitmentStatus'
import type { LifecycleStage } from './lifecycle'

export const STAGE_COLORS = [
  'var(--color-text-tertiary)', // prospective
  'var(--color-warning)',       // shortlisted
  'var(--color-primary)',       // offered
  'var(--color-success)',       // signed
  'var(--color-success)',       // active
]

export function stageColor(stage: LifecycleStage): string {
  return STAGE_COLORS[pathIndex(stage)] ?? STAGE_COLORS[0]
}
