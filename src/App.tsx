import { useMemo, useState, type ReactNode } from 'react'
import { StackedChart } from './Chart'
import { PARAMS, nationalPensionNormalAge } from './engine/params'
import { calculate, type Amounts, type Inputs, type SourceKey } from './engine/simulate'

// 화면 입력 단위: 금액은 만원, 비율은 %
interface Form {
  common: { birthYear: number; birthMonth: number; inflation: number; payoutMode: 'real' | 'level' }
  personal: {
    enabled: boolean
    balance: number
    monthly: number
    growth: number
    endAge: number
    accumReturn: number
    startAge: number
    payoutYears: number
    payoutReturn: number
    taxType: 'deductible' | 'exempt'
  }
  national: { enabled: boolean; monthly: number; startAge: number }
  dc: {
    enabled: boolean
    balance: number
    annual: number
    growth: number
    joinYear: number
    retireAge: number
    accumReturn: number
    startAge: number
    payoutYears: number
    payoutReturn: number
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
    payoutYears: 25,
    payoutReturn: 3,
    taxType: 'deductible',
  },
  national: { enabled: true, monthly: 120, startAge: 65 },
  dc: {
    enabled: true,
    balance: 5000,
    annual: 500,
    growth: 3,
    joinYear: 2015,
    retireAge: 60,
    accumReturn: 4,
    startAge: 60,
    payoutYears: 25,
    payoutReturn: 3,
  },
}

const SERIES: { key: SourceKey; label: string }[] = [
  { key: 'national', label: '국민연금' },
  { key: 'dc', label: '퇴직연금(DC)' },
  { key: 'personal', label: '개인연금' },
]
const MAX_PAYOUT_YEARS = 40
const WON = 10_000

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const man = (won: number) => `${Math.round(won / WON).toLocaleString('ko-KR')}만원`
const eok = (won: number) =>
  won >= 1e8 ? `${(won / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원` : man(won)
const pct = (v: number) => `${(v * 100).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`

function toInputs(f: Form): Inputs {
  const normalAge = nationalPensionNormalAge(f.common.birthYear)
  const years = (v: number) => clamp(v, PARAMS.minPayoutYears, MAX_PAYOUT_YEARS)
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
      payoutYears: years(f.personal.payoutYears),
      payoutReturn: f.personal.payoutReturn / 100,
      taxType: f.personal.taxType,
    },
    national: {
      enabled: f.national.enabled,
      monthlyAmount: f.national.monthly * WON,
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
      payoutYears: years(f.dc.payoutYears),
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
  const result = useMemo(() => calculate(toInputs(form), now), [form, now])

  const update = <K extends keyof Form>(key: K, patch: Partial<Form[K]>) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }))

  const { common, personal, national, dc } = form
  const currentAge = Math.floor(((now.year - common.birthYear) * 12 + now.month - common.birthMonth) / 12)
  const normalAge = nationalPensionNormalAge(common.birthYear)
  const nationalStartAge = clamp(national.startAge, normalAge - 5, normalAge + 5)
  const gross = (a: Amounts) => (basis === 'real' ? a.grossReal : a.grossNominal)
  const net = (a: Amounts) => (basis === 'real' ? a.netReal : a.netNominal)
  const activeSeries = SERIES.filter(({ key }) => form[key].enabled)
  const { headline } = result

  const minAgeHint = (startAge: number) =>
    startAge < PARAMS.privatePensionMinAge ? '55세부터 받을 수 있어 55세로 계산합니다.' : undefined
  const yearsHint = (years: number) =>
    years < PARAMS.minPayoutYears || years > MAX_PAYOUT_YEARS
      ? `${PARAMS.minPayoutYears}~${MAX_PAYOUT_YEARS}년 범위로 계산합니다.`
      : undefined

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
            <Field
              label="예상 월 연금액 (현재가치)"
              hint={
                <>
                  국민연금공단 "내 연금 알아보기"에서 조회한 {normalAge}세 기준 금액을 입력하세요.
                </>
              }
            >
              <NumInput value={national.monthly} onChange={(v) => update('national', { monthly: v })} unit="만원" />
            </Field>
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
            <Field label="수령 개시 나이" hint={minAgeHint(dc.startAge)}>
              <NumInput value={dc.startAge} onChange={(v) => update('dc', { startAge: Math.round(v) })} unit="세" />
            </Field>
            <Field label="수령 기간" hint={yearsHint(dc.payoutYears)}>
              <NumInput value={dc.payoutYears} onChange={(v) => update('dc', { payoutYears: Math.round(v) })} unit="년" />
            </Field>
            <Field label="수령기 수익률">
              <NumInput value={dc.payoutReturn} onChange={(v) => update('dc', { payoutReturn: v })} unit="%" step={0.1} />
            </Field>
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
            <Field label="수령 개시 나이" hint={minAgeHint(personal.startAge)}>
              <NumInput value={personal.startAge} onChange={(v) => update('personal', { startAge: Math.round(v) })} unit="세" />
            </Field>
            <Field label="수령 기간" hint={yearsHint(personal.payoutYears)}>
              <NumInput value={personal.payoutYears} onChange={(v) => update('personal', { payoutYears: Math.round(v) })} unit="년" />
            </Field>
            <Field label="수령기 수익률">
              <NumInput value={personal.payoutReturn} onChange={(v) => update('personal', { payoutReturn: v })} unit="%" step={0.1} />
            </Field>
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

              <section className="card">
                <header className="card-header">
                  <h2>계산 근거</h2>
                </header>
                <dl className="facts">
                  {result.national && (
                    <>
                      <dt>국민연금</dt>
                      <dd>
                        {result.national.startAge}세 개시, 입력 금액의 {pct(result.national.adjustment)} 지급 (매년
                        물가 연동)
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
