import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AvatarsProvider } from './avatars'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AvatarsProvider>
      <App />
    </AvatarsProvider>
  </StrictMode>,
)
