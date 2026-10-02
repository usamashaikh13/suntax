'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, X, Send, Loader2, Bot, User, Sparkles, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  suggestions?: string[]
}

interface Props {
  taxReturnId: string
  initialPrompt?: string | null
  onClearInitialPrompt?: () => void
  onNavigateTab?: (tab: string) => void
}

const DEFAULT_SUGGESTIONS = [
  'How do I submit my tax return to the tax office?',
  'What deductions can I claim in this canton?',
  'What is my maximum Pillar 3a allowance?',
  'Check if my return is ready for submission',
]

export function TaxAssistant({
  taxReturnId,
  initialPrompt,
  onClearInitialPrompt,
  onNavigateTab,
}: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hello! I am your SunTax AI Copilot. I am here to guide you through completing, verifying, and officially submitting your Swiss income tax return. How can I help you today?',
      suggestions: DEFAULT_SUGGESTIONS,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // Handle external prompts (e.g. clicked from AI Guide card)
  useEffect(() => {
    if (initialPrompt) {
      setOpen(true)
      send(initialPrompt)
      if (onClearInitialPrompt) onClearInitialPrompt()
    }
  }, [initialPrompt])

  const send = async (text?: string) => {
    const message = text || input.trim()
    if (!message || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: message }])
    setLoading(true)

    try {
      const response = await api.aiAssistant.sendMessage(taxReturnId, message)
      const replyText = response.response || response.message || 'I reviewed your request.'

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: replyText,
          suggestions: response.suggestions && response.suggestions.length > 0 ? response.suggestions : undefined,
        },
      ])

      // If backend suggested a next step and callback exists
      if (response.next_step && onNavigateTab && (message.toLowerCase().includes('jump') || message.toLowerCase().includes('go to'))) {
        onNavigateTab(response.next_step)
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an issue connecting to the tax advisor engine. Please try again.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 shadow-xl z-50 group flex items-center justify-center transition-all duration-300 hover:scale-105"
        size="icon"
        title="Open AI Tax Copilot"
      >
        <MessageCircle className="h-6 w-6 text-white" />
        <span className="sr-only">Open AI Tax Copilot</span>
        {/* Glow indicator */}
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border-2 border-white"></span>
        </span>
      </Button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 w-[92vw] sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          style={{ height: '580px', maxHeight: '82vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-red-600 to-red-700 text-white shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-white/10 backdrop-blur-sm">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">SunTax AI Copilot</span>
                  <Badge variant="outline" className="text-[10px] bg-white/20 text-white border-none py-0 px-1.5">
                    Filing Guide
                  </Badge>
                </div>
                <p className="text-[11px] text-red-100">Step-by-step assistance for Swiss ITR</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gray-50/40">
            {messages.map((msg, i) => (
              <div key={i} className="space-y-2">
                <div
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs shadow-xs
                      ${msg.role === 'assistant' ? 'bg-red-600' : 'bg-gray-800'}`}
                  >
                    {msg.role === 'assistant' ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs whitespace-pre-line
                      ${msg.role === 'assistant'
                        ? 'bg-white text-gray-800 border border-gray-200/80'
                        : 'bg-red-600 text-white font-normal'}`}
                  >
                    {msg.content}
                  </div>
                </div>

                {/* Suggestions chips attached to message */}
                {msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 && (
                  <div className="pl-9 pt-1 flex flex-wrap gap-1.5">
                    {msg.suggestions.map((suggestion, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => send(suggestion)}
                        className="text-[11px] text-red-700 bg-red-50 hover:bg-red-100/90 border border-red-200/90 rounded-full px-2.5 py-1 text-left transition-colors flex items-center gap-1"
                      >
                        <span>{suggestion}</span>
                        <ChevronRight className="h-3 w-3 opacity-60 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 items-center">
                <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white text-xs">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl px-3.5 py-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                  <span className="text-xs text-gray-500">Checking Swiss tax rules &amp; your return...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick prompts bar if only greeting */}
          {messages.length === 1 && (
            <div className="px-3 pb-2 pt-1 bg-white border-t border-gray-100 flex flex-wrap gap-1">
              {DEFAULT_SUGGESTIONS.slice(0, 2).map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => send(q)}
                  className="text-[11px] bg-red-50 text-red-700 hover:bg-red-100 rounded-full px-2.5 py-1 transition-colors border border-red-100"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask anything about filing or deductions..."
              className="flex-1 border border-gray-300 rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-gray-50/50"
            />
            <Button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-9 w-9 p-0 flex items-center justify-center shadow-xs"
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
