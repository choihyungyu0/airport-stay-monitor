import { cleanup, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Indicators, Meta } from '../lib/types'
import { AirportCards } from './AirportCards'
import { Decomposition } from './Decomposition'
import { asofText } from './Header'
import { ReportPanel } from './ReportPanel'

const read = <T,>(name: string): T => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8')) as T
const data = read<Indicators>('indicators.json')
const meta = read<Meta>('meta.json')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UI-01 공항별 요약 카드', () => {
  it('청주 대만 카드에 36,790원 · 2.55 · +105%', () => {
    render(<AirportCards data={data} nat="대만" />)
    const card = screen.getByRole('article', { name: '청주공항 대만' })
    expect(card.className).toContain('hl')
    const q = within(card)
    expect(q.getByText('36,790')).toBeTruthy()
    expect(q.getByText(/^2\.55/)).toBeTruthy()
    expect(q.getByText('+105%')).toBeTruthy()
    expect(q.getByText('연동 검정 통과')).toBeTruthy()
  })
  it('제주 대만은 참고값 칩(ST-05)', () => {
    render(<AirportCards data={data} nat="대만" />)
    expect(within(screen.getByRole('article', { name: '제주공항 대만' })).getByText('참고값')).toBeTruthy()
  })
  it('일본 선택 시 청주 ① 113,144원(UI-02)', () => {
    render(<AirportCards data={data} nat="일본" />)
    expect(within(screen.getByRole('article', { name: '청주공항 일본' })).getByText('113,144')).toBeTruthy()
  })
  it('자료 없는 공항은 자료 없음 카드(ST-04)', () => {
    const ext: Indicators = {
      ...data,
      airports: [...data.airports, { id: 'mwx', name: '무안', region: '전남', color: 'extra', role: 'compare', nat: { 대만: { status: '자료 없음' } } }],
    }
    render(<AirportCards data={ext} nat="대만" />)
    expect(screen.getByRole('article', { name: '무안공항 자료 없음' })).toBeTruthy()
  })
})

describe('UI-07 요인분해', () => {
  it('74,701 → 66,903, 일본 −10,440 강조', () => {
    const { container } = render(<Decomposition data={data} nat="대만" />)
    expect(screen.getByText('74,701원')).toBeTruthy()
    expect(screen.getByText('66,903원')).toBeTruthy()
    expect(container.querySelector('.mark')?.textContent).toBe('−10,440원')
  })
})

describe('TXT-01 · ST-10 기준 시점', () => {
  it('입국 2026.07까지 · 데이터랩 2026.08 추출', () => {
    expect(asofText(meta)).toContain('입국 2026.07까지 · 데이터랩 2026.08 추출')
  })
  it('메타가 없으면 null → 기준일 확인 필요', () => {
    expect(asofText(null)).toBeNull()
  })
})

describe('PNL-02 · ST-09', () => {
  it('검증 6종을 모두 표시', () => {
    render(<ReportPanel meta={meta} />)
    expect(meta.report.validations.map((v) => v.id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', 'V6'])
    for (const v of meta.report.validations) expect(screen.getByText(`${v.id} ${v.title}`)).toBeTruthy()
    expect(screen.queryByText(/시도-시군구 불일치/)).toBeNull()
  })
  it('불일치가 있으면 경고 배지', () => {
    const bad: Meta = { ...meta, report: { ...meta.report, consistency: { ...meta.report.consistency, mismatch: 2 } } }
    render(<ReportPanel meta={bad} />)
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
