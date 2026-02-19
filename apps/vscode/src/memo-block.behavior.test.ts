import { describe, expect, it } from 'vitest'
import { shouldDeleteEmptyMemoOnSave } from '../webview/extensions/MemoBlock'

describe('MemoBlock empty-save behavior', () => {
  it('deletes empty memo only on Enter save', () => {
    expect(shouldDeleteEmptyMemoOnSave('', 'enter')).toBe(true)
    expect(shouldDeleteEmptyMemoOnSave('   ', 'enter')).toBe(true)
  })

  it('does not delete empty memo on blur save', () => {
    expect(shouldDeleteEmptyMemoOnSave('', 'blur')).toBe(false)
    expect(shouldDeleteEmptyMemoOnSave('   ', 'blur')).toBe(false)
  })

  it('never deletes non-empty memo', () => {
    expect(shouldDeleteEmptyMemoOnSave('note', 'enter')).toBe(false)
    expect(shouldDeleteEmptyMemoOnSave('note', 'blur')).toBe(false)
  })
})
