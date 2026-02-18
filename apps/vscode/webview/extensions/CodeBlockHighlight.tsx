import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'
import { useMemo, useState } from 'react'
import { vscode } from '../lib/vscode-api'

const lowlight = createLowlight(common)

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderNode(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return escapeHtml(node.value || '')
  if (node.type !== 'element') {
    return (node.children || []).map(renderNode).join('')
  }

  const classNames = node.properties?.className
  const classAttr = Array.isArray(classNames) && classNames.length > 0
    ? ` class="${classNames.map((c: string) => escapeHtml(c)).join(' ')}"`
    : ''

  const children = (node.children || []).map(renderNode).join('')
  return `<${node.tagName}${classAttr}>${children}</${node.tagName}>`
}

function CodeBlockView({ node }: any) {
  const [copied, setCopied] = useState(false)
  const language = node.attrs.language || 'plaintext'
  const code = node.textContent || ''

  const highlightedHtml = useMemo(() => {
    try {
      const tree = lowlight.highlight(language, code)
      return (tree.children || []).map(renderNode).join('')
    } catch {
      return escapeHtml(code)
    }
  }, [language, code])

  const handleCopy = () => {
    vscode.postMessage({ type: 'clipboard.copy', text: code })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <NodeViewWrapper className="code-block-wrapper relative my-4">
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        <button
          className="code-block-copy"
          onClick={handleCopy}
          contentEditable={false}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="code-block-pre" spellCheck={false}>
        <code
          className={`hljs language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </NodeViewWrapper>
  )
}

const CodeBlockHighlight = CodeBlockLowlight
  .extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView)
    },
  })
  .configure({
    lowlight,
    defaultLanguage: 'plaintext',
  })

export default CodeBlockHighlight
