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
      fontSize: {
        '2xs': ['10px', '12px'],
        xs: ['11px', '14px'],
        sm: ['12px', '16px'],
        base: ['13px', '18px'],
        lg: ['15px', '22px'],
      },
      animation: {
        'bounce-press': 'bouncePress 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
      },
      keyframes: {
        bouncePress: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1.02)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
