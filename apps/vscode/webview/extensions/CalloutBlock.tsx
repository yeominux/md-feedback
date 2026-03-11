import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const CalloutExtension = Extension.create({
  name: 'callout',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('callout'),
        props: {
          decorations(state) {
            const { doc } = state
            const decorations: Decoration[] = []

            doc.descendants((node, pos) => {
              if (node.type.name !== 'blockquote') {
                return
              }

              const firstChild = node.firstChild
              if (!firstChild || firstChild.type.name !== 'paragraph') {
                return
              }

              const text = firstChild.textContent
              if (!text) return

              const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)
              if (match) {
                const type = match[1].toLowerCase()
                
                // Decorate the blockquote
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    'data-callout': type,
                    class: 'callout-block',
                  })
                )

                // Decorate the [!TYPE] text to hide it
                // We assume the text is at the start of the paragraph
                // pos is blockquote start
                // pos + 1 is paragraph start
                // pos + 2 is text start (usually)
                const startPos = pos + 2
                const endPos = startPos + match[0].length
                
                decorations.push(
                  Decoration.inline(startPos, endPos, {
                    class: 'hidden-callout-type',
                  })
                )
              }
            })

            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

export default CalloutExtension
