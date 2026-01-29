import { describe, it, expect } from 'vitest'
import { parseCondition, stringifyCondition, ConditionParseError } from './parser.js'

describe('parseCondition', () => {
  describe('simple conditions', () => {
    it('parses plan condition', () => {
      const result = parseCondition('plan:pro')
      expect(result).toEqual({
        type: 'simple',
        category: 'plan',
        value: 'pro',
      })
    })

    it('parses permission condition', () => {
      const result = parseCondition('permission:data:export')
      expect(result).toEqual({
        type: 'simple',
        category: 'permission',
        value: 'data:export',
      })
    })

    it('parses state condition', () => {
      const result = parseCondition('state:has_data')
      expect(result).toEqual({
        type: 'simple',
        category: 'state',
        value: 'has_data',
      })
    })

    it('parses flag condition', () => {
      const result = parseCondition('flag:new_feature')
      expect(result).toEqual({
        type: 'simple',
        category: 'flag',
        value: 'new_feature',
      })
    })
  })

  describe('AND conditions', () => {
    it('parses and with two conditions', () => {
      const result = parseCondition('and:[plan:pro,permission:admin]')
      expect(result).toEqual({
        type: 'and',
        conditions: [
          { type: 'simple', category: 'plan', value: 'pro' },
          { type: 'simple', category: 'permission', value: 'admin' },
        ],
      })
    })

    it('parses and with three conditions', () => {
      const result = parseCondition('and:[plan:pro,permission:admin,state:active]')
      expect(result.type).toBe('and')
      expect((result as any).conditions).toHaveLength(3)
    })
  })

  describe('OR conditions', () => {
    it('parses or with two conditions', () => {
      const result = parseCondition('or:[plan:pro,plan:enterprise]')
      expect(result).toEqual({
        type: 'or',
        conditions: [
          { type: 'simple', category: 'plan', value: 'pro' },
          { type: 'simple', category: 'plan', value: 'enterprise' },
        ],
      })
    })
  })

  describe('nested conditions', () => {
    it('parses nested and/or', () => {
      const result = parseCondition('and:[or:[plan:pro,plan:enterprise],permission:data:export]')
      expect(result.type).toBe('and')
      const conditions = (result as any).conditions
      expect(conditions[0].type).toBe('or')
      expect(conditions[1].type).toBe('simple')
    })
  })

  describe('error handling', () => {
    it('throws on empty string', () => {
      expect(() => parseCondition('')).toThrow(ConditionParseError)
    })

    it('throws on invalid category', () => {
      expect(() => parseCondition('invalid:value')).toThrow(ConditionParseError)
    })

    it('throws on missing value', () => {
      expect(() => parseCondition('plan:')).toThrow(ConditionParseError)
    })

    it('throws on malformed and', () => {
      expect(() => parseCondition('and:[plan:pro')).toThrow(ConditionParseError)
    })
  })
})

describe('stringifyCondition', () => {
  it('stringifies simple condition', () => {
    const result = stringifyCondition({ type: 'simple', category: 'plan', value: 'pro' })
    expect(result).toBe('plan:pro')
  })

  it('stringifies and condition', () => {
    const result = stringifyCondition({
      type: 'and',
      conditions: [
        { type: 'simple', category: 'plan', value: 'pro' },
        { type: 'simple', category: 'permission', value: 'admin' },
      ],
    })
    expect(result).toBe('and:[plan:pro,permission:admin]')
  })

  it('roundtrips correctly', () => {
    const original = 'and:[or:[plan:pro,plan:enterprise],permission:data:export]'
    const parsed = parseCondition(original)
    const stringified = stringifyCondition(parsed)
    expect(stringified).toBe(original)
  })
})
