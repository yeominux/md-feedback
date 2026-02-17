import { useState, useRef, useCallback, useEffect } from 'react'
import Editor, { type EditorHandle } from './components/Editor'
import { vscode } from './lib/vscode-api'
import { type Checkpoint } from '@md-feedback/shared'
import { FileText, X, Unplug } from 'lucide-react'

export default function App() {
  const editorRef = useRef<EditorHandle>(null)
  const [docLoaded, setDocLoaded] = useState(false)
  const [filePath, setFilePath] = useState('')
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [lastCheckpointTime, setLastCheckpointTime] = useState<string | null>(null)
  const [docEmpty, setDocEmpty] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [statusSummary, setStatusSummary] = useState<{ openFixes: number; openQuestions: number; gateStatus: string | null } | null>(null)
  const [mcpSetupDone, setMcpSetupDone] = useState(true) // default true to avoid flash
  const [showMcpSetup, setShowMcpSetup] = useState(false)
  const [mcpTab, setMcpTab] = useState<'claude' | 'cursor' | 'other'>('claude')
  const [mcpCopied, setMcpCopied] = useState(false)

  const isLoadingRef = useRef(false)
  const debounceRef = useRef<number | undefined>(undefined)
  const firstAnnotationSentRef = useRef(false)

  // Listen for messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data
      switch (msg.type) {
        case 'document.load':
          // #10: Clear any pending debounce to prevent stale edits from overwriting loaded doc
          clearTimeout(debounceRef.current)
          debounceRef.current = undefined
          isLoadingRef.current = true
          if (editorRef.current) {
            editorRef.current.setMarkdown(msg.cleanContent || msg.content)
            // Reconstruct persisted highlight marks after content is set
            if (msg.highlightMarks?.length) {
              editorRef.current.applyHighlightMarks(msg.highlightMarks)
            }
            setDocLoaded(true)
            setDocEmpty(false)
            setFilePath(msg.filePath || '')
          }
          setTimeout(() => { isLoadingRef.current = false }, 150)
          // Request checkpoints after load
          vscode.postMessage({ type: 'checkpoint.list' })
          break

        case 'document.empty':
          setDocLoaded(false)
          setDocEmpty(true)
          break

        case 'onboarding.state':
          setOnboardingDone(msg.done)
          break

        case 'export.result':
          setExportStatus('Exported')
          setTimeout(() => setExportStatus(null), 3000)
          break

        case 'checkpoint.auto':
          setLastCheckpointTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
          break

        case 'checkpoint.created':
          setCheckpoints(msg.checkpoints || [])
          break

        case 'checkpoint.list':
          setCheckpoints(msg.checkpoints || [])
          break

        case 'checkpoint.request': {
          // Triggered by command palette — prompt for note
          const note = prompt('Checkpoint note:')
          if (note !== null) {
            vscode.postMessage({ type: 'checkpoint.create', note })
          }
          break
        }

        case 'export.request': {
          // Triggered by command palette or floating bar
          const target = msg.target as string
          if (!editorRef.current) break

          const highlights = editorRef.current.getHighlights()
          const docMemos = editorRef.current.getMemos()
          const sections = editorRef.current.getSections()
          const title = editorRef.current.getDocumentTitle()

          if (target === 'handoff') {
            vscode.postMessage({ type: 'handoff.generate', target: 'standalone' })
          } else if (target === 'generic') {
            vscode.postMessage({ type: 'export.generic', title, filePath, sections, highlights, docMemos })
          } else if (target === 'all') {
            vscode.postMessage({ type: 'export.all', title, filePath, sections, highlights, docMemos })
          } else {
            // claude-code, cursor, codex, copilot, cline, windsurf, roo-code, gemini
            vscode.postMessage({ type: 'export.context.generate', target, title, filePath, sections, highlights, docMemos })
          }
          setExportStatus('Exporting...')
          break
        }

        case 'export.saved': {
          setExportStatus(msg.message as string || 'Exported')
          setTimeout(() => setExportStatus(null), 4000)
          break
        }

        case 'handoff.result': {
          // Auto-save handoff result
          vscode.postMessage({
            type: 'export.context',
            content: msg.handoff as string,
            suggestedPath: 'HANDOFF.md',
          })
          setExportStatus('Handoff exported')
          setTimeout(() => setExportStatus(null), 4000)
          break
        }

        case 'status.summary':
          setStatusSummary(msg.summary as { openFixes: number; openQuestions: number; gateStatus: string | null })
          break

        case 'theme.update':
          document.documentElement.dataset.theme = msg.theme || 'light'
          break

        case 'mcp.state':
          setMcpSetupDone(!!msg.done)
          if (!msg.done) setShowMcpSetup(true)
          break

      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Tell extension we're ready
  useEffect(() => {
    vscode.postMessage({ type: 'webview.ready' })
  }, [])

  // Called when editor content changes (annotations)
  const handleUpdate = useCallback((annotatedMarkdown: string) => {
    if (isLoadingRef.current) return
    clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      // Merge annotation.first flag into document.edit to avoid race condition:
      // both are async, and annotation.first must not fire until the edit is applied.
      let firstAnnotation = false
      if (!firstAnnotationSentRef.current) {
        const hasAnnotations = annotatedMarkdown.includes('<!-- USER_MEMO')
        if (hasAnnotations) {
          firstAnnotation = true
          firstAnnotationSentRef.current = true
        }
      }

      vscode.postMessage({
        type: 'document.edit',
        content: annotatedMarkdown,
        firstAnnotation,
      })
    }, 800)
  }, [])

  const handleCopy = useCallback((text: string) => {
    vscode.postMessage({ type: 'clipboard.copy', text })
  }, [])

  const handleDismissOnboarding = () => {
    vscode.postMessage({ type: 'onboarding.dismiss' })
    setOnboardingDone(true)
  }

  const mcpConfigs: Record<string, { label: string; config: string }> = {
    claude: {
      label: 'Claude Code',
      config: `// Add to .mcp.json or claude_desktop_config.json
{
  "mcpServers": {
    "md-feedback": {
      "command": "npx",
      "args": ["-y", "md-feedback"]
    }
  }
}`,
    },
    cursor: {
      label: 'Cursor',
      config: `// Add to .cursor/mcp.json
{
  "mcpServers": {
    "md-feedback": {
      "command": "npx",
      "args": ["-y", "md-feedback"]
    }
  }
}`,
    },
    other: {
      label: 'Other',
      config: `// Add to your MCP client config
{
  "mcpServers": {
    "md-feedback": {
      "command": "npx",
      "args": ["-y", "md-feedback"]
    }
  }
}`,
    },
  }

  const handleMcpCopy = () => {
    vscode.postMessage({ type: 'clipboard.copy', text: mcpConfigs[mcpTab].config })
    setMcpCopied(true)
    setTimeout(() => setMcpCopied(false), 2000)
  }

  const handleMcpDone = () => {
    vscode.postMessage({ type: 'mcp.complete' })
    setMcpSetupDone(true)
    setShowMcpSetup(false)
  }

  const handleMcpSkip = () => {
    setShowMcpSetup(false)
    // Don't mark as done — show reminder in floating bar
  }

  return (
    <div className="md-feedback-root">
      {/* MCP Setup Screen — shown on first launch */}
      {showMcpSetup && !mcpSetupDone && docLoaded && (
        <div className="mcp-setup-overlay">
          <div className="mcp-setup-card">
            <div className="mcp-setup-step">MCP Setup</div>
            <h2 className="mcp-setup-title">Connect your AI agent</h2>
            <p className="mcp-setup-desc">
              Your AI agent reads annotations directly via MCP — no export step needed.
            </p>

            <div className="mcp-setup-tabs">
              {(Object.keys(mcpConfigs) as Array<'claude' | 'cursor' | 'other'>).map((tab) => (
                <button
                  key={tab}
                  className={`mcp-setup-tab ${mcpTab === tab ? 'mcp-setup-tab-active' : ''}`}
                  onClick={() => setMcpTab(tab)}
                >
                  {mcpConfigs[tab].label}
                </button>
              ))}
            </div>

            <div className="mcp-setup-config">
              <pre className="mcp-setup-code">{mcpConfigs[mcpTab].config}</pre>
              <button className="mcp-setup-copy" onClick={handleMcpCopy}>
                {mcpCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <ol className="mcp-setup-steps">
              <li>Copy the config above</li>
              <li>Paste into your AI tool's MCP settings</li>
              <li>Restart your AI tool</li>
            </ol>

            <div className="mcp-setup-actions">
              <button className="mcp-setup-done" onClick={handleMcpDone}>
                Done, I set it up
              </button>
              <button className="mcp-setup-skip" onClick={handleMcpSkip}>
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="content-area">
        {/* Onboarding Banner */}
        {docLoaded && !onboardingDone && (
          <div className="onboarding-banner">
            <div className="onboarding-content">
              <p>Select text, then click <strong>Highlight</strong>, <strong>Fix</strong>, or <strong>Question</strong> in the bubble menu</p>
            </div>
            <button onClick={handleDismissOnboarding} className="onboarding-close">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Editor */}
        <div className={docLoaded ? '' : 'hidden'}>
          <div className="paper-container">
            <div className="paper">
              <Editor
                ref={editorRef}
                onUpdate={handleUpdate}
                onSelectionChange={() => {}}
              />
            </div>
          </div>
        </div>

        {/* Placeholder */}
        {docEmpty && !docLoaded && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <FileText size={48} strokeWidth={1.5} style={{ color: 'var(--mf-text-faint)' }} />
            <p style={{ fontSize: 14, color: 'var(--mf-text-faint)' }}>Open a .md file to start reviewing</p>
          </div>
        )}

        {/* Loading state */}
        {!docLoaded && !docEmpty && (
          <div className="flex items-center justify-center min-h-screen">
            <p className="text-[14px] opacity-60">Loading document...</p>
          </div>
        )}
      </main>

      {/* Floating Status Bar — review progress only */}
      {docLoaded && statusSummary && (statusSummary.openFixes > 0 || statusSummary.openQuestions > 0 || statusSummary.gateStatus) && (
        <div className="floating-bar">
          <div className="status-indicator" title="Review progress">
            {statusSummary.gateStatus === 'done' ? (
              <span className="status-badge status-badge-approved">Approved</span>
            ) : statusSummary.gateStatus ? (
              <>
                <span className={`status-badge ${statusSummary.gateStatus === 'blocked' ? 'status-badge-blocked' : 'status-badge-proceed'}`}>
                  {statusSummary.gateStatus === 'blocked' ? 'Blocked' : 'Proceed'}
                </span>
                {(statusSummary.openFixes > 0 || statusSummary.openQuestions > 0) && (
                  <span className="status-detail">
                    {[
                      statusSummary.openFixes > 0 && `${statusSummary.openFixes} fix`,
                      statusSummary.openQuestions > 0 && `${statusSummary.openQuestions} Q`,
                    ].filter(Boolean).join(', ')} open
                  </span>
                )}
              </>
            ) : (
              <span className="status-detail">
                {[
                  statusSummary.openFixes > 0 && `${statusSummary.openFixes} fix`,
                  statusSummary.openQuestions > 0 && `${statusSummary.openQuestions} Q`,
                ].filter(Boolean).join(', ')} open
              </span>
            )}
          </div>
        </div>
      )}

      {/* MCP Reminder — for users who skipped setup */}
      {docLoaded && !mcpSetupDone && !showMcpSetup && (
        <div className="floating-bar" style={{ bottom: statusSummary ? 48 : 12 }}>
          <button
            onClick={() => setShowMcpSetup(true)}
            className="mcp-reminder-btn"
            title="Set up MCP for the best experience"
          >
            <Unplug size={14} />
            <span>Connect AI</span>
          </button>
        </div>
      )}

    </div>
  )
}
