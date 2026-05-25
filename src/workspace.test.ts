import { describe, it, expect } from 'vitest'
import { sanitize } from './workspace.js'

describe('sanitize', () => {
  it('keeps alphanumeric, dots, hyphens, underscores', () => {
    expect(sanitize('ENG-12')).toBe('ENG-12')
  })

  it('replaces special characters with underscore', () => {
    expect(sanitize('feature/new thing')).toBe('feature_new_thing')
  })

  it('handles empty string', () => {
    expect(sanitize('')).toBe('')
  })
})
