import { PARAMS, nationalPensionNormalAge } from './params'
import {
  deferredRetirementFactor,
  nationalPensionTax,
  privatePensionRate,
  retirementIncomeTax,
} from './tax'

// 금액은 원, 비율은 소수(0.05 = 5%)
export type PayoutMode = 'real' | 'level'
export type SourceKey = 'national' | 'dc' | 'personal'
export const SOURCE_KEYS: SourceKey[] = ['national', 'dc', 'personal']

export interface AccountInput {
  enabled: boolean
  balance: number
  monthlyContribution: number
  contributionGrowth: number
  contributionEndAge: number
  accumReturn: number
  startAge: number
  payoutYears: number
  payoutReturn: number
}

export interface Inputs {
  birthYear: number
  birthMonth: number
  inflation: number
  payoutMode: PayoutMode
  personal: AccountInput & { taxType: 'deductible' | 'exempt' }
  national: { enabled: boolean; monthlyAmount: number; startAge: number }
  dc: AccountInput & { joinYear: number }
}

export interface Amounts {
  grossNominal: number
  netNominal: number
  grossReal: number
  netReal: number
}

export interface Row {
  age: number
  year: number
  sources: Record<SourceKey, Amounts>
  total: Amounts
}

export interface Phase {
  fromAge: number
  toAge: number
  active: SourceKey[]
  total: Amounts
}

export interface AccountInfo {
  startAge: number
  startBalanceNominal: number
  startBalanceReal: number
}

export type AccountKey = 'dc' | 'personal'

export interface Balance {
  nominal: number
  real: number
}

/** 나이별 연말(다음 생일 직전) 적립금 */
export interface BalanceRow {
  age: number
  year: number
  values: Record<AccountKey, Balance>
  total: Balance
}

export interface Result {
  rows: Row[]
  balanceNow: BalanceRow
  balances: BalanceRow[]
  phases: Phase[]
  headline: Row | null
  personal: AccountInfo | null
  dc: (AccountInfo & { serviceYears: number; retirementTaxRate: number }) | null
  national: { normalAge: number; startAge: number; adjustment: number } | null
}

const END_AGE = 100

const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1
const zero = (): Amounts => ({ grossNominal: 0, netNominal: 0, grossReal: 0, netReal: 0 })

interface AccountSim {
  payouts: Float64Array
  balances: Float64Array // 각 달 말 잔액
  retireM: number
  startM: number
  endM: number // 마지막 수령 다음 달
  retireBalance: number
  startBalance: number
}

export function simulateAccount(
  a: AccountInput,
  ageMonths0: number,
  months: number,
  inflation: number,
  mode: PayoutMode,
): AccountSim {
  const retireM = Math.max(0, a.contributionEndAge * 12 - ageMonths0)
  const startAge = Math.max(a.startAge, PARAMS.privatePensionMinAge)
  const startM = Math.max(retireM, startAge * 12 - ageMonths0)
  const rAccum = monthlyRate(a.accumReturn)
  const rPayout = monthlyRate(a.payoutReturn)

  const balances = new Float64Array(months)
  let balance = a.balance
  let retireBalance = balance
  for (let m = 0; m < startM; m++) {
    const contribution =
      m < retireM ? a.monthlyContribution * Math.pow(1 + a.contributionGrowth, Math.floor(m / 12)) : 0
    balance = balance * (1 + rAccum) + contribution
    if (m + 1 === retireM) retireBalance = balance
    if (m < months) balances[m] = balance
  }
  const startBalance = balance

  // 잔액이 수령 기간 말에 0이 되는 첫 수령액
  const n = Math.max(1, Math.round(a.payoutYears * 12))
  const step = (k: number) => (mode === 'real' ? Math.pow(1 + inflation, Math.floor(k / 12)) : 1)
  let pvFactor = 0
  for (let k = 0; k < n; k++) pvFactor += step(k) / Math.pow(1 + rPayout, k)
  const first = startBalance / pvFactor

  const payouts = new Float64Array(months)
  for (let k = 0; k < n && startM + k < months; k++) {
    payouts[startM + k] = first * step(k)
    // 월초 지급 후 남은 금액을 운용
    balance = Math.max(0, (balance - payouts[startM + k]) * (1 + rPayout))
    balances[startM + k] = balance
  }

  return { payouts, balances, retireM, startM, endM: startM + n, retireBalance, startBalance }
}

export function calculate(inputs: Inputs, now: { year: number; month: number }): Result {
  const ageMonths0 = (now.year - inputs.birthYear) * 12 + (now.month - inputs.birthMonth)
  const months = Math.max(0, (END_AGE + 1) * 12 - ageMonths0)
  const deflator = (m: number) => Math.pow(1 + inputs.inflation, m / 12)
  const ageAt = (m: number) => Math.floor((ageMonths0 + m) / 12)

  const personalSim = inputs.personal.enabled
    ? simulateAccount(inputs.personal, ageMonths0, months, inputs.inflation, inputs.payoutMode)
    : null
  const dcSim = inputs.dc.enabled
    ? simulateAccount(inputs.dc, ageMonths0, months, inputs.inflation, inputs.payoutMode)
    : null

  // 퇴직소득세 실효세율 (현재가치 기준 퇴직금에 현행 세법 적용)
  let serviceYears = 0
  let retirementTaxRate = 0
  if (dcSim) {
    const retireAbsMonth = now.year * 12 + (now.month - 1) + dcSim.retireM
    serviceYears = Math.max(1, Math.ceil((retireAbsMonth - inputs.dc.joinYear * 12) / 12))
    const realAmount = dcSim.retireBalance / deflator(dcSim.retireM)
    retirementTaxRate = realAmount > 0 ? retirementIncomeTax(realAmount, serviceYears) / realAmount : 0
  }

  // 국민연금
  const normalAge = nationalPensionNormalAge(inputs.birthYear)
  const shift = Math.max(
    -PARAMS.maxShiftMonths,
    Math.min(PARAMS.maxShiftMonths, Math.round((inputs.national.startAge - normalAge) * 12)),
  )
  const adjustment =
    shift < 0 ? 1 + shift * PARAMS.earlyReductionPerMonth : 1 + shift * PARAMS.deferralIncreasePerMonth
  const nationalStartM = Math.max(0, normalAge * 12 + shift - ageMonths0)
  const nationalReal = inputs.national.monthlyAmount * adjustment
  const nationalTaxReal = nationalPensionTax(nationalReal * 12) / 12

  const rowsByAge = new Map<number, Row>()
  let deferredLeft = dcSim ? dcSim.retireBalance : 0

  for (let m = 0; m < months; m++) {
    const d = deflator(m)
    const age = ageAt(m)
    const gross: Record<SourceKey, number> = { national: 0, dc: 0, personal: 0 }
    const tax: Record<SourceKey, number> = { national: 0, dc: 0, personal: 0 }

    gross.personal = personalSim ? personalSim.payouts[m] : 0
    gross.dc = dcSim ? dcSim.payouts[m] : 0
    const dcDeferred = Math.min(gross.dc, deferredLeft)
    deferredLeft -= dcDeferred
    const dcGain = gross.dc - dcDeferred

    if (inputs.national.enabled && m >= nationalStartM) {
      gross.national = nationalReal * d
      tax.national = nationalTaxReal * d
    }

    const personalTaxable = inputs.personal.taxType === 'deductible' ? gross.personal : 0
    const privateAnnual = ((personalTaxable + dcGain) / d) * 12
    let rate = privatePensionRate(age, privateAnnual)
    if (privateAnnual > PARAMS.privatePensionThreshold) {
      // 1,500만원 초과: 16.5% 분리과세와 종합과세 중 유리한 쪽
      const nationalAnnual = (gross.national / d) * 12
      const comprehensive =
        (nationalPensionTax(nationalAnnual + privateAnnual) - nationalPensionTax(nationalAnnual)) / privateAnnual
      rate = Math.min(rate, comprehensive)
    }
    tax.personal = personalTaxable * rate
    if (dcSim && gross.dc > 0) {
      const payoutYear = Math.floor((m - dcSim.startM) / 12) + 1
      tax.dc = dcDeferred * retirementTaxRate * deferredRetirementFactor(payoutYear) + dcGain * rate
    }

    if (gross.national + gross.dc + gross.personal === 0) continue

    let row = rowsByAge.get(age)
    if (!row) {
      row = {
        age,
        year: inputs.birthYear + age,
        sources: { national: zero(), dc: zero(), personal: zero() },
        total: zero(),
      }
      rowsByAge.set(age, row)
    }
    // 해당 나이 12개월 평균
    for (const key of SOURCE_KEYS) {
      const g = gross[key] / 12
      const n = (gross[key] - tax[key]) / 12
      for (const target of [row.sources[key], row.total]) {
        target.grossNominal += g
        target.netNominal += n
        target.grossReal += g / d
        target.netReal += n / d
      }
    }
  }

  const rows = [...rowsByAge.values()].sort((a, b) => a.age - b.age)

  const accountInfo = (sim: AccountSim): AccountInfo => ({
    startAge: ageAt(sim.startM),
    startBalanceNominal: sim.startBalance,
    startBalanceReal: sim.startBalance / deflator(sim.startM),
  })
  const personal = personalSim ? accountInfo(personalSim) : null
  const dc = dcSim ? { ...accountInfo(dcSim), serviceYears, retirementTaxRate } : null
  const national = inputs.national.enabled
    ? { normalAge, startAge: ageAt(nationalStartM), adjustment }
    : null

  const startAges = [personal?.startAge, dc?.startAge, national?.startAge].filter(
    (v): v is number => v !== undefined,
  )
  const headline = startAges.length
    ? (rows.find((r) => r.age >= Math.max(...startAges)) ?? rows[rows.length - 1] ?? null)
    : null

  // 적립금 추이: 지금부터 모든 계좌가 소진될 때까지
  const sims: Record<AccountKey, AccountSim | null> = { dc: dcSim, personal: personalSim }
  const balanceRow = (age: number, at: (sim: AccountSim) => number, d: number): BalanceRow => {
    const row: BalanceRow = {
      age,
      year: inputs.birthYear + age,
      values: { dc: { nominal: 0, real: 0 }, personal: { nominal: 0, real: 0 } },
      total: { nominal: 0, real: 0 },
    }
    for (const key of ['dc', 'personal'] as AccountKey[]) {
      const sim = sims[key]
      if (!sim) continue
      const nominal = at(sim)
      row.values[key] = { nominal, real: nominal / d }
      row.total.nominal += nominal
      row.total.real += nominal / d
    }
    return row
  }
  const balanceNow = balanceRow(ageAt(0), (sim) => (sim === dcSim ? inputs.dc.balance : inputs.personal.balance), 1)
  const balances: BalanceRow[] = []
  const lastM = Math.min(months, Math.max(0, ...[dcSim, personalSim].map((sim) => sim?.endM ?? 0))) - 1
  for (let age = ageAt(0); lastM >= 0; age++) {
    const mEnd = Math.min((age + 1) * 12 - ageMonths0 - 1, lastM)
    balances.push(balanceRow(age, (sim) => sim.balances[mEnd], deflator(mEnd + 1)))
    if (mEnd === lastM) break
  }

  return { rows, balanceNow, balances, phases: buildPhases(rows), headline, personal, dc, national }
}

function buildPhases(rows: Row[]): Phase[] {
  const phases: Phase[] = []
  let group: Row[] = []
  const activeOf = (r: Row) => SOURCE_KEYS.filter((k) => r.sources[k].grossNominal > 0)
  const flush = () => {
    if (!group.length) return
    const total = zero()
    for (const r of group) {
      for (const f of Object.keys(total) as (keyof Amounts)[]) total[f] += r.total[f] / group.length
    }
    phases.push({
      fromAge: group[0].age,
      toAge: group[group.length - 1].age,
      active: activeOf(group[0]),
      total,
    })
    group = []
  }
  for (const r of rows) {
    const prev = group[group.length - 1]
    if (prev && (activeOf(prev).join() !== activeOf(r).join() || r.age !== prev.age + 1)) flush()
    group.push(r)
  }
  flush()
  return phases
}
