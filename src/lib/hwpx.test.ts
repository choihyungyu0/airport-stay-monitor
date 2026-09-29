import JSZip from 'jszip'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildHwpx } from './hwpx'
import { effectDoc, halfDoc, monthlyDoc, type ReportDoc } from './report'
import { computeScenario } from './scenario'
import type { Indicators, Meta, SggData } from './types'

const read = <T,>(name: string): T => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8')) as T
const data = read<Indicators>('indicators.json')
const sgg = read<SggData>('sgg.json')
const meta = read<Meta>('meta.json')
const template = readFileSync(resolve(process.cwd(), 'public/templates/report.hwpx'))
const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
const today = new Date(2026, 8, 29)

const docs: [string, ReportDoc][] = [
  ['월간동향', monthlyDoc(data, meta, today)],
  ['반기분석_대만', halfDoc(data, sgg, meta, '대만', computeScenario(data, '대만', 0.5, 'pus'), today)],
  ['체류효과_대만', effectDoc(data, meta, '대만', computeScenario(data, '대만', 1, 'pus', 60000)!, 'pus', true, 3, today)],
]

describe('한글(.hwpx) 내보내기', () => {
  it.each(docs)('%s: 한글이 여는 ZIP·XML 구조', async (name, doc) => {
    const bytes = await buildHwpx(template, doc)
    // mimetype은 맨 앞 항목·비압축(STORE)이어야 한다
    const view = new DataView(bytes.buffer, bytes.byteOffset)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint16(8, true)).toBe(0)
    const nameLen = view.getUint16(26, true)
    expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLen))).toBe('mimetype')

    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file('mimetype')!.async('string')).toBe('application/hwp+zip')
    const xml = await zip.file('Contents/section0.xml')!.async('string')
    expect(xml.startsWith('<?xml')).toBe(true)
    expect(xml).not.toContain('{{')
    const dom = new DOMParser().parseFromString(xml, 'application/xml')
    expect(dom.getElementsByTagName('parsererror')).toHaveLength(0)

    const text = Array.from(dom.getElementsByTagNameNS(HP, 't')).map((t) => t.textContent ?? '')
    expect(text).toContain(doc.title)
    expect(text).toContain(doc.meta)
    for (const line of doc.lines.filter(Boolean)) expect(text).toContain(line.trimStart())
    for (const note of doc.notes) expect(text).toContain(note)

    const tbl = dom.getElementsByTagNameNS(HP, 'tbl')[0]
    const trs = Array.from(tbl.childNodes).filter((n) => (n as Element).localName === 'tr') as Element[]
    expect(trs).toHaveLength(doc.table!.rows.length + 1)
    expect(tbl.getAttribute('rowCnt')).toBe(String(doc.table!.rows.length + 1))
    trs.forEach((tr, r) => {
      for (const a of Array.from(tr.getElementsByTagNameNS(HP, 'cellAddr'))) expect(a.getAttribute('rowAddr')).toBe(String(r))
    })
    expect(text).toContain(doc.table!.header[0])
    expect(text).toContain(doc.table!.rows[0][0])

    // 다른 항목은 틀 그대로
    expect(Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()).toEqual(
      Object.keys((await JSZip.loadAsync(template)).files).filter((n) => !n.endsWith('/')).sort(),
    )

    // 수동 확인용(한글·python-hwpx로 열어 보기): HWPX_OUT=폴더 npx vitest run hwpx
    if (process.env.HWPX_OUT) {
      mkdirSync(process.env.HWPX_OUT, { recursive: true })
      writeFileSync(resolve(process.env.HWPX_OUT, `${name}.hwpx`), bytes)
    }
  })

  it('표 칸에는 단위 없이 값만', () => {
    const d = docs[1][1]
    expect(d.table!.header).toEqual(['공항', '권역', '연동 검정', '입국(명)', '입국 증감(%)', '1인당 카드소비(원)', '체류(인·일)'])
    expect(d.table!.rows[0]).toEqual(['청주공항', '충북', '채택', '27,700', '+105.3', '36,790', '2.55'])
    const e = docs[2][1]
    expect(e.table!.rows.map((r) => [r[0], r[5], r[6]])).toEqual([
      ['하한', '865.6', '2.9'], // 60,000명 × 1일 × 14,427.45원 = 865,647,000원
      ['상한', '4,862.9', '16.2'],
    ])
  })
})
