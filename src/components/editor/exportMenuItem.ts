import type { ToolbarMenuItem } from './ToolbarMoreMenu'

// The Export ▸ submenu item (PDF + Word). Shared by every document editor so
// the wording and busy-state behaviour stay identical. `exporting` is the
// in-flight format (or null); it disables both children and swaps the label.
// Lives in its own (non-component) file so ToolbarMoreMenu can stay
// fast-refresh friendly.

type ExportMenuLabels = { exportMenu: string; exportPdf: string; exportDocx: string; generatingPdf: string; generatingDocx: string }

export function buildExportMenuItem({ onPdf, onDocx, exporting, t }: {
  onPdf: () => void
  onDocx: () => void
  exporting: 'pdf' | 'docx' | null
  t: ExportMenuLabels
}): ToolbarMenuItem {
  return {
    key: 'export',
    icon: 'download',
    label: t.exportMenu,
    children: [
      { key: 'export-pdf', label: exporting === 'pdf' ? t.generatingPdf : t.exportPdf, onClick: onPdf, disabled: exporting !== null },
      { key: 'export-docx', label: exporting === 'docx' ? t.generatingDocx : t.exportDocx, onClick: onDocx, disabled: exporting !== null },
    ],
  }
}
