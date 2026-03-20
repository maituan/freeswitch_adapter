/**
 * Langfuse telemetry helper.
 *
 * All exports are no-ops when LANGFUSE_ENABLED !== 'true'.
 * Set the following env vars to enable:
 *
 *   LANGFUSE_ENABLED=true
 *   LANGFUSE_PUBLIC_KEY=pk-lf-...
 *   LANGFUSE_SECRET_KEY=sk-lf-...
 *   LANGFUSE_BASE_URL=http://localhost:3001   # self-hosted; omit for cloud
 */

const ENABLED = process.env.LANGFUSE_ENABLED === 'true'

// Lazy-import so the module is not even required when disabled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _lf: any = null

function getLangfuse(): any {
  if (!ENABLED) return null
  if (_lf) return _lf
  // Require at runtime so missing package only errors when actually enabled.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Langfuse } = require('langfuse') as typeof import('langfuse')
  _lf = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY ?? '',
    secretKey: process.env.LANGFUSE_SECRET_KEY ?? '',
    baseUrl: process.env.LANGFUSE_BASE_URL ?? 'http://localhost:3001',
    // Flush after each event so data arrives even on abrupt process exit.
    flushAt: 1,
    flushInterval: 1000,
  })
  _lf.on?.('error', (err: any) => {
    console.error('[langfuse] client error:', err?.message ?? err)
  })
  return _lf
}

/**
 * Create a Langfuse trace representing a single phone call.
 * Returns null when Langfuse is disabled.
 */
export function createCallTrace(callId: string, scenario: string, phone: string): any {
  const lf = getLangfuse()
  if (!lf) return null
  return lf.trace({
    id: callId,
    name: `call:${scenario}`,
    userId: phone,
    metadata: { scenario, phone, callId },
  })
}

/**
 * Flush all pending Langfuse events. Call this at the end of a session.
 */
export async function flushTelemetry(): Promise<void> {
  if (_lf) await (_lf as any).flushAsync().catch(() => {})
}
