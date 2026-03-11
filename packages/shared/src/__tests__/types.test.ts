import { describe, it, expect } from 'vitest'
import { HIGHLIGHT_COLORS, HEX_TO_COLOR_NAME, colorToType } from '../index'

describe('types — Constants and Utilities', () => {
  it('HIGHLIGHT_COLORS has correct keys and values', () => {
    expect(HIGHLIGHT_COLORS).toEqual({
      yellow: '#fef08a',
      red: '#fca5a5',
      blue: '#93c5fd',
    })
  })

  it('HEX_TO_COLOR_NAME maps hex values back to color names', () => {
    expect(HEX_TO_COLOR_NAME['#fef08a']).toBe('yellow')
    expect(HEX_TO_COLOR_NAME['#fca5a5']).toBe('red')
    expect(HEX_TO_COLOR_NAME['#93c5fd']).toBe('blue')
  })

  it('colorToType maps red to fix', () => {
    expect(colorToType('red')).toBe('fix')
  })

  it('colorToType maps blue to question', () => {
    expect(colorToType('blue')).toBe('question')
  })

  it('colorToType maps yellow to highlight', () => {
    expect(colorToType('yellow')).toBe('highlight')
  })
})
