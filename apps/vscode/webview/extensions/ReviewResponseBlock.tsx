import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { Bot } from 'lucide-react'

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

  addNodeView() {
    return ReactNodeViewRenderer(ReviewResponseBlockView)
  },
})

function ReviewResponseBlockView({ node }: any) {
  return (
    <NodeViewWrapper
      className="my-2 rounded-md border-l-4 border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/20"
      data-review-response=""
      data-response-to={node.attrs.responseTo}
    >
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 select-none">
        <Bot size={12} />
        <span>AI Response</span>
      </div>
      <NodeViewContent className="px-3 pb-2" />
    </NodeViewWrapper>
  )
}
