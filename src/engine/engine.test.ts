import { describe, expect, it } from 'vitest'
import { calculate, simulateAccount, type AccountInput, type Inputs } from './simulate'
import {
  nationalPensionTax,
  pensionIncomeDeduction,
  privatePensionRate,
  progressiveTax,
  retirementIncomeTax,
} from './tax'

const NOW = { year: 2026, month: 1 }

const account = (over: Partial<AccountInput> = {}): AccountInput => ({
  enabled: true,
  balance: 0,
  monthlyContribution: 0,
  contributionGrowth: 0,
  contributionEndAge: 60,
  accumReturn: 0,
  startAge: 60,
  payoutYears: 10,
  payoutReturn: 0,
  ...over,
})

const inputs = (over: Partial<Inputs> = {}): Inputs => ({
  birthYear: 1986,
  birthMonth: 1,
  inflation: 0,
  payoutMode: 'real',
  personal: { ...account({ enabled: false }), taxType: 'deductible' },
  national: { enabled: false, monthlyAmount: 0, startAge: 65 },
  dc: { ...account({ enabled: false }), joinYear: 2016 },
  ...over,
})

describe('세금', () => {
  it('기본세율', () => {
    expect(progressiveTax(14_000_000)).toBeCloseTo(840_000)
    expect(progressiveTax(39_400_000)).toBeCloseTo(840_000 + 25_400_000 * 0.15)
    expect(progressiveTax(100_000_000)).toBeCloseTo(840_000 + 5_400_000 + 9_120_000 + 4_200_000)
  })

  it('연금소득공제', () => {
    expect(pensionIncomeDeduction(3_000_000)).toBe(3_000_000)
    expect(pensionIncomeDeduction(12_000_000)).toBeCloseTo(5_900_000)
    expect(pensionIncomeDeduction(24_000_000)).toBeCloseTo(7_300_000)
    expect(pensionIncomeDeduction(100_000_000)).toBe(9_000_000)
  })

  it('국민연금 세금: 연 1,200만원 → 과표 460만원', () => {
    // (460만 × 6% − 7만) × 1.1
    expect(nationalPensionTax(12_000_000)).toBeCloseTo((276_000 - 70_000) * 1.1)
    expect(nationalPensionTax(6_000_000)).toBe(0)
  })

  it('퇴직소득세: 1억원, 근속 10년', () => {
    // 환산급여 1억200만 → 공제 6,260만 → 과표 3,940만 → 465만 × 10/12
    expect(retirementIncomeTax(100_000_000, 10)).toBeCloseTo(3_875_000 * 1.1)
    expect(retirementIncomeTax(10_000_000, 10)).toBe(0)
  })

  it('사적연금 세율', () => {
    expect(privatePensionRate(60, 12_000_000)).toBe(0.055)
    expect(privatePensionRate(70, 12_000_000)).toBe(0.044)
    expect(privatePensionRate(80, 12_000_000)).toBe(0.033)
    expect(privatePensionRate(60, 15_000_001)).toBe(0.165)
  })
})

describe('계좌 시뮬레이션', () => {
  it('수익률 0%면 잔액을 기간으로 나눈 금액', () => {
    const sim = simulateAccount(account({ balance: 120_000_000 }), 60 * 12, 41 * 12, 0, 'real')
    expect(sim.payouts[0]).toBeCloseTo(1_000_000)
    expect(sim.payouts[119]).toBeCloseTo(1_000_000)
    expect(sim.payouts[120]).toBe(0)
  })

  it('적립: 월 100만원 × 120개월', () => {
    const sim = simulateAccount(
      account({ monthlyContribution: 1_000_000 }),
      50 * 12,
      51 * 12,
      0,
      'real',
    )
    expect(sim.startBalance).toBeCloseTo(120_000_000)
  })

  it('수령 기간이 끝나면 잔액이 0', () => {
    for (const mode of ['real', 'level'] as const) {
      const a = account({ balance: 300_000_000, payoutYears: 20, payoutReturn: 0.04 })
      const sim = simulateAccount(a, 60 * 12, 41 * 12, 0.02, mode)
      const r = Math.pow(1.04, 1 / 12) - 1
      let balance = sim.startBalance
      for (let k = 0; k < 240; k++) balance = (balance - sim.payouts[k]) * (1 + r)
      expect(Math.abs(balance)).toBeLessThan(1)
    }
  })

  it('구매력 유지 방식은 12개월마다 물가만큼 증액', () => {
    const a = account({ balance: 300_000_000, payoutYears: 20, payoutReturn: 0.04 })
    const sim = simulateAccount(a, 60 * 12, 41 * 12, 0.02, 'real')
    expect(sim.payouts[11]).toBeCloseTo(sim.payouts[0])
    expect(sim.payouts[12]).toBeCloseTo(sim.payouts[0] * 1.02)
  })
})

describe('통합 계산', () => {
  it('개인연금: 세액공제형 5.5%', () => {
    const r = calculate(
      inputs({
        personal: { ...account({ balance: 120_000_000 }), taxType: 'deductible' },
      }),
      NOW,
    )
    const row = r.rows.find((x) => x.age === 60)!
    expect(row.total.grossReal).toBeCloseTo(1_000_000)
    expect(row.total.netReal).toBeCloseTo(945_000)
    expect(r.rows.length).toBe(10)
  })

  it('개인연금: 연 1,500만원 초과 시 종합과세와 16.5% 중 유리한 쪽, 비과세형은 0', () => {
    const big = account({ balance: 240_000_000 })
    const taxed = calculate(inputs({ personal: { ...big, taxType: 'deductible' } }), NOW)
    // 연 2,400만원, 다른 소득 없음 → 종합과세(과표 1,520만원)가 유리
    const comprehensive = (840_000 + 1_200_000 * 0.15 - 70_000) * 1.1
    expect(taxed.rows[0].total.netReal).toBeCloseTo(2_000_000 - comprehensive / 12)

    // 연 2.4억원이면 16.5% 분리과세가 유리
    const huge = account({ balance: 2_400_000_000 })
    const flat = calculate(inputs({ personal: { ...huge, taxType: 'deductible' } }), NOW)
    expect(flat.rows[0].total.netReal).toBeCloseTo(20_000_000 * 0.835)

    const exempt = calculate(inputs({ personal: { ...big, taxType: 'exempt' } }), NOW)
    expect(exempt.rows[0].total.netReal).toBeCloseTo(2_000_000)
  })

  it('국민연금: 조기 30% 감액, 연기 36% 증액, 물가 연동', () => {
    const base = { enabled: true, monthlyAmount: 1_000_000 }
    const early = calculate(inputs({ national: { ...base, startAge: 60 } }), NOW)
    expect(early.national!.adjustment).toBeCloseTo(0.7)
    expect(early.rows[0].age).toBe(60)
    const late = calculate(inputs({ national: { ...base, startAge: 70 } }), NOW)
    expect(late.rows[0].total.grossReal).toBeCloseTo(1_360_000)

    const normal = calculate(inputs({ inflation: 0.02, national: { ...base, startAge: 65 } }), NOW)
    const row = normal.rows[0]
    expect(row.age).toBe(65)
    expect(row.total.grossReal).toBeCloseTo(1_000_000)
    expect(row.total.grossNominal).toBeGreaterThan(1_000_000 * Math.pow(1.02, 25))
    expect(row.total.netReal).toBeCloseTo(1_000_000 - ((276_000 - 70_000) * 1.1) / 12)
  })

  it('DC: 이연퇴직소득은 퇴직소득세 실효세율의 70% → 60%', () => {
    // 40세, 2016년 입사, 60세 퇴직(근속 30년), 현재 적립금 3억, 수익률 0
    const r = calculate(
      inputs({ dc: { ...account({ balance: 300_000_000, payoutYears: 20 }), joinYear: 2016 } }),
      NOW,
    )
    expect(r.dc!.serviceYears).toBe(30)
    const rate = retirementIncomeTax(300_000_000, 30) / 300_000_000
    expect(r.dc!.retirementTaxRate).toBeCloseTo(rate)
    const monthly = 300_000_000 / 240
    expect(r.rows[0].total.netReal).toBeCloseTo(monthly * (1 - rate * 0.7))
    expect(r.rows[10].total.netReal).toBeCloseTo(monthly * (1 - rate * 0.6))
  })

  it('구간 요약과 대표값', () => {
    const r = calculate(
      inputs({
        personal: { ...account({ balance: 120_000_000, startAge: 55, contributionEndAge: 55 }), taxType: 'deductible' },
        national: { enabled: true, monthlyAmount: 1_000_000, startAge: 65 },
      }),
      NOW,
    )
    expect(r.phases.map((p) => [p.fromAge, p.toAge, p.active])).toEqual([
      [55, 64, ['personal']],
      [65, 100, ['national']],
    ])
    expect(r.headline!.age).toBe(65)
  })
})
