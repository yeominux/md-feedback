import React from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { Bot, ChevronDown } from 'lucide-react'

export const ReviewResponseBlock = Node.create({
  name: 'reviewResponseBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: false,

  addAttributes() {
    return {
      responseTo: { default: '' },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-review-response]',
      getAttrs: (el) => {
        const element = el as HTMLElement
        return {
          responseTo: element.getAttribute('data-response-to') || '',
        }
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-review-response': '',
      'data-response-to': HTMLAttributes.responseTo,
    }), 0]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`<!-- REVIEW_RESPONSE to="${node.attrs.responseTo}" -->\n`)
          state.renderContent(node)
          state.ensureNewLine()
          state.write(`<!-- /REVIEW_RESPONSE -->`)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReviewResponseBlockView)
  },
})

function ReviewResponseBlockView({ node }: any) {
  const [collapsed, setCollapsed] = React.useState(false)

  return (
    <NodeViewWrapper
      className="ai-response-card my-2"
      data-review-response=""
      data-response-to={node.attrs.responseTo}
    >
      <div
        className="flex items-center justify-between px-3 pt-2 pb-1 select-none cursor-pointer"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-1.5">
          <Bot size={12} style={{ color: 'var(--mf-ai-response-label)' }} />
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            color: 'var(--mf-ai-response-label)',
          }}>
            AI Response
          </span>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: 'var(--mf-text-faint)',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        />
      </div>
      {!collapsed && (
        <NodeViewContent className="px-3 pb-2" />
      )}
    </NodeViewWrapper>
  )
}
