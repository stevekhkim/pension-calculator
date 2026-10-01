// 세법·제도 기준값. 매년 1회 이 파일만 갱신한다. 금액 단위는 원.
export const PARAMS = {
  baseYear: 2026,

  // 종합소득 기본세율: [과세표준 상한, 세율]
  incomeTaxBrackets: [
    [14_000_000, 0.06],
    [50_000_000, 0.15],
    [88_000_000, 0.24],
    [150_000_000, 0.35],
    [300_000_000, 0.38],
    [500_000_000, 0.4],
    [1_000_000_000, 0.42],
    [Infinity, 0.45],
  ] as [number, number][],
  localTaxRate: 0.1,

  // 사적연금 연금소득세(지방세 포함): [나이 미만, 세율]
  privatePensionRates: [
    [70, 0.055],
    [80, 0.044],
    [Infinity, 0.033],
  ] as [number, number][],
  privatePensionThreshold: 15_000_000,
  privatePensionOverRate: 0.165,
  privatePensionMinAge: 55,
  minPayoutYears: 10,

  // 국민연금 직접 계산
  nationalA: 3_193_511, // 2026년 적용 A값(전체 가입자 평균소득월액)
  incomeCap: 6_590_000, // 기준소득월액 상한 (2026.7~2027.6)
  incomeFloor: 410_000, // 기준소득월액 하한 (2026.7~2027.6)
  contributionRate: 0.095, // 2026년 보험료율 (직장가입자는 절반 부담)
  minInsuredMonths: 120,

  // 공적연금
  pensionDeductionCap: 9_000_000,
  basicDeduction: 1_500_000,
  standardTaxCredit: 70_000,
  earlyReductionPerMonth: 0.005,
  deferralIncreasePerMonth: 0.006,
  maxShiftMonths: 60,

  // 이연퇴직소득 연금수령 시 과세 비율: [수령연차 이하, 비율]
  deferredRetirementFactors: [
    [10, 0.7],
    [20, 0.6],
    [Infinity, 0.5],
  ] as [number, number][],
}

export function nationalPensionNormalAge(birthYear: number): number {
  if (birthYear <= 1952) return 60
  if (birthYear <= 1956) return 61
  if (birthYear <= 1960) return 62
  if (birthYear <= 1964) return 63
  if (birthYear <= 1968) return 64
  return 65
}
