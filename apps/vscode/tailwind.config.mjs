/** @type {import('tailwindcss').Config} */
export default {
  content: ['./webview/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--vscode-font-family)',
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"',
          'Roboto', 'sans-serif',
        ],
        mono: ['var(--vscode-editor-font-family)', 'monospace'],
      },
    },
  },
  plugins: [],
}
