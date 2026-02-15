import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'
import { useState } from 'react'
import { vscode } from '../lib/vscode-api'

const lowlight = createLowlight(common)

function CodeBlockView({ node, updateAttributes, extension }: any) {
  const [copied, setCopied] = useState(false)
  const language = node.attrs.language || 'plaintext'

  const handleCopy = () => {
    const code = node.textContent
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
        <NodeViewContent as="code" className={`language-${language}`} />
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
