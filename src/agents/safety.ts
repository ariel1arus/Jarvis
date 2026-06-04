import { detectDistress, type DistressLevel } from '@/lib/safety'

/**
 * Result of a pre-model safety check.
 *
 * When `safe` is false the caller must NOT call the model — it should deliver
 * `responseOverride` to the user instead.
 */
export type SafetyCheckResult =
  | { safe: true }
  | { safe: false; level: DistressLevel; responseOverride: string }

const MODERATE_RESPONSE =
  "It sounds like you're going through something really hard. I'm here with you. " +
  'I want to help you think things through — and I also want to gently remind you ' +
  'that talking to a real person, whether a friend, counselor, or therapist, can ' +
  'make a real difference. Would you like to explore what\'s weighing on you?'

const CRISIS_RESPONSE =
  "I can hear that you're in a really painful place right now. You don't have to " +
  'face this alone. Please reach out to a crisis helpline — in the US you can text ' +
  'or call 988 (Suicide & Crisis Lifeline), or text HOME to 741741. If you\'re in ' +
  "immediate danger, please call emergency services. I'm here, and I care about " +
  'what happens to you.'

/**
 * Pre-model safety gate for Reflection mode.
 *
 * - `none` / `mild`  -> safe; the Reflection prompt handles these gently.
 * - `moderate`       -> intercept with a warm nudge toward human support.
 * - `crisis`         -> intercept with concrete crisis resources.
 */
export function reflectionSafetyCheck(lastUserMessage: string): SafetyCheckResult {
  const { level } = detectDistress(lastUserMessage)

  switch (level) {
    case 'moderate':
      return { safe: false, level, responseOverride: MODERATE_RESPONSE }
    case 'crisis':
      return { safe: false, level, responseOverride: CRISIS_RESPONSE }
    case 'none':
    case 'mild':
    default:
      return { safe: true }
  }
}
