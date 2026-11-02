import { lazy, Suspense, useEffect, useState } from 'react'
import { currentPath, onRouteChange } from './lib/route'
import Home from './components/home/Home'

const App = lazy(() => import('./App'))

export default function Root() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => onRouteChange(() => setPath(currentPath())), [])

  if (path === '/plan') {
    return (
      <Suspense fallback={<div className="h-full bg-background" />}>
        <App />
      </Suspense>
    )
  }
  return <Home />
}
