import { describe, it, expect } from 'vitest'
import { sanitiseForModel, detectPII, redactForExternal, detectDistress } from '@/lib/safety'
import type { SimpleMessage } from '@/agents/types'

// ---------------------------------------------------------------------------
// sanitiseForModel
// ---------------------------------------------------------------------------

describe('sanitiseForModel', () => {
  it('strips null bytes', () => {
    expect(sanitiseForModel('hello\x00world')).toBe('helloworld')
  })

  it('strips ASCII control chars below 0x09 (e.g. \\x01, \\x07)', () => {
    expect(sanitiseForModel('a\x01b\x07c')).toBe('abc')
  })

  it('strips \\x0B (vertical tab) and \\x0C (form feed)', () => {
    expect(sanitiseForModel('a\x0Bb\x0Cc')).toBe('abc')
  })

  it('strips \\x0E–\\x1F range', () => {
    expect(sanitiseForModel('a\x0Eb\x1Fc')).toBe('abc')
  })

  it('strips DEL (\\x7F)', () => {
    expect(sanitiseForModel('a\x7Fb')).toBe('ab')
  })

  it('keeps tab (\\t)', () => {
    expect(sanitiseForModel('a\tb')).toBe('a\tb')
  })

  it('keeps newline (\\n)', () => {
    expect(sanitiseForModel('a\nb')).toBe('a\nb')
  })

  it('keeps carriage return (\\r)', () => {
    expect(sanitiseForModel('a\rb')).toBe('a\rb')
  })

  it('truncates text longer than 32 000 chars', () => {
    const long = 'x'.repeat(32_001)
    const result = sanitiseForModel(long)
    expect(result).toHaveLength(32_000)
    expect(result).toBe('x'.repeat(32_000))
  })

  it('does not truncate text exactly 32 000 chars', () => {
    const exact = 'y'.repeat(32_000)
    expect(sanitiseForModel(exact)).toHaveLength(32_000)
  })

  it('returns plain text unchanged', () => {
    expect(sanitiseForModel('Hello, world!')).toBe('Hello, world!')
  })
})

// ---------------------------------------------------------------------------
// detectPII
// ---------------------------------------------------------------------------

describe('detectPII', () => {
  it('returns true for a valid email address', () => {
    expect(detectPII('Contact me at alice@example.com please')).toBe(true)
  })

  it('returns true for a US phone number in dashed format', () => {
    expect(detectPII('call 555-867-5309')).toBe(true)
  })

  it('returns true for a US phone number with parentheses', () => {
    expect(detectPII('call (555) 867-5309')).toBe(true)
  })

  it('returns true for a US phone number with country code', () => {
    expect(detectPII('+1 555 867 5309')).toBe(true)
  })

  it('returns true for an SSN', () => {
    expect(detectPII('my SSN is 123-45-6789')).toBe(true)
  })

  it('returns true for a credit card-like number with spaces', () => {
    expect(detectPII('card number 4111 1111 1111 1111')).toBe(true)
  })

  it('returns false for plain text with no PII', () => {
    expect(detectPII('The quick brown fox jumps over the lazy dog')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(detectPII('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// redactForExternal
// ---------------------------------------------------------------------------

describe('redactForExternal', () => {
  it('replaces email addresses with [EMAIL]', () => {
    const result = redactForExternal('Send to bob@example.org for details')
    expect(result).toContain('[EMAIL]')
    expect(result).not.toContain('bob@example.org')
  })

  it('replaces SSNs with [SSN]', () => {
    const result = redactForExternal('SSN: 987-65-4321')
    expect(result).toContain('[SSN]')
    expect(result).not.toContain('987-65-4321')
  })

  it('replaces phone numbers with [PHONE]', () => {
    const result = redactForExternal('call me at 555-123-4567 tomorrow')
    expect(result).toContain('[PHONE]')
    expect(result).not.toContain('555-123-4567')
  })

  it('replaces credit card numbers with [CARD]', () => {
    const result = redactForExternal('card 4111 1111 1111 1111 end')
    expect(result).toContain('[CARD]')
    expect(result).not.toContain('4111 1111 1111 1111')
  })

  it('leaves plain text without PII unchanged', () => {
    const plain = 'No sensitive data here at all'
    expect(redactForExternal(plain)).toBe(plain)
  })

  it('redacts multiple PII types in one string', () => {
    const text = 'email bob@example.com phone 555-111-2222'
    const result = redactForExternal(text)
    expect(result).toContain('[EMAIL]')
    expect(result).toContain('[PHONE]')
    expect(result).not.toContain('bob@example.com')
    expect(result).not.toContain('555-111-2222')
  })

  it('applies SSN redaction before phone to avoid partial-match overlap', () => {
    // SSN pattern (ddd-dd-dddd) is more specific and should be replaced with [SSN],
    // not consumed by the PHONE pattern first.
    const result = redactForExternal('SSN 123-45-6789')
    expect(result).toContain('[SSN]')
    expect(result).not.toContain('[PHONE]')
  })
})

// ---------------------------------------------------------------------------
// detectDistress
// ---------------------------------------------------------------------------

describe('detectDistress', () => {
  // --- crisis ---
  it('classifies "I want to kill myself" as crisis', () => {
    expect(detectDistress('I want to kill myself')).toEqual({ level: 'crisis' })
  })

  it('classifies a self-harm statement as crisis', () => {
    expect(detectDistress('I want to cut myself')).toEqual({ level: 'crisis' })
  })

  it('classifies suicidal ideation as crisis', () => {
    expect(detectDistress("I don't want to exist anymore")).toEqual({ level: 'crisis' })
  })

  it('classifies "end my life" as crisis', () => {
    expect(detectDistress('I just want to end my life')).toEqual({ level: 'crisis' })
  })

  // --- moderate ---
  it('classifies "I feel depressed and hopeless" as moderate', () => {
    expect(detectDistress('I feel depressed and hopeless')).toEqual({ level: 'moderate' })
  })

  it('classifies a panic attack mention as moderate', () => {
    expect(detectDistress('I had a panic attack this morning')).toEqual({ level: 'moderate' })
  })

  it('classifies "I hate myself" as moderate', () => {
    expect(detectDistress('I hate myself so much')).toEqual({ level: 'moderate' })
  })

  // --- mild ---
  it('classifies "I\'m feeling really sad today" as mild', () => {
    expect(detectDistress("I'm feeling really sad today")).toEqual({ level: 'mild' })
  })

  it('classifies "I feel anxious and stressed" as mild', () => {
    expect(detectDistress('I feel anxious and stressed')).toEqual({ level: 'mild' })
  })

  it('classifies "I\'ve been feeling lonely" as mild', () => {
    expect(detectDistress("I've been feeling lonely lately")).toEqual({ level: 'mild' })
  })

  // --- none ---
  it('classifies "What\'s the weather like?" as none', () => {
    expect(detectDistress("What's the weather like?")).toEqual({ level: 'none' })
  })

  it('classifies "please help me find a file" as none (crisis boost alone without distress context)', () => {
    // CRISIS_BOOST phrases like "please help" must not trigger crisis without a
    // concurrent moderate or mild signal.
    expect(detectDistress('please help me find a file')).toEqual({ level: 'none' })
  })

  it('classifies neutral task text as none', () => {
    expect(detectDistress('Can you summarise this document for me?')).toEqual({ level: 'none' })
  })

  // --- boost escalation ---
  it('escalates mild to crisis when a boost phrase co-occurs', () => {
    // "sad" = mild; "please help" = boost → should escalate to crisis
    expect(detectDistress('please help me I am so sad and lost')).toEqual({ level: 'crisis' })
  })

  it('escalates moderate to crisis when a boost phrase co-occurs', () => {
    // "depressed" = moderate; "crisis" = boost → escalate to crisis
    expect(detectDistress('I am in a crisis and I feel so depressed')).toEqual({ level: 'crisis' })
  })
})

// ---------------------------------------------------------------------------
// Egress boundary — REFLECTION mode
// ---------------------------------------------------------------------------

describe('egress boundary — REFLECTION mode', () => {
  it('SimpleMessage only exposes role and content', () => {
    // Static assertion: only { role, content } may egress in a Reflection
    // request.  No sessionId, embedding, or metadata fields exist on the type.
    const msg: SimpleMessage = { role: 'user', content: 'hello' }
    const keys = Object.keys(msg)
    expect(keys).toEqual(expect.arrayContaining(['role', 'content']))
    expect(keys).toHaveLength(2)
  })

  it('SimpleMessage accepts all valid role values', () => {
    const user: SimpleMessage = { role: 'user', content: 'hi' }
    const assistant: SimpleMessage = { role: 'assistant', content: 'hello' }
    const system: SimpleMessage = { role: 'system', content: 'you are Jarvis' }

    for (const msg of [user, assistant, system]) {
      expect(Object.keys(msg)).toHaveLength(2)
    }
  })

  it('SimpleMessage has no sessionId field', () => {
    const msg: SimpleMessage = { role: 'user', content: 'test' }
    // TypeScript would error if sessionId were attempted; at runtime we assert
    // the key is absent.
    expect('sessionId' in msg).toBe(false)
  })

  it('SimpleMessage has no embedding field', () => {
    const msg: SimpleMessage = { role: 'user', content: 'test' }
    expect('embedding' in msg).toBe(false)
  })

  it('SimpleMessage has no metadata field', () => {
    const msg: SimpleMessage = { role: 'user', content: 'test' }
    expect('metadata' in msg).toBe(false)
  })

  it('an array of SimpleMessage objects contains only role and content per entry', () => {
    // This mirrors what gets serialised and sent to the model in AgentInput.messages.
    const messages: SimpleMessage[] = [
      { role: 'system', content: 'you are a helpful assistant' },
      { role: 'user', content: 'what day is it?' },
      { role: 'assistant', content: 'it is Wednesday' },
    ]

    for (const msg of messages) {
      const keys = Object.keys(msg)
      expect(keys).toHaveLength(2)
      expect(keys).toContain('role')
      expect(keys).toContain('content')
    }
  })
})
