import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WyndbaseProvider } from '@wyndbase/sdk/react'
import { WyndbaseDevtools } from '@wyndbase/sdk/devtools'
import './index.css'
import App from './App.tsx'
import { wyndbase } from './wyndbase'

// useSdk() and the provider carry exactly this client's type, plugins included.
declare module '@wyndbase/sdk/react' {
  interface Register {
    sdk: typeof wyndbase
  }
}

// WyndbaseProvider hands the SDK's own TanStack QueryClient to useQuery/useMutation below it, so
// the app and the SDK share one cache. The devtools (Queries, Realtime, Session tabs) render only
// in development builds; the default entry is a no-op in production.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WyndbaseProvider sdk={wyndbase}>
      <App />
      <WyndbaseDevtools client={wyndbase.queryClient} sdk={wyndbase} />
    </WyndbaseProvider>
  </StrictMode>,
)
