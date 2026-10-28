import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AvatarsProvider } from './avatars'
import { ThemeProvider } from './theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AvatarsProvider>
        <App />
      </AvatarsProvider>
    </ThemeProvider>
  </StrictMode>,
)
