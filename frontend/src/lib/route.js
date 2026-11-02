const EVENT = 'travelust-route'
export const THREAD_KEY = 'travelust-thread'
const OLD_THREAD_KEY = 'travel-lust-thread'

// Keeps a trip that was saved under the old name.
try {
  const old = localStorage.getItem(OLD_THREAD_KEY)
  if (old) {
    if (!localStorage.getItem(THREAD_KEY)) localStorage.setItem(THREAD_KEY, old)
    localStorage.removeItem(OLD_THREAD_KEY)
  }
} catch {
  // Private windows can block storage. There is then nothing saved to keep.
}

export function currentPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

export function onRouteChange(listener) {
  window.addEventListener('popstate', listener)
  window.addEventListener(EVENT, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(EVENT, listener)
  }
}

export function navigate(path, state = null) {
  window.history.pushState(state, '', path)
  window.scrollTo(0, 0)
  window.dispatchEvent(new Event(EVENT))
}

export function hasSavedTrip() {
  try {
    return Boolean(localStorage.getItem(THREAD_KEY))
  } catch {
    return false
  }
}

// Reads the waiting prompt once, so a reload does not send it again.
export function takePrompt() {
  const prompt = window.history.state?.prompt
  if (prompt) window.history.replaceState(null, '', window.location.pathname)
  return prompt ?? null
}

// A new example replaces the saved trip, the same as the New trip button.
export function startTrip(prompt) {
  try {
    localStorage.removeItem(THREAD_KEY)
  } catch {
    // Private windows can block storage. There is then no saved trip to clear.
  }
  navigate('/plan', { prompt })
}
