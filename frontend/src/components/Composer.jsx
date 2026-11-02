import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

export default forwardRef(function Composer({ onSend, disabled, placeholder, autoFocus }, ref) {
  const [text, setText] = useState('')
  const input = useRef(null)

  useImperativeHandle(ref, () => ({
    prefill(value) {
      setText(value)
      setTimeout(() => {
        input.current?.focus()
        input.current?.setSelectionRange(value.length, value.length)
      }, 0)
    },
  }))

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    setText('')
    onSend(value)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Card className="flex-row items-end gap-2 p-2 transition-colors focus-within:border-subtle">
        <Textarea
          ref={input}
          rows={1}
          value={text}
          autoFocus={autoFocus}
          aria-label="Message"
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          className="max-h-32 min-h-8 flex-1 resize-none border-0 bg-transparent px-2 py-1 text-[15px] shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
        />
        <Button type="submit" size="icon-sm" disabled={disabled || !text.trim()} aria-label="Send">
          <ArrowUp />
        </Button>
      </Card>
    </form>
  )
})
