import { useMemo, useState, type ReactNode } from 'react'
import { StackedChart } from './Chart'
import { PARAMS, nationalPensionNormalAge } from './engine/params'
import { estimateNationalPension } from './engine/national'
import {
  calculate,
  type AccountKey,
  type Amounts,
  type Balance,
  type Inputs,
  type SourceKey,
} from './engine/simulate'

// 화면 입력 단위: 금액은 만원, 비율은 %
interface PayoutForm {
  startAge: number
  payoutBasis: 'years' | 'endAge'
  payoutYears: number
  payoutEndAge: number
  payoutReturn: number
}

interface Form {
  common: { birthYear: number; birthMonth: number; inflation: number; payoutMode: 'real' | 'level' }
  personal: PayoutForm & {
    enabled: boolean
    balance: number
    monthly: number
    growth: number
    endAge: number
    accumReturn: number
    taxType: 'deductible' | 'exempt'
  }
  national: {
    enabled: boolean
    mode: 'simple' | 'direct'
    monthly: number
    startAge: number
    pastYears: number
    pastIncome: number
    futureType: 'income' | 'employee' | 'regional'
    futureValue: number
    endAge: number
  }
  dc: PayoutForm & {
    enabled: boolean
    balance: number
    annual: number
    growth: number
    joinYear: number
    retireAge: number
    accumReturn: number
  }
}

const DEFAULT_FORM: Form = {
  common: { birthYear: 1986, birthMonth: 1, inflation: 2, payoutMode: 'real' },
  personal: {
    enabled: true,
    balance: 3000,
    monthly: 50,
    growth: 0,
    endAge: 60,
    accumReturn: 5,
    startAge: 60,
    payoutBasis: 'years',
    payoutYears: 25,
    payoutEndAge: 85,
    payoutReturn: 3,
    taxType: 'deductible',
  },
  national: {
    enabled: true,
    mode: 'simple',
    monthly: 120,
    startAge: 65,
    pastYears: 15,
    pastIncome: 350,
    futureType: 'income',
    futureValue: 450,
    endAge: 60,
  },
  dc: {
    enabled: true,
    balance: 5000,
    annual: 500,
    growth: 3,
    joinYear: 2015,
    retireAge: 60,
    accumReturn: 4,
    startAge: 60,
    payoutBasis: 'years',
    payoutYears: 25,
    payoutEndAge: 85,
    payoutReturn: 3,
  },
}

const SERIES: { key: SourceKey; label: string }[] = [
  { key: 'national', label: '국민연금' },
  { key: 'dc', label: '퇴직연금(DC)' },
  { key: 'personal', label: '개인연금' },
]
const MAX_END_AGE = 100
const WON = 10_000

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const man = (won: number) => `${Math.round(won / WON).toLocaleString('ko-KR')}만원`
const eok = (won: number) =>
  won >= 1e8 ? `${(won / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원` : man(won)
// 입력값 ÷ 이 값 = 월 소득
const premiumRate = (type: Form['national']['futureType']) =>
  type === 'income' ? 1 : type === 'employee' ? PARAMS.contributionRate / 2 : PARAMS.contributionRate
const years1 = (months: number) => (months / 12).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const pct = (v: number) => `${(v * 100).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`

/** 실제 수령 개시 나이와 수령 기간. 기간을 직접 넣거나 소진 나이에서 거꾸로 구한다 */
function payoutPlan(a: PayoutForm, contributionEndAge: number, currentAge: number) {
  const start = Math.max(a.startAge, PARAMS.privatePensionMinAge, contributionEndAge, currentAge)
  const requested = a.payoutBasis === 'years' ? a.payoutYears : a.payoutEndAge - start
  const years = clamp(requested, PARAMS.minPayoutYears, MAX_END_AGE - start)
  return { start, years, adjusted: years !== requested }
}

function toInputs(f: Form, nationalMonthly: number, currentAge: number): Inputs {
  const normalAge = nationalPensionNormalAge(f.common.birthYear)
  return {
    birthYear: f.common.birthYear,
    birthMonth: f.common.birthMonth,
    inflation: f.common.inflation / 100,
    payoutMode: f.common.payoutMode,
    personal: {
      enabled: f.personal.enabled,
      balance: f.personal.balance * WON,
      monthlyContribution: f.personal.monthly * WON,
      contributionGrowth: f.personal.growth / 100,
      contributionEndAge: f.personal.endAge,
      accumReturn: f.personal.accumReturn / 100,
      startAge: f.personal.startAge,
      payoutYears: payoutPlan(f.personal, f.personal.endAge, currentAge).years,
      payoutReturn: f.personal.payoutReturn / 100,
      taxType: f.personal.taxType,
    },
    national: {
      enabled: f.national.enabled,
      monthlyAmount: nationalMonthly,
      startAge: clamp(f.national.startAge, normalAge - 5, normalAge + 5),
    },
    dc: {
      enabled: f.dc.enabled,
      balance: f.dc.balance * WON,
      monthlyContribution: (f.dc.annual * WON) / 12,
      contributionGrowth: f.dc.growth / 100,
      contributionEndAge: f.dc.retireAge,
      accumReturn: f.dc.accumReturn / 100,
      startAge: f.dc.startAge,
      payoutYears: payoutPlan(f.dc, f.dc.retireAge, currentAge).years,
      payoutReturn: f.dc.payoutReturn / 100,
      joinYear: f.dc.joinYear,
    },
  }
}

function NumInput(props: {
  value: number
  onChange: (v: number) => void
  unit: string
  step?: number
  min?: number
  max?: number
}) {
  const [text, setText] = useState(String(props.value))
  return (
    <span className="num-input">
      <input
        type="number"
        inputMode="decimal"
        value={text}
        step={props.step ?? 1}
        min={props.min ?? 0}
        max={props.max}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(v)) props.onChange(v)
        }}
        onBlur={() => setText(String(props.value))}
      />
      <span className="unit">{props.unit}</span>
    </span>
  )
}

function Field(props: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  )
}

function Section(props: {
  title: string
  seriesKey?: SourceKey
  enabled?: boolean
  onToggle?: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <section className="card">
      <header className="card-header">
        <h2>
          {props.seriesKey && <span className={`swatch series-${props.seriesKey}`} />}
          {props.title}
        </h2>
        {props.onToggle && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.enabled}
              onChange={(e) => props.onToggle!(e.target.checked)}
            />
            포함
          </label>
        )}
      </header>
      {props.enabled !== false && <div className="fields">{props.children}</div>}
    </section>
  )
}

export default function App() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [basis, setBasis] = useState<'real' | 'nominal'>('real')

  const [now] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
  const { common, personal, national, dc } = form
  const futureIncome = (national.futureValue * WON) / premiumRate(national.futureType)
  const estimate = useMemo(
    () =>
      estimateNationalPension(
        {
          birthYear: common.birthYear,
          birthMonth: common.birthMonth,
          pastMonths: national.pastYears * 12,
          pastIncome: national.pastIncome * WON,
          futureIncome,
          contributionEndAge: national.endAge,
        },
        now,
      ),
    [common.birthYear, common.birthMonth, national.pastYears, national.pastIncome, futureIncome, national.endAge, now],
  )
  const nationalMonthly = national.mode === 'simple' ? national.monthly * WON : estimate.monthly
  const currentAge = Math.floor(((now.year - common.birthYear) * 12 + now.month - common.birthMonth) / 12)
  const result = useMemo(
    () => calculate(toInputs(form, nationalMonthly, currentAge), now),
    [form, nationalMonthly, currentAge, now],
  )

  const update = <K extends keyof Form>(key: K, patch: Partial<Form[K]>) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }))

  const normalAge = nationalPensionNormalAge(common.birthYear)
  const nationalStartAge = clamp(national.startAge, normalAge - 5, normalAge + 5)
  const gross = (a: Amounts) => (basis === 'real' ? a.grossReal : a.grossNominal)
  const net = (a: Amounts) => (basis === 'real' ? a.netReal : a.netNominal)
  const activeSeries = SERIES.filter(({ key }) => form[key].enabled)
  const accountSeries = activeSeries.filter(({ key }) => key !== 'national')
  const bal = (b: Balance) => (basis === 'real' ? b.real : b.nominal)
  const peak = result.balances.reduce<(typeof result.balances)[number] | null>(
    (best, b) => (!best || bal(b.total) > bal(best.total) ? b : best),
    null,
  )
  const { headline } = result

  const minAgeHint = (startAge: number) =>
    startAge < PARAMS.privatePensionMinAge ? '55세부터 받을 수 있어 55세로 계산합니다.' : undefined
  const payoutFields = (key: 'dc' | 'personal', contributionEndAge: number) => {
    const a = form[key]
    const plan = payoutPlan(a, contributionEndAge, currentAge)
    const endAge = plan.start + plan.years
    const adjustedNote = plan.adjusted
      ? ` 수령 기간은 ${PARAMS.minPayoutYears}년 이상, ${MAX_END_AGE}세 이하로 맞춰 계산합니다.`
      : ''
    return (
      <>
        <Field label="수령 개시 나이" hint={minAgeHint(a.startAge)}>
          <NumInput value={a.startAge} onChange={(v) => update(key, { startAge: Math.round(v) })} unit="세" />
        </Field>
        <Field label="수령기 수익률">
          <NumInput value={a.payoutReturn} onChange={(v) => update(key, { payoutReturn: v })} unit="%" step={0.1} />
        </Field>
        <Field label="수령 기간 정하는 방법">
          <select
            value={a.payoutBasis}
            onChange={(e) => {
              // 방식을 바꿔도 지금 계산 결과가 유지되도록 반대쪽 값을 맞춘다
              const payoutBasis = e.target.value as PayoutForm['payoutBasis']
              update(key, { payoutBasis, payoutYears: plan.years, payoutEndAge: endAge })
            }}
          >
            <option value="years">수령 기간 입력</option>
            <option value="endAge">소진 나이 입력 (그 나이에 잔액 0)</option>
          </select>
        </Field>
        {a.payoutBasis === 'years' ? (
          <Field label="수령 기간" hint={`${plan.start}세부터 받아 ${endAge}세에 잔액이 모두 소진됩니다.${adjustedNote}`}>
            <NumInput
              key="years"
              value={a.payoutYears}
              onChange={(v) => update(key, { payoutYears: Math.round(v) })}
              unit="년"
            />
          </Field>
        ) : (
          <Field label="소진 나이" hint={`${plan.start}세부터 ${plan.years}년 동안 나눠 받습니다.${adjustedNote}`}>
            <NumInput
              key="endAge"
              value={a.payoutEndAge}
              onChange={(v) => update(key, { payoutEndAge: Math.round(v) })}
              unit="세"
            />
          </Field>
        )}
      </>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>연금 수령액 계산기</h1>
        <p>
          국민연금·퇴직연금(DC)·개인연금을 합쳐 은퇴 후 매달 받는 금액을 세전·세후로 계산합니다. 입력한
          값은 브라우저 안에서만 계산되며 어디에도 저장·전송되지 않습니다.
        </p>
      </header>

      <div className="layout">
        <div className="form">
          <Section title="기본 정보">
            <Field label="출생연도" hint={`현재 만 ${currentAge}세`}>
              <NumInput
                value={common.birthYear}
                onChange={(v) => update('common', { birthYear: Math.round(v) })}
                unit="년"
                min={1940}
                max={now.year}
              />
            </Field>
            <Field label="출생월">
              <NumInput
                value={common.birthMonth}
                onChange={(v) => update('common', { birthMonth: clamp(Math.round(v), 1, 12) })}
                unit="월"
                min={1}
                max={12}
              />
            </Field>
            <Field label="물가상승률">
              <NumInput
                value={common.inflation}
                onChange={(v) => update('common', { inflation: v })}
                unit="%"
                step={0.1}
              />
            </Field>
            <Field label="개인·퇴직연금 수령 방식">
              <select
                value={common.payoutMode}
                onChange={(e) => update('common', { payoutMode: e.target.value as 'real' | 'level' })}
              >
                <option value="real">매년 물가만큼 증액 (구매력 유지)</option>
                <option value="level">매달 같은 금액 (정액)</option>
              </select>
            </Field>
          </Section>

          <Section
            title="국민연금"
            seriesKey="national"
            enabled={national.enabled}
            onToggle={(v) => update('national', { enabled: v })}
          >
            <div className="field">
              <span className="field-label">입력 방식</span>
              <div className="segmented full" role="group" aria-label="국민연금 입력 방식">
                <button aria-pressed={national.mode === 'simple'} onClick={() => update('national', { mode: 'simple' })}>
                  공단 조회액 입력
                </button>
                <button aria-pressed={national.mode === 'direct'} onClick={() => update('national', { mode: 'direct' })}>
                  직접 계산
                </button>
              </div>
            </div>
            {national.mode === 'simple' ? (
              <Field
                label="예상 월 연금액 (현재가치)"
                hint={<>국민연금공단 "내 연금 알아보기"에서 조회한 {normalAge}세 기준 금액을 입력하세요.</>}
              >
                <NumInput value={national.monthly} onChange={(v) => update('national', { monthly: v })} unit="만원" />
              </Field>
            ) : (
              <>
                <Field
                  label="지금까지 가입기간"
                  hint="공단 가입내역에서 확인할 수 있습니다. 최근까지 이어서 가입한 것으로 계산합니다."
                >
                  <NumInput
                    value={national.pastYears}
                    onChange={(v) => update('national', { pastYears: v })}
                    unit="년"
                    step={0.5}
                  />
                </Field>
                <Field label="지금까지 평균 월소득" hint="현재 물가 기준입니다. 모르면 현재 월소득을 넣으세요.">
                  <NumInput
                    value={national.pastIncome}
                    onChange={(v) => update('national', { pastIncome: v })}
                    unit="만원"
                    step={10}
                  />
                </Field>
                <Field label="앞으로 납부 기준">
                  <select
                    value={national.futureType}
                    onChange={(e) => {
                      // 기준을 바꿔도 같은 소득이 되도록 입력값을 환산한다
                      const futureType = e.target.value as Form['national']['futureType']
                      const rate = premiumRate(futureType)
                      const value = (futureIncome * rate) / WON
                      // 보험료는 0.1만원, 소득은 1만원 단위로 반올림
                      const futureValue = rate < 1 ? Math.round(value * 10) / 10 : Math.round(value)
                      update('national', { futureType, futureValue })
                    }}
                  >
                    <option value="income">월 소득</option>
                    <option value="employee">월 보험료 (직장가입자 본인 부담분)</option>
                    <option value="regional">월 보험료 (지역가입자)</option>
                  </select>
                </Field>
                <Field
                  label={national.futureType === 'income' ? '앞으로 월평균 소득' : '앞으로 월평균 보험료'}
                  hint={
                    national.futureType === 'income'
                      ? `현재 물가 기준입니다. 상한 ${man(PARAMS.incomeCap)}, 하한 ${man(PARAMS.incomeFloor)}이 적용됩니다.`
                      : `소득 약 ${man(futureIncome)}으로 환산합니다. (${PARAMS.baseYear}년 보험료율 ${pct(PARAMS.contributionRate)} 기준)`
                  }
                >
                  <NumInput
                    key={national.futureType}
                    value={national.futureValue}
                    onChange={(v) => update('national', { futureValue: v })}
                    unit="만원"
                    step={national.futureType === 'income' ? 10 : 1}
                  />
                </Field>
                <Field
                  label="납부 종료 나이"
                  hint={`앞으로 ${years1(estimate.futureMonths)}년 더 납부합니다. 의무가입은 만 60세 전까지입니다.`}
                >
                  <NumInput
                    value={national.endAge}
                    onChange={(v) => update('national', { endAge: Math.round(v) })}
                    unit="세"
                  />
                </Field>
                <div className="estimate">
                  <div className="field-label">{normalAge}세 기준 예상 월 연금액 (현재가치)</div>
                  {estimate.eligible ? (
                    <>
                      <div className="estimate-value">{man(estimate.monthly)}</div>
                      <div className="field-hint">
                        총 가입 {years1(estimate.totalMonths)}년 · 평균소득(B값) {man(estimate.averageIncome)} · A값{' '}
                        {man(PARAMS.nationalA)}
                      </div>
                    </>
                  ) : (
                    <div className="estimate-warning">
                      총 가입기간이 {years1(estimate.totalMonths)}년으로 10년 미만이라 연금 대신 반환일시금을
                      받습니다.
                    </div>
                  )}
                </div>
              </>
            )}
            <Field label="수령 개시 나이" hint={`${common.birthYear}년생의 정상 개시 나이는 ${normalAge}세입니다.`}>
              <select
                value={nationalStartAge}
                onChange={(e) => update('national', { startAge: Number(e.target.value) })}
              >
                {Array.from({ length: 11 }, (_, i) => normalAge - 5 + i).map((age) => {
                  const diff = age - normalAge
                  const note = diff < 0 ? `조기 ${diff * 6}%` : diff > 0 ? `연기 +${(diff * 7.2).toFixed(1)}%` : '정상'
                  return (
                    <option key={age} value={age}>
                      {age}세 ({note})
                    </option>
                  )
                })}
              </select>
            </Field>
          </Section>

          <Section
            title="퇴직연금 (DC)"
            seriesKey="dc"
            enabled={dc.enabled}
            onToggle={(v) => update('dc', { enabled: v })}
          >
            <Field label="현재 적립금">
              <NumInput value={dc.balance} onChange={(v) => update('dc', { balance: v })} unit="만원" step={100} />
            </Field>
            <Field label="연간 적립액" hint="보통 연봉의 1/12입니다.">
              <NumInput value={dc.annual} onChange={(v) => update('dc', { annual: v })} unit="만원" step={10} />
            </Field>
            <Field label="적립액 연 증가율" hint="임금상승률">
              <NumInput value={dc.growth} onChange={(v) => update('dc', { growth: v })} unit="%" step={0.1} />
            </Field>
            <Field label="입사연도" hint="퇴직소득세의 근속연수 계산에 씁니다.">
              <NumInput
                value={dc.joinYear}
                onChange={(v) => update('dc', { joinYear: Math.round(v) })}
                unit="년"
                min={1960}
                max={now.year}
              />
            </Field>
            <Field label="퇴직 나이">
              <NumInput value={dc.retireAge} onChange={(v) => update('dc', { retireAge: Math.round(v) })} unit="세" />
            </Field>
            <Field label="적립기 수익률">
              <NumInput value={dc.accumReturn} onChange={(v) => update('dc', { accumReturn: v })} unit="%" step={0.1} />
            </Field>
            {payoutFields('dc', dc.retireAge)}
          </Section>

          <Section
            title="개인연금"
            seriesKey="personal"
            enabled={personal.enabled}
            onToggle={(v) => update('personal', { enabled: v })}
          >
            <Field label="연금 종류">
              <select
                value={personal.taxType}
                onChange={(e) => update('personal', { taxType: e.target.value as 'deductible' | 'exempt' })}
              >
                <option value="deductible">연금저축·IRP (세액공제형)</option>
                <option value="exempt">연금보험 (비과세형)</option>
              </select>
            </Field>
            <Field label="현재 적립금">
              <NumInput value={personal.balance} onChange={(v) => update('personal', { balance: v })} unit="만원" step={100} />
            </Field>
            <Field label="월 적립액">
              <NumInput value={personal.monthly} onChange={(v) => update('personal', { monthly: v })} unit="만원" step={5} />
            </Field>
            <Field label="적립액 연 증가율">
              <NumInput value={personal.growth} onChange={(v) => update('personal', { growth: v })} unit="%" step={0.1} />
            </Field>
            <Field label="적립 종료 나이">
              <NumInput value={personal.endAge} onChange={(v) => update('personal', { endAge: Math.round(v) })} unit="세" />
            </Field>
            <Field label="적립기 수익률">
              <NumInput value={personal.accumReturn} onChange={(v) => update('personal', { accumReturn: v })} unit="%" step={0.1} />
            </Field>
            {payoutFields('personal', personal.endAge)}
          </Section>
        </div>

        <div className="results" id="results">
          {!headline ? (
            <section className="card empty">계산할 연금을 하나 이상 포함해 주세요.</section>
          ) : (
            <>
              <section className="card">
                <header className="card-header">
                  <h2>{headline.age}세 월 수령액</h2>
                  <div className="segmented" role="group" aria-label="금액 기준">
                    <button aria-pressed={basis === 'real'} onClick={() => setBasis('real')}>
                      현재가치
                    </button>
                    <button aria-pressed={basis === 'nominal'} onClick={() => setBasis('nominal')}>
                      미래 금액
                    </button>
                  </div>
                </header>
                <div className="hero">
                  <div>
                    <div className="hero-label">세후</div>
                    <div className="hero-value">{man(net(headline.total))}</div>
                  </div>
                  <div>
                    <div className="hero-label">세전</div>
                    <div className="hero-sub">{man(gross(headline.total))}</div>
                  </div>
                </div>
                <p className="note">
                  {basis === 'real'
                    ? '지금 물가로 환산한 금액입니다.'
                    : `${headline.year}년에 실제로 받는 금액입니다.`}{' '}
                  포함한 연금이 모두 개시되는 {headline.age}세 기준입니다.
                </p>

                <table className="table">
                  <thead>
                    <tr>
                      <th>구간</th>
                      <th>받는 연금</th>
                      <th className="num">세전</th>
                      <th className="num">세후</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.phases.map((p) => (
                      <tr key={p.fromAge}>
                        <td>{p.fromAge === p.toAge ? `${p.fromAge}세` : `${p.fromAge}~${p.toAge}세`}</td>
                        <td>
                          {p.active.map((key) => (
                            <span key={key} className="chip">
                              <span className={`swatch series-${key}`} />
                              {SERIES.find((s) => s.key === key)!.label}
                            </span>
                          ))}
                        </td>
                        <td className="num">{man(gross(p.total))}</td>
                        <td className="num strong">{man(net(p.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="note">구간 내 평균 월 수령액입니다.</p>
              </section>

              <section className="card">
                <header className="card-header">
                  <h2>나이별 세후 월 수령액</h2>
                </header>
                {activeSeries.length > 1 && (
                  <div className="legend">
                    {activeSeries.map(({ key, label }) => (
                      <span key={key} className="chip">
                        <span className={`swatch series-${key}`} />
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                <StackedChart
                  data={result.rows.map((r) => ({
                    age: r.age,
                    year: r.year,
                    values: { national: net(r.sources.national), dc: net(r.sources.dc), personal: net(r.sources.personal) },
                  }))}
                  series={activeSeries}
                  format={man}
                  label="나이별 세후 월 수령액 누적 막대 차트"
                />
                <details>
                  <summary>표로 보기</summary>
                  <div className="table-scroll">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>나이</th>
                          {activeSeries.map(({ key, label }) => (
                            <th key={key} className="num">
                              {label}
                            </th>
                          ))}
                          <th className="num">세전 합계</th>
                          <th className="num">세후 합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((r) => (
                          <tr key={r.age}>
                            <td>
                              {r.age}세 <span className="muted">{r.year}</span>
                            </td>
                            {activeSeries.map(({ key }) => (
                              <td key={key} className="num">
                                {man(net(r.sources[key]))}
                              </td>
                            ))}
                            <td className="num">{man(gross(r.total))}</td>
                            <td className="num strong">{man(net(r.total))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>

              {accountSeries.length > 0 && (
                <section className="card">
                  <header className="card-header">
                    <h2>연금 자산 추이</h2>
                  </header>
                  {peak && (
                    <div className="hero">
                      <div>
                        <div className="hero-label">최대 적립금 ({peak.age}세 말)</div>
                        <div className="hero-sub strong-ink">{eok(bal(peak.total))}</div>
                      </div>
                      <div>
                        <div className="hero-label">현재</div>
                        <div className="hero-sub">{eok(result.balanceNow.total.nominal)}</div>
                      </div>
                    </div>
                  )}
                  <p className="note">
                    퇴직연금·개인연금 계좌의 나이별 연말 잔액({basis === 'real' ? '현재가치' : '미래 금액'})입니다.
                    국민연금은 적립금 계좌가 없어 제외했습니다.
                  </p>
                  {accountSeries.length > 1 && (
                    <div className="legend">
                      {accountSeries.map(({ key, label }) => (
                        <span key={key} className="chip">
                          <span className={`swatch series-${key}`} />
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  <StackedChart
                    data={result.balances.map((b) => ({
                      age: b.age,
                      year: b.year,
                      values: { national: 0, dc: bal(b.values.dc), personal: bal(b.values.personal) },
                    }))}
                    series={accountSeries}
                    format={eok}
                    label="나이별 연금 적립금 누적 막대 차트"
                    tooltipTitle={(d) => `${d.age}세 말 · ${d.year}년`}
                  />
                  <details>
                    <summary>표로 보기</summary>
                    <div className="table-scroll">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>나이</th>
                            {accountSeries.map(({ key, label }) => (
                              <th key={key} className="num">
                                {label}
                              </th>
                            ))}
                            <th className="num">합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>현재</td>
                            {accountSeries.map(({ key }) => (
                              <td key={key} className="num">
                                {man(result.balanceNow.values[key as AccountKey].nominal)}
                              </td>
                            ))}
                            <td className="num strong">{man(result.balanceNow.total.nominal)}</td>
                          </tr>
                          {result.balances.map((b) => (
                            <tr key={b.age}>
                              <td>
                                {b.age}세 말 <span className="muted">{b.year}</span>
                              </td>
                              {accountSeries.map(({ key }) => (
                                <td key={key} className="num">
                                  {man(bal(b.values[key as AccountKey]))}
                                </td>
                              ))}
                              <td className="num strong">{man(bal(b.total))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </section>
              )}

              <section className="card">
                <header className="card-header">
                  <h2>계산 근거</h2>
                </header>
                <dl className="facts">
                  {result.national && (
                    <>
                      <dt>국민연금</dt>
                      <dd>
                        {national.mode === 'direct' &&
                          `직접 계산 월 ${man(estimate.monthly)} (가입 ${years1(estimate.totalMonths)}년), `}
                        {result.national.startAge}세 개시, {pct(result.national.adjustment)} 지급 (매년 물가 연동)
                      </dd>
                    </>
                  )}
                  {result.dc && (
                    <>
                      <dt>퇴직연금</dt>
                      <dd>
                        {result.dc.startAge}세 개시 시점 적립금 {eok(result.dc.startBalanceNominal)} (현재가치{' '}
                        {eok(result.dc.startBalanceReal)}), 근속 {result.dc.serviceYears}년, 퇴직소득세 실효세율{' '}
                        {pct(result.dc.retirementTaxRate)}
                      </dd>
                    </>
                  )}
                  {result.personal && (
                    <>
                      <dt>개인연금</dt>
                      <dd>
                        {result.personal.startAge}세 개시 시점 적립금 {eok(result.personal.startBalanceNominal)}{' '}
                        (현재가치 {eok(result.personal.startBalanceReal)})
                      </dd>
                    </>
                  )}
                </dl>
              </section>
            </>
          )}

          <section className="card notice">
            <h2>꼭 확인하세요</h2>
            <ul>
              <li>
                {PARAMS.baseYear}년 세법 기준의 추정치이며, 실제 수령액은 수익률·세법 개정·개인 상황에 따라
                달라집니다. 투자·세무 자문이 아닙니다.
              </li>
              <li>
                <strong>건강보험료는 반영하지 않았습니다.</strong> 은퇴 후 지역가입자가 되면 국민연금 수령액의
                50%가 소득으로 잡혀 보험료가 부과됩니다.
              </li>
              <li>
                세금은 연금 외 다른 소득이 없고 본인 기본공제만 받는 경우로 계산했습니다. 근로·사업·임대소득이
                있으면 세금이 늘어납니다.
              </li>
              <li>
                세액공제형 개인연금과 퇴직연금 운용수익의 합계가 연 1,500만원(현재가치)을 넘으면 16.5%
                분리과세와 종합과세 중 세금이 적은 쪽으로 계산합니다.
              </li>
              <li>
                국민연금 직접 계산은 {PARAMS.baseYear}년 A값과 현재 물가 기준 소득으로 공단 산식을 적용한
                추정치입니다. 출산·군복무 크레딧, 부양가족연금, 가입 공백은 반영하지 않으니 공단 조회액이 있으면
                그 값을 쓰는 것이 더 정확합니다.
              </li>
              <li>
                세액공제형 개인연금은 납입액 전부를 세액공제 받았다고 가정합니다. 종신형 연금, 운용 수수료,
                국민연금의 소득활동 감액은 반영하지 않았습니다.
              </li>
            </ul>
          </section>
        </div>
      </div>

      {headline && (
        <a className="summary-bar" href="#results">
          <span>{headline.age}세 세후 월 수령액</span>
          <strong>{man(net(headline.total))}</strong>
        </a>
      )}
    </div>
  )
}
