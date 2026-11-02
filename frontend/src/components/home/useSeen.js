import { useEffect, useRef, useState } from 'react'

// Starts the flaps only when the board comes into view.
export function useSeen(threshold = 0.25) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          watcher.disconnect()
        }
      },
      { threshold },
    )
    watcher.observe(node)
    return () => watcher.disconnect()
  }, [threshold])
  return [ref, seen]
}
