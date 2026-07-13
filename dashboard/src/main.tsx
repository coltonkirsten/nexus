import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNexusToken } from './api/nexusToken'

// Fetch the Nexus access token from the hub (cookie-authed via the dashboard's
// Google session) BEFORE the first render, so every API/WS/SSE call the app
// makes on mount already carries it. Never rejects; on failure API calls 401
// and the UI shows an unauthenticated state.
initNexusToken().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
