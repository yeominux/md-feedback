import { describe, expect, it } from 'vitest'
import { SharedJsonParseError, parseJsonStrict } from '../errors'

describe('shared errors', () => {
  it('parseJsonStrict throws SharedJsonParseError on invalid json', () => {
    expect(() => parseJsonStrict('{invalid}', 'test.context')).toThrow(SharedJsonParseError)
  })
})
