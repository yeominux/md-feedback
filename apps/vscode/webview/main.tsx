import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './theme/tokens.css'
import './theme/hljs-tokens.css'
import { initTheme } from './theme/theme'
import './index.css'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
