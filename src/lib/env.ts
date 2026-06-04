import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Jarvis'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_TELEMETRY_DISABLED: z.string().optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
  throw new Error(`Missing required environment variables: ${missing}`)
}

export const env = parsed.data
