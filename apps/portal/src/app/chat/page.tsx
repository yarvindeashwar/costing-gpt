'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    
    // Add user message
    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    
    try {
      // Send to API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: [...messages, userMessage]
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        // Check if it's a configuration error
        if (data.isConfigError) {
          throw new Error(data.content || 'Configuration error')
        } else {
          throw new Error('Failed to get response')
        }
      }
      
      // Add assistant message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content,
        id: data.id
      }])
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      
      // Check if it's a configuration error
      if (errorMessage.includes('Missing environment variables')) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ ${errorMessage}`
        }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again later.'
        }])
      }
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <Card className="h-[calc(100vh-120px)] flex flex-col">
        <CardHeader>
          <CardTitle>Costing GPT Assistant</CardTitle>
          <CardDescription>
            Ask about hotel rates and get the best prices for your travel needs
          </CardDescription>
        </CardHeader>
        
        <CardContent className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <p className="mb-4">No messages yet</p>
                <p className="text-sm max-w-md">
                  Try asking about hotel rates in a specific city, for example:
                  &quot;What&apos;s the best rate for a 5-star hotel in Mumbai from June 10 to June 15 for 2 people?&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div 
                    key={index} 
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <Avatar className={`h-8 w-8 ${message.role === 'user' ? 'bg-primary' : 'bg-muted'}`}>
                        <span className="text-xs">
                          {message.role === 'user' ? 'U' : 'AI'}
                        </span>
                      </Avatar>
                      <div 
                        className={`rounded-lg px-4 py-2 ${
                          message.role === 'user' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>
        </CardContent>
        
        <CardFooter className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex w-full gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-grow"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  )
}
