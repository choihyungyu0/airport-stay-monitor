import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { ScenarioInput } from '../lib/scenario'
import type { BuildingFile, BuildingIndex, Indicators, Meta, SggData } from '../lib/types'
import { EffectView } from '../views/EffectView'
import { Board } from './Board'
import { BuildingPanel, buildingTitle, maxZoomFor, PROTECT_KM } from './Buildings'
import { Decomposition } from './Decomposition'
import { KpiTiles } from './Kpi'
import { asofText, canonicalHash, tabFromHash } from './Shell'
import { FidsPanel, SggPanel } from './StagePanels'
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
    expect(q.getByText('통과')).toBeTruthy()
  })
  it('검정 칩에 차분 상관(인천)을 담는다', () => {
    render(<Board data={data} nat="대만" />)
    const chip = within(screen.getByRole('row', { name: '청주공항 대만' })).getByText('통과').closest('[data-ui="CHP-01"]')!
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
  it('74,702 → 66,903, 일본 −10,440이 가장 큰 몫', () => {
    const { container } = render(<Decomposition data={data} />)
    expect(screen.getByText(/74,702원 → .* 66,903원/)).toBeTruthy()
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
    expect(screen.getByText(/추가 카드소비 ÷ 사업비 1억 원 = 2\.0~11\.2배\(단순 배수, 경제적 파급효과 아님\)/)).toBeTruthy()
    expect(screen.getByText('추가 카드소비 ÷ 사업비 (단순 배수, 경제적 파급효과 아님)')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /체류 0\.5일 증가 시/ })).toBeTruthy()
  })
})

describe('TXT-01 · 탭 주소', () => {
  it('메타가 없으면 null → 기준일 확인 필요', () => {
    expect(asofText(null)).toBeNull()
    expect(asofText(meta)).toContain('입국 2026.07까지 · 데이터랩 2026.08 추출')
  })
  it('명세서 앵커도 해당 탭으로 연다', () => {
    expect(tabFromHash('#map')).toBe('map')
    expect(tabFromHash('#overview')).toBe('map')
    expect(tabFromHash('#sgg')).toBe('map')
    expect(tabFromHash('#method')).toBe('data')
    expect(tabFromHash('#report')).toBe('report')
    expect(tabFromHash('')).toBe('map')
    expect(canonicalHash('#overview')).toBe('#map')
    expect(canonicalHash('#sgg')).toBe('#map')
    expect(canonicalHash('#effect')).toBeNull()
  })
})

describe('PNL-02 · ST-09', () => {
  it('검증 6종을 모두 표시', () => {
    render(<Validations meta={meta} />)
    for (const v of meta.report.validations) expect(screen.getByText(`${v.id} ${v.title}`)).toBeTruthy()
    expect(screen.getByText(`데이터 점검 ${meta.report.checks.length}항목 · 모두 통과`)).toBeTruthy()
    expect(screen.queryByText(/시도-시군구 불일치/)).toBeNull()
  })
  it('불일치가 있으면 경고 배지', () => {
    const bad: Meta = { ...meta, report: { ...meta.report, consistency: { ...meta.report.consistency, mismatch: 2 } } }
    render(<Validations meta={bad} />)
    expect(screen.getByText(/시도-시군구 불일치 2건/)).toBeTruthy()
  })
})

describe('지도 패널', () => {
  const sgg = read<import('../lib/types').SggData>('sgg.json')
  it('1장면: 제목·안내판 4행·비교 한 줄', () => {
    render(<FidsPanel data={data} meta={meta} nat="대만" selected={null} onSelect={() => {}} month={null} onMonth={() => {}} onScene={() => {}} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('입국은 2.1배로, 1인당 소비는 그대로.')
    expect(screen.getAllByRole('row').filter((r) => r.getAttribute('aria-label'))).toHaveLength(4)
    expect(screen.getByText('청주 입국 대만인 1인당 충북 카드소비는 김해→부산의 8.4%, 체류는 김해의 47%')).toBeTruthy()
    expect(screen.getByRole('button', { name: '▶ 월별 재생' })).toBeTruthy()
  })
  it('2장면: 값 제목·공항 반경 숙박·시군구 표', () => {
    render(<SggPanel data={data} sgg={sgg} meta={meta} nat="대만" active={null} onHover={() => {}} onPin={() => {}} onBack={() => {}} onToast={() => {}} boundaryError={false} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('방문 최다 청원구(공항) 8,388명/월 · 방문 1회당 소비 최대 흥덕구 29,321원(청원구의 14.8배)')
    expect(screen.getByText('청주공항 반경 5km 숙박업소 9곳(호텔 0) · 10km 258곳(호텔 17)')).toBeTruthy()
    const first = screen.getAllByRole('row')[1]
    expect(first.textContent).toContain('청주시 청원구 (공항)')
    expect(first.textContent).toContain('8,388')
    expect(first.textContent).toContain('1,975원')
  })
})

describe('건물 레이어(지시서 8장)', () => {
  const sgg = read<SggData>('sgg.json')
  const index = read<BuildingIndex>('buildings/index.json')
  const heung = read<BuildingFile>('buildings/43113.json')
  const lodging = data.airports.find((a) => a.id === data.target)!.lodging
  const noop = () => {}
  it('최대 줌: 끄면 12 · 켜면 17, 보호구역 3km', () => {
    expect(maxZoomFor(false)).toBe(12)
    expect(maxZoomFor(true)).toBe(17)
    expect(index.protect_km).toBe(PROTECT_KM)
  })
  it('고르기 전: 가까이 볼 곳 7곳 + 공항 반경 숙박 한 줄(산출표 값 그대로)', () => {
    render(<BuildingPanel index={index} error={false} sgg={sgg} nat="대만" zoom={9} picked={null} lodging={lodging} onJump={noop} onClear={noop} onOff={noop} />)
    expect(screen.getAllByRole('button').filter((b) => /\d동$/.test(b.textContent ?? ''))).toHaveLength(7)
    expect(screen.getByText('청주공항 반경 5km 숙박업소 9곳(호텔 0) · 10km 258곳(호텔 17)')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('줌 14부터')
  })
  it('건물을 고르면 주용도·층수·연도·공항 거리·업소, 외국인 값은 「시군구 평균」만', () => {
    const f = heung.features.find((x) => x.properties.k === 'lodging' && x.properties.n[0] > 0)!
    render(<BuildingPanel index={index} error={false} sgg={sgg} nat="대만" zoom={15} picked={{ p: f.properties, cd: '43113' }} lodging={lodging} onJump={noop} onClear={noop} onOff={noop} />)
    expect(screen.getByText('주용도').nextSibling?.textContent).toBe('숙박시설')
    expect(screen.getByText('청주공항까지 직선거리').nextSibling?.textContent).toBe(`${f.properties.km.toFixed(1)}km`)
    expect(screen.getByText('방문 1회당 카드소비(시군구 평균)').nextSibling?.textContent).toBe('29,321원')
    expect(screen.getByText('월평균 방문(시군구 평균)')).toBeTruthy()
    expect(document.body.textContent).toContain('건물별 외국인 방문·소비 값은 없습니다')
  })
  it('건물 이름이 없으면 대표 업소 이름으로 부른다', () => {
    const p = heung.features[0].properties
    expect(buildingTitle({ ...p, nm: null, shops: [['메리제인호텔', '숙박']] })).toBe('메리제인호텔 건물')
    expect(buildingTitle({ ...p, nm: null, shops: [], use: '숙박시설' })).toBe('이름 없는 숙박시설')
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
