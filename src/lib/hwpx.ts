import JSZip from 'jszip'
import type { ReportDoc } from './report'

// 한글(.hwpx) 내보내기. python-hwpx로 만든 틀(public/templates/report.hwpx, scripts/make_hwpx_template.py)을 받아
// Contents/section0.xml의 {{토큰}} 문단과 표 행을 복제·치환한다. 문서는 서버를 거치지 않는다.
// HWPX(OWPML, KS X 6101)는 ZIP이며 mimetype 항목은 맨 앞·비압축이어야 한다.

const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
const SECTION = 'Contents/section0.xml'
const ROW_HEIGHT = 3600

const byLocal = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS(HP, name))

/** 문단의 첫 글자 칸(hp:t)에 글을 넣는다. 나머지 글자 칸은 비운다. */
function setText(p: Element, text: string) {
  const ts = byLocal(p, 't')
  if (!ts.length) return
  ts[0].textContent = text
  for (const t of ts.slice(1)) t.textContent = ''
}

const newId = () => String(Math.floor(Math.random() * 2_000_000_000) + 1)

/** 글이 정확히 token인 최상위 문단(표 안 문단 제외) */
function tokenParagraph(doc: Document, token: string): Element {
  const p = byLocal(doc, 'p').find((el) => el.textContent?.trim() === token && !hasAncestor(el, 'tc'))
  if (!p) throw new Error(`HWPX 틀에 ${token} 문단이 없습니다`)
  return p
}

function hasAncestor(el: Element, local: string): boolean {
  for (let n = el.parentElement; n; n = n.parentElement) if (n.localName === local && n.namespaceURI === HP) return true
  return false
}

/** 틀 문단을 줄마다 복제해 그 자리에 넣고 틀은 지운다. pick으로 줄마다 다른 틀(소제목·본문)을 고른다. */
function expand(templates: Element[], lines: string[], pick: (line: string) => number) {
  const anchor = templates[0]
  const parent = anchor.parentNode!
  for (const line of lines) {
    const clone = templates[pick(line)].cloneNode(true) as Element
    clone.setAttribute('id', newId())
    setText(clone, line)
    parent.insertBefore(clone, anchor)
  }
  for (const t of templates) t.parentNode?.removeChild(t)
}

function fillTable(doc: Document, header: string[], rows: string[][]) {
  const cells = (tr: Element) => Array.from(tr.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === 'tc')
  const tbl = byLocal(doc, 'tbl')[0]
  if (!tbl) throw new Error('HWPX 틀에 표가 없습니다')
  const trs = Array.from(tbl.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === 'tr')
  const [head, body] = trs
  cells(head).forEach((tc, i) => byLocal(tc, 'p').forEach((p, k) => k === 0 && setText(p, header[i] ?? '')))
  // 틀의 첫 칸은 왼쪽 정렬(글자), 마지막 칸은 오른쪽 정렬(숫자). 값에 따라 문단 모양을 고른다.
  const bodyCells = cells(body)
  const leftPr = byLocal(bodyCells[0], 'p')[0]?.getAttribute('paraPrIDRef')
  const rightPr = byLocal(bodyCells[bodyCells.length - 1], 'p')[0]?.getAttribute('paraPrIDRef')
  const numeric = (v: string) => /^[+−-]?[\d,]+(\.\d+)?$/.test(v) || v === '-'
  rows.forEach((row, r) => {
    const tr = body.cloneNode(true) as Element
    cells(tr).forEach((tc, i) => {
      byLocal(tc, 'p').forEach((p, k) => {
        if (k === 0) {
          const v = row[i] ?? ''
          setText(p, v)
          p.setAttribute('id', newId())
          const pr = numeric(v) ? rightPr : leftPr
          if (pr) p.setAttribute('paraPrIDRef', pr)
        }
      })
      byLocal(tc, 'cellAddr').forEach((a) => a.setAttribute('rowAddr', String(r + 1)))
    })
    tbl.insertBefore(tr, body)
  })
  tbl.removeChild(body)
  const n = rows.length + 1
  tbl.setAttribute('rowCnt', String(n))
  const sz = Array.from(tbl.childNodes).find((c): c is Element => c.nodeType === 1 && (c as Element).localName === 'sz')
  sz?.setAttribute('height', String(n * ROW_HEIGHT))
}

/** 틀(ArrayBuffer)과 문서 구조로 .hwpx 바이트를 만든다. 브라우저·테스트(jsdom) 모두에서 돈다. */
export async function buildHwpx(template: ArrayBuffer | Uint8Array, doc: ReportDoc): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(template)
  const src = await zip.file(SECTION)!.async('string')
  const decl = src.match(/^<\?xml[^>]*\?>/)?.[0] ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  const dom = new DOMParser().parseFromString(src, 'application/xml')
  if (dom.getElementsByTagName('parsererror').length) throw new Error('HWPX 틀 XML을 읽지 못했습니다')

  setText(tokenParagraph(dom, '{{TITLE}}'), doc.title)
  setText(tokenParagraph(dom, '{{META}}'), doc.meta)
  // 들여쓰기는 문단 모양(내어쓰기)이 맡으므로 줄 앞 공백은 뺀다. □ 소제목 · - 세부 · 나머지(○·빈 줄) 본문
  const lines = doc.lines.map((l) => l.trimStart())
  expand(
    [tokenParagraph(dom, '{{BODY}}'), tokenParagraph(dom, '{{BODYH}}'), tokenParagraph(dom, '{{BODYSUB}}')],
    lines,
    (l) => (l.startsWith('□') ? 1 : l.startsWith('-') ? 2 : 0),
  )
  expand([tokenParagraph(dom, '{{NOTE}}')], doc.notes.map((l) => l.trimStart()), () => 0)
  const cap = tokenParagraph(dom, '{{CAPTION}}')
  if (doc.table && doc.table.rows.length) {
    setText(cap, doc.table.caption)
    fillTable(dom, doc.table.header, doc.table.rows)
  } else {
    // 표가 없으면 표 제목과 표를 함께 뺀다
    const tbl = byLocal(dom, 'tbl')[0]
    let holder: Node | null = tbl
    while (holder && !(holder.nodeType === 1 && (holder as Element).localName === 'p' && !hasAncestor(holder as Element, 'tc'))) holder = holder.parentNode
    holder?.parentNode?.removeChild(holder)
    cap.parentNode?.removeChild(cap)
  }

  let xml = new XMLSerializer().serializeToString(dom)
  xml = xml.replace(/\{\{[A-Z0-9_]+\}\}/g, '')
  if (!xml.startsWith('<?xml')) xml = `${decl}\n${xml}`

  const out = new JSZip()
  const mime = zip.file('mimetype')
  if (mime) out.file('mimetype', await mime.async('uint8array'), { compression: 'STORE' })
  for (const name of Object.keys(zip.files)) {
    if (name === 'mimetype' || zip.files[name].dir) continue
    if (name === SECTION) out.file(name, xml, { compression: 'DEFLATE' })
    else out.file(name, await zip.files[name].async('uint8array'), { compression: 'DEFLATE' })
  }
  return out.generateAsync({ type: 'uint8array', mimeType: 'application/hwp+zip' })
}

/** 틀을 받아 문서를 만들고 내려받는다. */
export async function downloadHwpx(doc: ReportDoc, filename: string): Promise<void> {
  const res = await fetch(`${import.meta.env.BASE_URL}templates/report.hwpx`)
  if (!res.ok) throw new Error(`한글 틀을 받지 못했습니다(${res.status})`)
  const bytes = await buildHwpx(await res.arrayBuffer(), doc)
  const blob = new Blob([bytes as BlobPart], { type: 'application/hwp+zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.hwpx') ? filename : `${filename}.hwpx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
