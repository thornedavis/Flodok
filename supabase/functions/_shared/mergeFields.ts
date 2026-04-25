// Deno port of src/lib/mergeFields.ts — used by edge functions that need to
// render merge fields server-side (the snapshot helper, mainly). Kept as a
// separate file because edge functions can't import from the Vite source
// tree, and the client version has UI-only metadata (picker labels) that the
// server doesn't need.
//
// IMPORTANT: This must stay token-compatible with src/lib/mergeFields.ts.
// If you add a new field there, add it here too — otherwise server-rendered
// snapshots will leave the new token un-substituted while the live editor
// renders it cleanly.

export type Lang = 'en' | 'id';

// Loose shapes — we only depend on the fields we actually read. Keeps this
// module independent of the generated Database types.
export type EmployeeShape = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  ktp_nik?: string | null;
  date_of_birth?: string | null;
  departments?: string[] | null;
  department?: string | null;
};

export type OrganizationShape = {
  name?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
};

export type ContractShape = {
  created_at?: string | null;
  base_wage_idr?: number | null;
  allowance_idr?: number | null;
  hours_per_day?: number | null;
  days_per_week?: number | null;
};

export type MergeContext = {
  employee?: EmployeeShape | null;
  organization?: OrganizationShape | null;
  contract?: ContractShape | null;
  today?: Date;
  lang?: Lang;
};

// ─── Formatters (kept identical to client mergeFields.ts) ──────────────────

function formatIdr(value: number | null | undefined, lang: Lang): string {
  if (value == null) return '—';
  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  return `Rp ${Math.round(value).toLocaleString(locale)}`;
}

function formatDateString(value: string | Date | null | undefined, lang: Lang): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function joinAddress(org: OrganizationShape): string | null {
  const parts = [
    org.address_street,
    org.address_city,
    org.address_province,
    org.address_postal_code,
    org.address_country,
  ].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(', ') : null;
}

function joinDepartments(emp: EmployeeShape): string | null {
  const list = emp.departments && emp.departments.length > 0
    ? emp.departments
    : emp.department
      ? [emp.department]
      : [];
  return list.length > 0 ? list.join(', ') : null;
}

// Placeholder labels for un-resolvable fields. Mirrors the client labels —
// we only need the lowercased English form since the placeholder is the
// fallback ("[employee phone]") regardless of doc language.
const PLACEHOLDER_LABEL: Record<string, string> = {
  employee_name: 'employee name',
  employee_phone: 'employee phone',
  employee_email: 'employee email',
  employee_address: 'employee address',
  employee_ktp_nik: 'employee ktp / nik',
  employee_date_of_birth: 'employee date of birth',
  employee_departments: 'employee departments',
  org_name: 'organization name',
  org_address: 'organization address',
  today: "today's date",
  contract_start_date: 'contract start date',
  base_wage_idr: 'base wage',
  allowance_idr: 'allowance',
  hours_per_day: 'hours per day',
  days_per_week: 'days per week',
};

const PLACEHOLDER_LABEL_ID: Record<string, string> = {
  employee_name: 'nama karyawan',
  employee_phone: 'telepon karyawan',
  employee_email: 'email karyawan',
  employee_address: 'alamat karyawan',
  employee_ktp_nik: 'ktp / nik karyawan',
  employee_date_of_birth: 'tanggal lahir karyawan',
  employee_departments: 'departemen karyawan',
  org_name: 'nama organisasi',
  org_address: 'alamat organisasi',
  today: 'tanggal hari ini',
  contract_start_date: 'tanggal mulai kontrak',
  base_wage_idr: 'gaji pokok',
  allowance_idr: 'tunjangan',
  hours_per_day: 'jam per hari',
  days_per_week: 'hari per minggu',
};

const RESOLVERS: Record<string, (ctx: MergeContext) => string | null> = {
  employee_name: ctx => ctx.employee?.name ?? null,
  employee_phone: ctx => ctx.employee?.phone ?? null,
  employee_email: ctx => ctx.employee?.email ?? null,
  employee_address: ctx => ctx.employee?.address ?? null,
  employee_ktp_nik: ctx => ctx.employee?.ktp_nik ?? null,
  employee_date_of_birth: ctx => formatDateString(ctx.employee?.date_of_birth, ctx.lang ?? 'en'),
  employee_departments: ctx => ctx.employee ? joinDepartments(ctx.employee) : null,
  org_name: ctx => ctx.organization?.name ?? null,
  org_address: ctx => ctx.organization ? joinAddress(ctx.organization) : null,
  today: ctx => formatDateString(ctx.today ?? new Date(), ctx.lang ?? 'en'),
  contract_start_date: ctx => formatDateString(ctx.contract?.created_at, ctx.lang ?? 'en'),
  base_wage_idr: ctx => ctx.contract?.base_wage_idr == null ? null : formatIdr(ctx.contract.base_wage_idr, ctx.lang ?? 'en'),
  allowance_idr: ctx => ctx.contract?.allowance_idr == null ? null : formatIdr(ctx.contract.allowance_idr, ctx.lang ?? 'en'),
  hours_per_day: ctx => ctx.contract?.hours_per_day?.toString() ?? null,
  days_per_week: ctx => ctx.contract?.days_per_week?.toString() ?? null,
};

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function renderMergeFields(template: string, ctx: MergeContext): string {
  return template.replace(TOKEN_RE, (match, rawKey: string) => {
    const resolver = RESOLVERS[rawKey];
    if (!resolver) return match; // unknown token → leave as-is
    const resolved = resolver(ctx);
    if (resolved !== null && resolved !== '') return resolved;
    const labels = ctx.lang === 'id' ? PLACEHOLDER_LABEL_ID : PLACEHOLDER_LABEL;
    return `[${labels[rawKey] ?? rawKey}]`;
  });
}
