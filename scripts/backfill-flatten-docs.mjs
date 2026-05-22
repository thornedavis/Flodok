#!/usr/bin/env node
// One-shot backfill: flatten legacy section-nested `content_doc` blobs
// into the flat block-stream schema the editor now uses.
//
// Context: the editor was migrated from a section-nested document model
// (`document → section+ → bilingualBlock`) to a flat one
// (`document → bilingualBlock+`), where former section titles become
// clause-heading blocks (an h2 in each language body). `normalizeDoc`
// performs that conversion and is wired into every read path, so legacy
// docs already work without this script — it just rewrites stored rows
// once so the DB is uniformly flat instead of converting lazily.
//
// Scope: the LIVE tables only — contracts, sops, document_templates,
// job_descriptions. The *_versions history tables are intentionally
// left untouched: they're immutable point-in-time snapshots and the
// renderers normalize them on read anyway.
//
// Usage:
//   export SUPABASE_URL="https://<proj>.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service-role>"
//
//   # Dry run (default) — reports what WOULD change, writes nothing:
//   node scripts/backfill-flatten-docs.mjs
//
//   # Apply for real:
//   node scripts/backfill-flatten-docs.mjs --apply
//
//   # Limit to one table:
//   node scripts/backfill-flatten-docs.mjs --table contracts --apply
//
// Idempotent: re-running only touches rows that still contain `section`
// nodes. normalizeDoc is a no-op on already-flat docs.

import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const TABLES = ['contracts', 'sops', 'document_templates', 'job_descriptions']
const PAGE = 500

// ── normalizeDoc (mirrors src/lib/documentDoc.ts — kept in sync by hand
// for this standalone script; the canonical implementation lives there) ──

function newBlockId() {
  const random = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36).slice(-4)
  return `blk_${time}${random}`
}

function isDocumentDoc(value) {
  return !!value && typeof value === 'object' && value.type === 'document' && Array.isArray(value.content)
}

function hasSections(doc) {
  return isDocumentDoc(doc) && (doc.content || []).some(n => n && n.type === 'section')
}

function headingBody(lang, title) {
  const t = (title || '').trim()
  return {
    type: 'blockBody',
    attrs: { lang },
    content: [{ type: 'heading', attrs: { level: 2 }, content: t ? [{ type: 'text', text: t }] : [] }],
  }
}

function clauseHeadingBlock(section) {
  const attrs = section.attrs || {}
  return {
    type: 'bilingualBlock',
    attrs: {
      id: typeof attrs.id === 'string' ? attrs.id : newBlockId(),
      needsReview: false,
      numbering: attrs.numberingStyle || 'decimal',
    },
    content: [headingBody('en', attrs.titleEn), headingBody('id', attrs.titleId)],
  }
}

function normalizeDoc(doc) {
  if (!isDocumentDoc(doc)) return { type: 'document', content: [] }
  const content = doc.content || []
  if (!content.some(n => n && n.type === 'section')) return { type: 'document', content }
  const flat = []
  for (const node of content) {
    if (!node || node.type !== 'section') {
      if (node) flat.push(node)
      continue
    }
    flat.push(clauseHeadingBlock(node))
    for (const block of node.content || []) {
      if (block && block.type === 'bilingualBlock') flat.push(block)
    }
  }
  return { type: 'document', content: flat }
}

function die(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

async function backfillTable(supabase, table, apply) {
  let from = 0
  let scanned = 0
  let needing = 0
  let updated = 0
  let errors = 0

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('id, content_doc')
      .not('content_doc', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) die(`select from ${table} failed: ${error.message}`)
    if (!data || data.length === 0) break

    for (const row of data) {
      scanned++
      if (!hasSections(row.content_doc)) continue
      needing++
      const flat = normalizeDoc(row.content_doc)
      if (apply) {
        const { error: upErr } = await supabase
          .from(table)
          .update({ content_doc: flat })
          .eq('id', row.id)
        if (upErr) {
          errors++
          console.error(`  ✗ ${table} ${row.id}: ${upErr.message}`)
        } else {
          updated++
        }
      }
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  console.log(
    `  ${table}: scanned ${scanned}, section-nested ${needing}` +
    (apply ? `, updated ${updated}${errors ? `, errors ${errors}` : ''}` : ' (dry run — no writes)'),
  )
  return { scanned, needing, updated, errors }
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      table: { type: 'string' },
    },
  })

  const apply = values.apply
  const only = values.table
  if (only && !TABLES.includes(only)) die(`unknown --table ${only}; expected one of ${TABLES.join(', ')}`)

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) die('SUPABASE_URL env var is required')
  if (!serviceKey) die('SUPABASE_SERVICE_ROLE_KEY env var is required')

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  console.log(apply ? 'Applying flatten backfill (writing changes):' : 'Dry run (no writes — pass --apply to write):')
  const tables = only ? [only] : TABLES
  const totals = { scanned: 0, needing: 0, updated: 0, errors: 0 }
  for (const table of tables) {
    const r = await backfillTable(supabase, table, apply)
    totals.scanned += r.scanned
    totals.needing += r.needing
    totals.updated += r.updated
    totals.errors += r.errors
  }

  console.log(
    `\nTotal: scanned ${totals.scanned}, section-nested ${totals.needing}` +
    (apply ? `, updated ${totals.updated}${totals.errors ? `, errors ${totals.errors}` : ''}` : ''),
  )
  if (!apply && totals.needing > 0) console.log('Re-run with --apply to flatten these rows.')
  if (apply && totals.errors > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
