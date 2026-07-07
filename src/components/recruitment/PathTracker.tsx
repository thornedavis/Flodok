import { Fragment } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { pathIndex } from '../../lib/recruitmentStatus'
import { STAGE_COLORS } from '../../lib/recruitmentColors'
import type { LifecycleStage } from '../../lib/lifecycle'

// The Prospective→Active path line. One component, three sizes:
//   mini — bare dots+lines for a board card
//   row  — labelled, for a list row
//   lg   — larger + labelled, for the detail drawer
// `imminent` dashes the *next* node (used for a signed hire in "Starting soon"
// who is about to graduate to Active).

type Size = 'mini' | 'row' | 'lg'

const STAGES: LifecycleStage[] = ['prospective', 'shortlisted', 'offered', 'signed', 'active']

export function PathTracker({ stage, imminent = false, size = 'mini' }: {
  stage: LifecycleStage
  imminent?: boolean
  size?: Size
}) {
  const { t } = useLang()
  const idx = pathIndex(stage)
  const labels = [
    t.hiringStageProspective,
    t.hiringStageShortlisted,
    t.hiringStageOffered,
    t.hiringStageSigned,
    t.hiringStageActive,
  ]
  const showLabels = size !== 'mini'
  // Board cards (mini) and list rows (row) share the same 9px dot; only the
  // drawer bumps to 11. Mini just drops the labels, everything else matches.
  const dot = size === 'lg' ? 11 : 9
  const colW = size === 'lg' ? 52 : size === 'row' ? 44 : dot

  // Everything reached (completed + current) takes the current stage's colour;
  // the future stays a muted outline. So the whole filled run reads grey /
  // orange / blue / green depending on where the candidate is.
  const cur = STAGE_COLORS[idx] ?? STAGE_COLORS[0]
  // Pull each connector under the adjacent dot-columns so the line nearly
  // touches the dots instead of stopping short in the label gutter.
  const segInset = Math.max(0, (colW - dot) / 2 - 3)

  function nodeStyle(i: number): React.CSSProperties {
    const base: React.CSSProperties = {
      width: dot, height: dot, borderRadius: '50%', boxSizing: 'border-box',
      border: '1.5px solid var(--color-border-strong)', background: 'var(--color-bg)', flex: '0 0 auto',
    }
    if (i < idx) return { ...base, background: cur, borderColor: cur }
    if (i === idx) {
      // Fill + a soft "you are here" ring in the stage colour, on every size so
      // the board, list and drawer trackers read identically (scaled a touch
      // tighter on the small card dots).
      const ring = 3
      return {
        ...base, background: cur, borderColor: cur,
        boxShadow: `0 0 0 ${ring}px color-mix(in srgb, ${cur} 22%, transparent)`,
      }
    }
    if (imminent && i === idx + 1) return { ...base, borderColor: cur, borderStyle: 'dashed' }
    return base
  }

  function segStyle(i: number): React.CSSProperties {
    return {
      flex: 1, height: 2, minWidth: 6, alignSelf: 'flex-start',
      marginTop: (dot - 2) / 2,
      marginLeft: -segInset, marginRight: -segInset,
      background: i < idx ? cur : 'var(--color-border-strong)',
    }
  }

  // The Active endpoint pulses when a hire is at (or imminently reaching) it —
  // i.e. an active employee or a "starting soon" hire about to graduate.
  const activePulses = (i: number) => i === 4 && (i === idx || (imminent && i === idx + 1))

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
      {STAGES.map((_, i) => (
        <Fragment key={i}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', width: colW }}>
            <span className={activePulses(i) ? 'recruit-path-pulse' : undefined} style={nodeStyle(i)} />
            {showLabels && (
              <span style={{
                marginTop: 5, fontSize: 10, lineHeight: 1.2, textAlign: 'center',
                color: i === idx ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                fontWeight: i === idx ? 600 : 400,
              }}>{labels[i]}</span>
            )}
          </div>
          {i < STAGES.length - 1 && <span style={segStyle(i)} />}
        </Fragment>
      ))}
    </div>
  )
}
