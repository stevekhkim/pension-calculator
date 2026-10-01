import { describe, expect, it } from 'vitest'
import { estimateNationalPension, proportionalConstant, type NationalEstimateInput } from './national'
import { PARAMS } from './params'

const NOW = { year: 2026, month: 1 }
const A = PARAMS.nationalA

const input = (over: Partial<NationalEstimateInput> = {}): NationalEstimateInput => ({
  birthYear: 1986,
  birthMonth: 1,
  pastMonths: 0,
  pastIncome: 0,
  futureIncome: A,
  contributionEndAge: 60,
  ...over,
})

describe('국민연금 직접 계산', () => {
  it('비례상수', () => {
    expect(proportionalConstant(1995)).toBe(2.4)
    expect(proportionalConstant(2005)).toBe(1.8)
    expect(proportionalConstant(2008)).toBe(1.5)
    expect(proportionalConstant(2025)).toBeCloseTo(1.245)
    expect(proportionalConstant(2026)).toBe(1.29)
  })

  it('평균소득자 20년 가입 → A값의 21.5%', () => {
    const r = estimateNationalPension(input(), NOW)
    expect(r.futureMonths).toBe(240)
    expect(r.averageIncome).toBe(A)
    expect(r.monthly).toBeCloseTo(0.215 * A)
  })

  it('평균소득자 40년 가입 → 소득대체율 43%', () => {
    const r = estimateNationalPension(input({ birthYear: 2006 }), NOW)
    expect(r.totalMonths).toBe(480)
    expect(r.monthly).toBeCloseTo(0.43 * A)
  })

  it('과거 가입기간은 연도별 비례상수 적용 (2016~2025년)', () => {
    const r = estimateNationalPension(input({ pastMonths: 120, pastIncome: A, futureIncome: 0 }), NOW)
    expect(r.futureMonths).toBe(0)
    const avg = (1.38 + 1.245) / 2
    expect(r.monthly).toBeCloseTo((avg * 2 * A * 120) / 240 / 12)
  })

  it('1998년 이전 가입분은 2.4 × (A + 0.75B)', () => {
    const r = estimateNationalPension(
      input({ birthYear: 1960, pastMonths: 12 * 38, pastIncome: A, futureIncome: 0 }),
      NOW,
    )
    // 1988~2025년, 1988~1998년 11년분
    const pre = (11 * 12 * 2.4 * 1.75 * A) / 240
    expect(r.monthly).toBeGreaterThan(pre / 12)
  })

  it('가입기간 10년 미만이면 연금 없음', () => {
    const r = estimateNationalPension(input({ birthYear: 1971, futureIncome: A }), NOW)
    expect(r.totalMonths).toBe(60)
    expect(r.eligible).toBe(false)
    expect(r.monthly).toBe(0)
  })

  it('기준소득월액 상·하한 적용, 가입 가능 기간 제한', () => {
    expect(estimateNationalPension(input({ futureIncome: 20_000_000 }), NOW).averageIncome).toBe(PARAMS.incomeCap)
    expect(estimateNationalPension(input({ futureIncome: 100_000 }), NOW).averageIncome).toBe(PARAMS.incomeFloor)
    // 1986년생은 2004년부터 가입 가능 → 과거 최대 22년
    expect(estimateNationalPension(input({ pastMonths: 600, pastIncome: A }), NOW).pastMonths).toBe(22 * 12)
  })
})
