// Registry of document types that live under /dashboard/documents.
//
// SOPs and contracts share most of their lifecycle (editor, versions,
// translation, history, portal embedding) but persist in separate tables
// because contracts carry employee/wage/hours fields SOPs don't need.
// This file is the single place that knows the mapping from a type id
// to its table, edit-route, and human label. New doc types in later
// phases (hiring forms, offer letters, policies) plug in here.

export const DOCUMENT_TYPES = ['sop', 'contract', 'job_description', 'letter', 'nda'] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value)
}

/**
 * The Supabase table that backs each doc type. Used by callers that need
 * to query both kinds (e.g. the unified Documents index page) without
 * hard-coding the table name at every call site.
 */
export function tableForType(type: DocumentType): 'sops' | 'contracts' | 'job_descriptions' | 'letters' | 'ndas' {
  if (type === 'sop') return 'sops'
  if (type === 'contract') return 'contracts'
  if (type === 'letter') return 'letters'
  if (type === 'nda') return 'ndas'
  return 'job_descriptions'
}

/**
 * Canonical edit-page path for a document. Centralized so future doc
 * types only need to extend this function, not chase 30 navigate()
 * call sites. Job descriptions are an exception — their editor lives
 * under /dashboard/hiring/jds/... because the workflow context for
 * authoring them comes from the hiring section. The Documents page
 * tab still routes here via this helper.
 */
export function documentEditPath(type: DocumentType, id: string): string {
  if (type === 'job_description') return `/dashboard/hiring/jds/${id}/edit`
  return `/dashboard/documents/${type}/${id}/edit`
}

/**
 * Canonical version-history path for a document.
 */
export function documentHistoryPath(type: DocumentType, id: string): string {
  return `/dashboard/documents/${type}/${id}/history`
}

/**
 * Edit path for a document *template* (Phase G.1). Templates live in
 * the typed `document_templates` table, distinct from the per-type
 * concrete-document tables — they have their own slim editor.
 */
export function documentTemplateEditPath(id: string): string {
  return `/dashboard/document-templates/${id}/edit`
}

/**
 * Canonical index path, optionally pre-filtered to a type. Pass no
 * argument to land on the default Documents tab.
 */
export function documentsIndexPath(type?: DocumentType): string {
  return type
    ? `/dashboard/documents?type=${type}`
    : '/dashboard/documents'
}
