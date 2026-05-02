import { useLang } from '../../../contexts/LanguageContext'
import { SectionPanel } from '../SectionPanel'
import { SectionHeader } from '../SectionHeader'

export function EmptySection({ title }: { title: string }) {
  const { t } = useLang()
  return (
    <div>
      <SectionHeader title={title} />
      <SectionPanel title={title}>
        <div className="py-10 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.empSectionEmpty}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.empSectionEmptyHint}</p>
        </div>
      </SectionPanel>
    </div>
  )
}
