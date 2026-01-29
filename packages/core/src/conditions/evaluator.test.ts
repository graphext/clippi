import { describe, it, expect } from 'vitest'
import { evaluateCondition, checkCondition } from './evaluator.js'
import type { UserContext } from '../types/conditions.js'

describe('evaluateCondition', () => {
  describe('plan conditions', () => {
    it('allows when plan matches', () => {
      const context: UserContext = { plan: 'pro' }
      const result = evaluateCondition('plan:pro', context)
      expect(result.allowed).toBe(true)
    })

    it('blocks when plan does not match', () => {
      const context: UserContext = { plan: 'free' }
      const result = evaluateCondition('plan:pro', context)
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('plan')
      expect(result.missing).toBe('pro')
    })
  })

  describe('permission conditions', () => {
    it('allows when permission exists', () => {
      const context: UserContext = { permissions: ['data:export', 'admin'] }
      const result = evaluateCondition('permission:data:export', context)
      expect(result.allowed).toBe(true)
    })

    it('blocks when permission missing', () => {
      const context: UserContext = { permissions: ['read'] }
      const result = evaluateCondition('permission:data:export', context)
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('permission')
    })
  })

  describe('state conditions', () => {
    it('allows when state is truthy', () => {
      const context: UserContext = { state: { has_data: true } }
      const result = evaluateCondition('state:has_data', context)
      expect(result.allowed).toBe(true)
    })

    it('blocks when state is falsy', () => {
      const context: UserContext = { state: { has_data: false } }
      const result = evaluateCondition('state:has_data', context)
      expect(result.allowed).toBe(false)
    })
  })

  describe('flag conditions', () => {
    it('allows when flag is enabled', () => {
      const context: UserContext = { flags: { new_feature: true } }
      const result = evaluateCondition('flag:new_feature', context)
      expect(result.allowed).toBe(true)
    })

    it('blocks when flag is disabled', () => {
      const context: UserContext = { flags: { new_feature: false } }
      const result = evaluateCondition('flag:new_feature', context)
      expect(result.allowed).toBe(false)
    })
  })

  describe('AND conditions', () => {
    it('allows when all conditions pass', () => {
      const context: UserContext = {
        plan: 'pro',
        permissions: ['admin'],
      }
      const result = evaluateCondition('and:[plan:pro,permission:admin]', context)
      expect(result.allowed).toBe(true)
    })

    it('blocks when any condition fails', () => {
      const context: UserContext = {
        plan: 'pro',
        permissions: [],
      }
      const result = evaluateCondition('and:[plan:pro,permission:admin]', context)
      expect(result.allowed).toBe(false)
    })
  })

  describe('OR conditions', () => {
    it('allows when any condition passes', () => {
      const context: UserContext = { plan: 'enterprise' }
      const result = evaluateCondition('or:[plan:pro,plan:enterprise]', context)
      expect(result.allowed).toBe(true)
    })

    it('blocks when all conditions fail', () => {
      const context: UserContext = { plan: 'free' }
      const result = evaluateCondition('or:[plan:pro,plan:enterprise]', context)
      expect(result.allowed).toBe(false)
    })
  })

  describe('empty/no condition', () => {
    it('allows with empty string', () => {
      const result = evaluateCondition('', {})
      expect(result.allowed).toBe(true)
    })
  })
})

describe('checkCondition', () => {
  it('returns boolean', () => {
    expect(checkCondition('plan:pro', { plan: 'pro' })).toBe(true)
    expect(checkCondition('plan:pro', { plan: 'free' })).toBe(false)
  })
})
