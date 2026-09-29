import { cleanup, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Indicators, Meta } from '../lib/types'
import { Board } from './Board'
import { Decomposition } from './Decomposition'
import { Validations } from './Evidence'
import { asofText, Hero } from './Header'

const read = <T,>(name: string): T => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8')) as T
const data = read<Indicators>('indicators.json')
const meta = read<Meta>('meta.json')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-01 공항별 요약(출발 안내판)', () => {
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
    const row = screen.getByRole('row', { name: '무안공항 자료 없음' })
    expect(within(row).getByText('MWX')).toBeTruthy()
  })
})

describe('첫 화면 결론', () => {
  it('대만: 입국은 2.1배로, 1인당 소비는 그대로', () => {
    render(<Hero data={data} meta={meta} nat="대만" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('입국은 2.1배로,1인당 소비는 그대로.')
    expect(screen.getByText(/김해공항 입국자는 부산에서 12배인 440,089원/)).toBeTruthy()
    expect(screen.getByText(/입국 2026\.07까지 · 데이터랩 2026\.08 추출/)).toBeTruthy()
  })
  it('일본: 1인당 소비는 19% 줄었다', () => {
    render(<Hero data={data} meta={meta} nat="일본" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('1인당 소비는 19% 줄었다.')
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

describe('TXT-01 · ST-10 기준 시점', () => {
  it('메타가 없으면 null → 기준일 확인 필요', () => {
    expect(asofText(null)).toBeNull()
  })
})

describe('PNL-02 · ST-09', () => {
  it('검증 6종을 모두 표시', () => {
    render(<Validations meta={meta} />)
    expect(meta.report.validations.map((v) => v.id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', 'V6'])
    for (const v of meta.report.validations) expect(screen.getByText(`${v.id} ${v.title}`)).toBeTruthy()
    expect(screen.getByText(/데이터 점검 8항목 · 모두 통과/)).toBeTruthy()
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
