export type Theme = 'light' | 'dark'

let currentTheme: Theme = 'light'

export function getCurrentTheme(): Theme {
  return currentTheme
}

export function setTheme(theme: Theme) {
  currentTheme = theme
  document.documentElement.dataset.theme = theme
}

export function initTheme() {
  // Detect VS Code theme from body classes before React renders (prevents FOUC)
  const isDark = document.body.classList.contains('vscode-dark')
    || document.body.classList.contains('vscode-high-contrast')
  setTheme(isDark ? 'dark' : 'light')
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'theme.update') {
      setTheme(e.data.theme || 'light')
    }
  })
}
