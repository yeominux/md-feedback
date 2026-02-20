import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'
import { getCurrentTheme } from '../theme/theme'

const LIGHT_THEME_VARS = {
  primaryColor: '#e8e5df',
  primaryTextColor: '#37352f',
  primaryBorderColor: '#d3d1cb',
  lineColor: '#9b9a97',
  secondaryColor: '#f1f0ec',
  tertiaryColor: '#faf9f6',
  fontFamily: 'var(--vscode-font-family)',
  fontSize: '14px',
}

const DARK_THEME_VARS = {
  primaryColor: '#3a3a3a',
  primaryTextColor: '#e0e0e0',
  primaryBorderColor: '#555',
  lineColor: '#888',
  secondaryColor: '#2d2d2d',
  tertiaryColor: '#333',
  fontFamily: 'var(--vscode-font-family)',
  fontSize: '14px',
}

export const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      content: { default: '' },
    }
  },

  parseHTML() {
    return [{
      tag: 'pre',
      preserveWhitespace: 'full',
      priority: 100, // Higher priority than standard codeBlock
      getAttrs: (el) => {
        const element = el as HTMLElement
        const code = element.querySelector('code')
        // Only match mermaid code blocks
        if (code?.classList.contains('language-mermaid')) {
          return { content: code.textContent || '' }
        }
        return false // Don't match non-mermaid code blocks
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes), ['code', { class: 'language-mermaid' }, HTMLAttributes.content]]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView)
  },
})

function MermaidBlockView({ node }: any) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const renderDiagram = async () => {
      if (!node.attrs.content) return

      try {
        setLoading(true)
        setError('')

        // Lazy-load mermaid
        const { default: mermaid } = await import('mermaid')

        if (cancelled) return

        const theme = getCurrentTheme()
        mermaid.initialize({
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: theme === 'dark' ? DARK_THEME_VARS : LIGHT_THEME_VARS,
          startOnLoad: false,
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        })

        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
        const result = await mermaid.render(id, node.attrs.content)
        const svgContent = typeof result === 'string' ? result : result.svg

        if (!cancelled) {
          setSvg(svgContent)
          setLoading(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Mermaid rendering error:', err)
          setError(err.message || 'Failed to render diagram')
          setLoading(false)
        }
      }
    }

    renderDiagram()

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      renderDiagram()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [node.attrs.content])

  return (
    <NodeViewWrapper className="my-4" data-drag-handle>
      <div className="relative rounded-md border border-mf-border bg-mf-surface overflow-hidden">
        {/* Header / Label */}
        <div className="px-3 py-1.5 bg-mf-bg border-b border-mf-border flex items-center gap-2">
          <span className="text-[11px] font-semibold text-mf-muted uppercase tracking-wider">Mermaid</span>
        </div>

        <div className="p-4 overflow-x-auto flex justify-center min-h-[100px] items-center" style={{ background: 'var(--mf-surface)' }}>
          {loading && (
            <div className="flex flex-col items-center gap-2 text-mf-muted animate-pulse">
              <div className="w-6 h-6 border-2 border-mf-border border-t-mf-link rounded-full animate-spin" />
              <span className="text-xs">Rendering diagram...</span>
            </div>
          )}

          {error && (
            <div className="w-full p-3 rounded text-sm" style={{
              background: 'var(--mf-callout-warning-bg)',
              borderWidth: 1, borderStyle: 'solid',
              borderColor: 'var(--mf-callout-warning-border)',
              color: 'var(--mf-text)',
            }}>
              <p className="font-medium mb-1">Failed to render diagram</p>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono opacity-80">{error}</pre>
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--mf-callout-warning-border)', opacity: 0.5 }}>
                <p className="text-xs text-mf-muted">Source:</p>
                <pre className="text-xs font-mono mt-1" style={{ color: 'var(--mf-text-muted)', opacity: 0.8 }}>{node.attrs.content}</pre>
              </div>
            </div>
          )}

          {!loading && !error && svg && (
            <div
              className="mermaid-svg-container w-full flex justify-center"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export default MermaidBlock
