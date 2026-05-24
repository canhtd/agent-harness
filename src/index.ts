import { log } from './config.js'
import { tick } from './orchestrator.js'

tick().catch((err) => {
  log.error(err, 'tick failed')
  process.exit(1)
})
