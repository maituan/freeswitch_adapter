import config from './config'

export async function proxyCall(body: any) {
  const res = await fetch(`${config.bridgeUrl}/api/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Bridge /api/call failed (${res.status})`)
  }
  return data
}

export async function proxyCampaignCreate(formData: FormData) {
  const res = await fetch(`${config.bridgeUrl}/api/campaign`, {
    method: 'POST',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Bridge /api/campaign failed (${res.status})`)
  }
  return data
}

export async function proxyCampaignGet(query: string) {
  const url = `${config.bridgeUrl}/api/campaign${query ? `?${query}` : ''}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Bridge /api/campaign failed (${res.status})`)
  }
  return data
}

