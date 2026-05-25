import { execSync } from 'node:child_process'
import { log } from './config.js'
import { config } from './config.js'
import { tick } from './orchestrator.js'

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000') // 5 min default
const ONCE = process.argv.includes('--once')

function mainHasChanged(): boolean {
  try {
    execSync('git fetch origin main', { cwd: config.repoPath, stdio: 'pipe', timeout: 15_000 })
    const local = execSync('git rev-parse main', { cwd: config.repoPath, stdio: 'pipe' }).toString().trim()
    const remote = execSync('git rev-parse origin/main', { cwd: config.repoPath, stdio: 'pipe' }).toString().trim()
    return local !== remote
  } catch {
    return false
  }
}

async function run() {
  await tick()
  if (ONCE) return

  log.info({ intervalMs: POLL_INTERVAL_MS }, 'polling mode — next tick scheduled')
  setInterval(async () => {
    try {
      if (mainHasChanged()) {
        log.info('main branch updated — exiting for restart')
        process.exit(0)
      }
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
