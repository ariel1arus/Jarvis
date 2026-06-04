import { config } from 'dotenv'

// Load .env.test so integration tests point at jarvis_test (port 5433), not jarvis_db.
config({ path: '.env.test', override: true })
