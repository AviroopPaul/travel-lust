export class RateLimited extends Error {}

export async function loadThread(threadId) {
  const res = await fetch(`/api/threads/${threadId}`)
  return res.ok ? res.json() : null
}

// Server-sent events over POST, which EventSource cannot do.
export async function sendTurn(body, onEvent) {
  const res = await fetch('/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 429) {
    const { detail } = await res.json()
    throw new RateLimited(detail)
  }
  if (!res.ok || !res.body) throw new Error(`Server replied ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let end
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const event = raw.match(/^event: (.*)$/m)?.[1]
      const data = raw.match(/^data: (.*)$/m)?.[1]
      if (event && data) onEvent(event, JSON.parse(data))
    }
  }
}
