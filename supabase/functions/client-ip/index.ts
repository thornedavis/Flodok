import { corsHeaders, jsonResponse } from '../_shared/auth.ts'

function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (cf || xff || req.headers.get('x-real-ip') || '').trim()
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  return jsonResponse({ ip: clientIp(req) })
})
