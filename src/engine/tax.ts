import { PARAMS } from './params'

function lookup(table: [number, number][], key: number, inclusive: boolean): number {
  for (const [limit, value] of table) {
    if (inclusive ? key <= limit : key < limit) return value
  }
  return table[table.length - 1][1]
}

/** 종합소득 기본세율 산출세액 (지방세 제외) */
export function progressiveTax(taxBase: number): number {
  let tax = 0
  let lower = 0
  for (const [upper, rate] of PARAMS.incomeTaxBrackets) {
    if (taxBase <= lower) break
    tax += (Math.min(taxBase, upper) - lower) * rate
    lower = upper
  }
  return tax
}

/** 연금소득공제 */
export function pensionIncomeDeduction(annual: number): number {
  let d: number
  if (annual <= 3_500_000) d = annual
  else if (annual <= 7_000_000) d = 3_500_000 + (annual - 3_500_000) * 0.4
  else if (annual <= 14_000_000) d = 4_900_000 + (annual - 7_000_000) * 0.2
  else d = 6_300_000 + (annual - 14_000_000) * 0.1
  return Math.min(d, PARAMS.pensionDeductionCap)
}

/** 연금소득만 있을 때의 종합소득세 (지방세 포함, 본인공제만 가정). 국민연금 세금과 사적연금 종합과세에 쓴다 */
export function nationalPensionTax(annual: number): number {
  const base = Math.max(0, annual - pensionIncomeDeduction(annual) - PARAMS.basicDeduction)
  const tax = Math.max(0, progressiveTax(base) - PARAMS.standardTaxCredit)
  return tax * (1 + PARAMS.localTaxRate)
}

/** 근속연수공제 */
export function serviceYearsDeduction(years: number): number {
  if (years <= 5) return 1_000_000 * years
  if (years <= 10) return 5_000_000 + 2_000_000 * (years - 5)
  if (years <= 20) return 15_000_000 + 2_500_000 * (years - 10)
  return 40_000_000 + 3_000_000 * (years - 20)
}

/** 환산급여공제 */
export function convertedSalaryDeduction(converted: number): number {
  if (converted <= 8_000_000) return converted
  if (converted <= 70_000_000) return 8_000_000 + (converted - 8_000_000) * 0.6
  if (converted <= 100_000_000) return 45_200_000 + (converted - 70_000_000) * 0.55
  if (converted <= 300_000_000) return 61_700_000 + (converted - 100_000_000) * 0.45
  return 151_700_000 + (converted - 300_000_000) * 0.35
}

/** 퇴직소득세 (지방세 포함). years는 근속연수(1년 미만 올림, 최소 1) */
export function retirementIncomeTax(amount: number, years: number): number {
  const n = Math.max(1, Math.ceil(years))
  const afterService = Math.max(0, amount - serviceYearsDeduction(n))
  const converted = (afterService * 12) / n
  const base = Math.max(0, converted - convertedSalaryDeduction(converted))
  return ((progressiveTax(base) * n) / 12) * (1 + PARAMS.localTaxRate)
}

/** 사적연금 연금소득세율 (지방세 포함) */
export function privatePensionRate(age: number, annualTaxable: number): number {
  if (annualTaxable > PARAMS.privatePensionThreshold) return PARAMS.privatePensionOverRate
  return lookup(PARAMS.privatePensionRates, age, false)
}

/** 이연퇴직소득 연금수령 시 퇴직소득세 대비 과세 비율 */
export function deferredRetirementFactor(payoutYear: number): number {
  return lookup(PARAMS.deferredRetirementFactors, payoutYear, true)
}
