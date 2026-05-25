import { log } from './config.js'
import { tick } from './orchestrator.js'

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000') // 5 min default
const ONCE = process.argv.includes('--once')

async function run() {
  await tick()
  if (ONCE) return

  log.info({ intervalMs: POLL_INTERVAL_MS }, 'polling mode — next tick scheduled')
  setInterval(async () => {
    try {
      await tick()
    } catch (err) {
      log.error(err, 'tick failed')
    }
  }, POLL_INTERVAL_MS)
}

run().catch((err) => {
  log.error(err, 'tick failed')
  process.exit(1)
})
