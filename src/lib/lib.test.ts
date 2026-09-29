import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCsv, csvCell } from './csv'
import { fmt, fmtEok, fmtHalf, fmtYm, signed, signedPct } from './format'
import { clampDays, computeScenario } from './scenario'
import { axisTop, buildSeries, dividerIndex, niceStep } from './series'
import { daysPhrase, decompCaption, decompRows, decompTitle, mapStory, times } from './story'
import type { Indicators, Meta, SggData } from './types'

const read = <T,>(name: string): T => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8')) as T
const data = read<Indicators>('indicators.json')
const sgg = read<SggData>('sgg.json')
const meta = read<Meta>('meta.json')

describe('format', () => {
  it('원·억·기간 표기', () => {
    expect(fmt(36790.4)).toBe('36,790')
    expect(fmt(null)).toBe('–')
    expect(fmtEok(199_820_183)).toBe('2.0억')
    expect(fmtYm('202607')).toBe('2026.07')
    expect(fmtYm(undefined)).toBeNull()
    expect(fmtHalf('2026H1')).toBe('2026 상반기')
    expect(signed(-10440)).toBe('−10,440')
    expect(signedPct(105.3)).toBe('+105%')
  })
})

describe('IND-06 시나리오', () => {
  it('청주 대만 0.5일 · 김해 비교 → +2.0억 ~ +11.2억', () => {
    const r = computeScenario(data, '대만', 0.5, 'pus')!
    expect(Math.round(r.perDayTarget)).toBe(14427)
    expect(Math.round(r.perDayCompare)).toBe(81048)
    expect(fmtEok(r.low)).toBe('2.0억')
    expect(fmtEok(r.high)).toBe('11.2억')
    expect(r.compareIsReference).toBe(false)
  })
  it('범위 밖 증가일은 0~2.0으로 막는다', () => {
    expect(clampDays(3)).toBe(2)
    expect(clampDays(-1)).toBe(0)
    expect(computeScenario(data, '대만', 9, 'pus')!.days).toBe(2)
  })
  it('제주 대만은 참고값으로 표시', () => {
    expect(computeScenario(data, '대만', 0.5, 'cju')!.compareIsReference).toBe(true)
  })
})

describe('UI-03 추이 계열', () => {
  it('참고값(제주)은 축 산정에서 뺀다', () => {
    const s = buildSeries(data, '대만', 'ratio')
    const withJeju = Math.max(...s.flatMap((x) => x.values.filter((v): v is number => v != null)))
    const { top } = axisTop(s, 'ratio')
    expect(s.find((x) => x.airport.id === 'cju')!.passed).toBe(false)
    const passedMax = Math.max(...s.filter((x) => x.passed).flatMap((x) => x.values.filter((v): v is number => v != null)))
    expect(top).toBeGreaterThanOrEqual(passedMax)
    expect(top).toBeLessThan(Math.max(withJeju, passedMax) + niceStep(passedMax / 5) + 1e-9 || Infinity)
  })
  it('입국자 수는 모든 공항으로 축을 잡는다', () => {
    const s = buildSeries(data, '대만', 'arr')
    const all = Math.max(...s.flatMap((x) => x.values.filter((v): v is number => v != null)))
    expect(axisTop(s, 'arr').top).toBeGreaterThanOrEqual(all)
  })
  it('외국인 정의 변경 구분선은 2024.12와 2025.01 사이', () => {
    const i = dividerIndex(data.months, data.definition_change)!
    expect(data.months[Math.floor(i)]).toBe('202412')
    expect(data.months[Math.ceil(i)]).toBe('202501')
  })
  it('niceStep', () => {
    expect(niceStep(0.7)).toBe(1)
    expect(niceStep(1800)).toBe(2000)
    expect(niceStep(0)).toBe(1)
  })
})

describe('UI-11 CSV', () => {
  it('UTF-8 BOM과 따옴표 처리', () => {
    const text = buildCsv(data, sgg, meta, '대만')
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).toContain('청주공항,충북,채택,36790,36316,2.55,3.06,27700,13494,105.3')
    expect(text).toContain('청주시 청원구,43114,8388,99418707,1975,Y,원천 시군구 행')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  })
})

describe('섹션 결론 문장(story)', () => {
  it('지도: 방문은 청원구(공항)에, 지갑은 흥덕구에서 — 15배', () => {
    const s = mapStory(sgg, '대만')!
    expect(s.visitTop.name).toBe('청원구')
    expect(s.spendTop.name).toBe('흥덕구')
    expect(times(s.ratio!)).toBe('14.8배')
    expect(s.title).toBe('방문은 청원구(공항)에 몰리고, 지갑은 흥덕구에서 열립니다.')
  })
  it('요인분해: 가장 큰 몫은 일본 1인당 감소', () => {
    const d = data.decomposition
    if (d.skipped) throw new Error('분해 생략됨')
    expect(decompTitle(d)).toBe('일본 입국자의 1인당 소비 감소(−10,440원)입니다.')
    expect(decompCaption(d)).toContain('74,701원 → 66,903원(−7,798원, −10.4%)')
    expect(decompRows(d).filter((r) => r.lead).map((r) => r.key)).toEqual(['일본'])
  })
  it('시나리오 문구', () => {
    expect(daysPhrase(0.5)).toBe('반나절 더 머물면')
    expect(daysPhrase(2)).toBe('이틀 더 머물면')
  })
})
