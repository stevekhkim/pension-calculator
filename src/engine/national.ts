import { PARAMS } from './params'

// 국민연금 기본연금액 직접 계산. 금액은 원, 모두 현재가치(올해 A값 기준)
export interface NationalEstimateInput {
  birthYear: number
  birthMonth: number
  pastMonths: number // 지금까지 가입기간
  pastIncome: number // 지금까지 평균 기준소득월액
  futureIncome: number // 앞으로 월평균 기준소득월액 (0이면 더 납부하지 않음)
  contributionEndAge: number // 납부 종료 나이
}

export interface NationalEstimate {
  monthly: number // 정상 개시연령 기준 월 연금액
  eligible: boolean // 가입기간 10년 이상
  pastMonths: number
  futureMonths: number
  totalMonths: number
  averageIncome: number // B값
}

/** 연도별 비례상수 (1998년 이전은 2.4이며 B에 0.75를 곱한다) */
export function proportionalConstant(year: number): number {
  if (year <= 1998) return 2.4
  if (year <= 2007) return 1.8
  if (year <= 2025) return 1.5 - 0.015 * (year - 2008)
  return 1.29
}

const clampIncome = (v: number) =>
  v > 0 ? Math.min(PARAMS.incomeCap, Math.max(PARAMS.incomeFloor, v)) : 0

export function estimateNationalPension(
  input: NationalEstimateInput,
  now: { year: number; month: number },
): NationalEstimate {
  const nowIndex = now.year * 12 + (now.month - 1)
  // 1988년 이전이나 18세 이전은 가입할 수 없다
  const earliest = Math.max(1988 * 12, (input.birthYear + 18) * 12 + (input.birthMonth - 1))
  const pastMonths = Math.max(0, Math.min(Math.round(input.pastMonths), nowIndex - earliest))
  const ageMonths0 = (now.year - input.birthYear) * 12 + (now.month - input.birthMonth)
  const pastIncome = clampIncome(input.pastIncome)
  const futureIncome = clampIncome(input.futureIncome)
  const futureMonths = futureIncome > 0 ? Math.max(0, input.contributionEndAge * 12 - ageMonths0) : 0
  const totalMonths = pastMonths + futureMonths

  const B = totalMonths ? (pastMonths * pastIncome + futureMonths * futureIncome) / totalMonths : 0
  const A = PARAMS.nationalA

  // 기본연금액(연) = Σ 비례상수 × (A + B) × 가입월수 / 240
  // 20년 가입이면 비례상수 × (A + B), 이후 1년마다 5%씩 늘어나는 법정 산식과 같다
  let annual = 0
  const start = nowIndex - pastMonths
  for (let i = start; i < nowIndex + futureMonths; i++) {
    const year = Math.floor(i / 12)
    const c = proportionalConstant(year)
    annual += (year <= 1998 ? c * (A + 0.75 * B) : c * (A + B)) / 240
  }

  const eligible = totalMonths >= PARAMS.minInsuredMonths
  return {
    monthly: eligible ? annual / 12 : 0,
    eligible,
    pastMonths,
    futureMonths,
    totalMonths,
    averageIncome: B,
  }
}
