/**
 * Safety and privacy helpers for Jarvis Private AI.
 *
 * Pure functions only — no I/O, no logging, no external imports.
 * These guard what reaches the LLM and what leaves the machine.
 */

const MAX_INPUT_CHARS = 32_000

// Allowed control chars: tab (\x09), newline (\x0A), carriage return (\x0D).
// Strip everything else in the C0 range plus DEL.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi
const PHONE = /\b(\+1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/gi
const SSN = /\b\d{3}-\d{2}-\d{4}\b/gi
const CARD = /\b(?:\d{4}[-\s]?){3}\d{4}\b/gi

/**
 * Clean raw text before it reaches the model:
 * - remove null bytes and unsafe control characters
 * - hard-cap length at 32 000 chars
 */
export function sanitiseForModel(text: string): string {
  const cleaned = text.replace(CONTROL_CHARS, '')
  return cleaned.length > MAX_INPUT_CHARS
    ? cleaned.slice(0, MAX_INPUT_CHARS)
    : cleaned
}

/** True if the text contains any recognised PII pattern. */
export function detectPII(text: string): boolean {
  // Build fresh, non-stateful copies to avoid lastIndex issues with /g.
  return (
    new RegExp(EMAIL.source, 'i').test(text) ||
    new RegExp(PHONE.source, 'i').test(text) ||
    new RegExp(SSN.source, 'i').test(text) ||
    new RegExp(CARD.source, 'i').test(text)
  )
}

/**
 * Redact PII before sending text to an external service.
 * Order matters: SSN before phone (SSN is the more specific pattern),
 * then email, then phone, then card.
 */
export function redactForExternal(text: string): string {
  return text
    .replace(new RegExp(SSN.source, 'gi'), '[SSN]')
    .replace(new RegExp(EMAIL.source, 'gi'), '[EMAIL]')
    .replace(new RegExp(PHONE.source, 'gi'), '[PHONE]')
    .replace(new RegExp(CARD.source, 'gi'), '[CARD]')
}

export type DistressLevel = 'none' | 'mild' | 'moderate' | 'crisis'

const CRISIS_PATTERNS: RegExp[] = [
  /\b(suicide|suicidal|kill myself|end my life|want to die|gonna die|going to die|don't want to be here anymore|don't want to exist)\b/i,
  /\b(self.?harm|cut myself|hurt myself)\b/i,
]

// Standalone "help me now" etc. only counts as crisis when distress context
// is also present, so it is treated as a booster rather than a trigger.
const CRISIS_BOOST = /\b(crisis|emergency|help me now|please help)\b/i

const MODERATE_PATTERNS: RegExp[] = [
  /\b(depressed|depression|hopeless|worthless|useless|no point|can't go on|can't cope|breaking down|falling apart)\b/i,
  /\b(panic attack|anxiety attack|overwhelmed|drowning)\b/i,
  /\b(hate myself|hate my life)\b/i,
]

const MILD_PATTERNS: RegExp[] = [
  /\b(sad|upset|anxious|worried|stressed|struggling|lonely|empty|numb|lost|confused|frustrated|angry)\b/i,
  /\b(not okay|not ok|bad day|rough day|exhausted|burnt out|burnout)\b/i,
]

/**
 * Classify emotional distress. Cascades crisis -> moderate -> mild -> none,
 * returning the first (most severe) level that matches.
 */
export function detectDistress(text: string): { level: DistressLevel } {
  if (CRISIS_PATTERNS.some((p) => p.test(text))) {
    return { level: 'crisis' }
  }

  const hasModerate = MODERATE_PATTERNS.some((p) => p.test(text))
  const hasMild = MILD_PATTERNS.some((p) => p.test(text))

  // A boost phrase ("emergency", "please help") combined with any other
  // distress signal escalates to crisis.
  if (CRISIS_BOOST.test(text) && (hasModerate || hasMild)) {
    return { level: 'crisis' }
  }

  if (hasModerate) return { level: 'moderate' }
  if (hasMild) return { level: 'mild' }
  return { level: 'none' }
}
