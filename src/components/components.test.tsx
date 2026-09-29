import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { ScenarioInput } from '../lib/scenario'
import type { Indicators, Meta } from '../lib/types'
import { EffectView } from '../views/EffectView'
import { Board } from './Board'
import { Decomposition } from './Decomposition'
import { KpiTiles } from './Kpi'
import { asofText, tabFromHash } from './Shell'
import { Validations } from './Validations'

const read = <T,>(name: string): T => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8')) as T
const data = read<Indicators>('indicators.json')
const meta = read<Meta>('meta.json')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-01 공항별 비교(출발 안내판)', () => {
  it('청주 대만 행에 36,790원 · 2.55 · +105%', () => {
    render(<Board data={data} nat="대만" />)
    const row = screen.getByRole('row', { name: '청주공항 대만' })
    expect(row.className).toContain('target')
    const q = within(row)
    expect(q.getByText('36,790')).toBeTruthy()
    expect(q.getByText('2.55')).toBeTruthy()
    expect(q.getByText('+105%')).toBeTruthy()
    expect(q.getByText('연동 검정 통과')).toBeTruthy()
  })
  it('검정 칩에 차분 상관(인천)을 담는다', () => {
    render(<Board data={data} nat="대만" />)
    const chip = within(screen.getByRole('row', { name: '청주공항 대만' })).getByText('연동 검정 통과').closest('[data-ui="CHP-01"]')!
    expect(chip.getAttribute('title')).toContain('차분 상관 0.83(인천 0.49)')
  })
  it('제주 대만은 참고값(ST-05)', () => {
    render(<Board data={data} nat="대만" />)
    expect(within(screen.getByRole('row', { name: '제주공항 대만' })).getByText('참고값')).toBeTruthy()
  })
  it('일본 선택 시 청주 ① 113,144원(UI-02)', () => {
    render(<Board data={data} nat="일본" />)
    expect(within(screen.getByRole('row', { name: '청주공항 일본' })).getByText('113,144')).toBeTruthy()
  })
  it('자료 없는 공항은 자료 없음 행(ST-04)', () => {
    const ext: Indicators = {
      ...data,
      airports: [...data.airports, { id: 'mwx', name: '무안', region: '전남', color: 'extra', role: 'compare', nat: { 대만: { status: '자료 없음' } } }],
    }
    render(<Board data={ext} nat="대만" />)
    expect(within(screen.getByRole('row', { name: '무안공항 자료 없음' })).getByText('MWX')).toBeTruthy()
  })
})

describe('현황 핵심 지표', () => {
  it('반기 값과 최근 달 값을 함께 보인다', () => {
    render(<KpiTiles data={data} nat="대만" />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0].textContent).toContain('27,700명')
    expect(items[0].textContent).toContain('+105%')
    expect(items[0].textContent).toContain('2026.07 5,139명')
    expect(items[1].textContent).toContain('10.2억 원')
    expect(items[2].textContent).toContain('36,790원')
    expect(items[3].textContent).toContain('2.55인·일')
  })
})

describe('UI-07 요인분해', () => {
  it('74,701 → 66,903, 일본 −10,440이 가장 큰 몫', () => {
    const { container } = render(<Decomposition data={data} />)
    expect(screen.getByText(/74,701원 → .* 66,903원/)).toBeTruthy()
    const lead = container.querySelector('.brg.lead')!
    expect(lead.textContent).toContain('일본 1인당 소비 변화')
    expect(lead.textContent).toContain('−10,440원')
  })
})

describe('UI-08 효과 계산', () => {
  it('기본 조건 +2.0억 ~ 11.2억, 사업비를 넣으면 배수', () => {
    let input: ScenarioInput = { days: 0.5, compare: 'pus', arrivals: null, budget: null }
    const { rerender } = render(<EffectView data={data} meta={meta} nat="대만" input={input} onInput={(n) => (input = n)} onToast={() => {}} />)
    expect(screen.getByText(/\+2\.0억 ~ 11\.2억/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('사업비(선택)'), { target: { value: '1' } })
    rerender(<EffectView data={data} meta={meta} nat="대만" input={input} onInput={(n) => (input = n)} onToast={() => {}} />)
    expect(screen.getByText('2.0~11.2배')).toBeTruthy()
    expect(screen.getByText(/사업비 1억 원 대비 추가 소비 2\.0~11\.2배/)).toBeTruthy()
  })
})

describe('TXT-01 · 탭 주소', () => {
  it('메타가 없으면 null → 기준일 확인 필요', () => {
    expect(asofText(null)).toBeNull()
    expect(asofText(meta)).toContain('입국 2026.07까지 · 데이터랩 2026.08 추출')
  })
  it('명세서 앵커도 해당 탭으로 연다', () => {
    expect(tabFromHash('#map')).toBe('sgg')
    expect(tabFromHash('#method')).toBe('data')
    expect(tabFromHash('#report')).toBe('report')
    expect(tabFromHash('')).toBe('overview')
  })
})

describe('PNL-02 · ST-09', () => {
  it('검증 6종을 모두 표시', () => {
    render(<Validations meta={meta} />)
    for (const v of meta.report.validations) expect(screen.getByText(`${v.id} ${v.title}`)).toBeTruthy()
    expect(screen.getByText(/데이터 점검 8항목 · 모두 통과/)).toBeTruthy()
    expect(screen.queryByText(/시도-시군구 불일치/)).toBeNull()
  })
  it('불일치가 있으면 경고 배지', () => {
    const bad: Meta = { ...meta, report: { ...meta.report, consistency: { ...meta.report.consistency, mismatch: 2 } } }
    render(<Validations meta={bad} />)
    expect(screen.getByText(/시도-시군구 불일치 2건/)).toBeTruthy()
  })
})

describe('ST-01 · ST-03 로딩', () => {
  it('JSON을 못 읽으면 새로고침 안내', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    render(<App />)
    expect(screen.getByLabelText('불러오는 중')).toBeTruthy()
    expect(await screen.findByText('자료를 불러오지 못했습니다. 새로고침해 주세요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy()
  })
})
