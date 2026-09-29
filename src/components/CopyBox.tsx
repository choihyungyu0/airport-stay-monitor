import { useState } from 'react'
import { copyText, downloadText } from '../lib/clipboard'
import { downloadHwpx } from '../lib/hwpx'
import type { ReportDoc } from '../lib/report'

interface Props {
  text: string
  /** 파일 이름(확장자 없이). .hwpx·.txt를 붙여 저장한다. */
  filename: string
  onToast: (msg: string) => void
  label?: string
  /** 있으면 한글 파일(.hwpx) 저장 버튼을 보인다 */
  doc?: ReportDoc | null
}

/** 보고 문안 미리보기 + 한글 파일·복사·.txt 저장. 세 가지 모두 같은 문서 구조에서 나온다. */
export function CopyBox({ text, filename, onToast, label = '문안', doc }: Props) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="doc">
      <div className="doc-bar">
        <span>{label}</span>
        <div className="doc-act">
          {doc && (
            <button
              type="button"
              className="btn sm"
              data-ui="BTN-02"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await downloadHwpx(doc, `${filename}.hwpx`)
                  onToast(`${filename}.hwpx를 저장했습니다. 한글에서 바로 열립니다.`)
                } catch (e) {
                  onToast(`한글 파일을 만들지 못했습니다(${e instanceof Error ? e.message : '알 수 없는 오류'}). 복사나 .txt 저장을 쓰세요.`)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? '만드는 중…' : '한글 파일(.hwpx)'}
            </button>
          )}
          <button
            type="button"
            className="btn sm ghost"
            onClick={async () => onToast((await copyText(text)) ? '복사했습니다. 한글 문서에 붙여 넣으세요.' : '복사하지 못했습니다. 문안을 직접 선택해 복사하세요.')}
          >
            복사
          </button>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => {
              downloadText(`${filename}.txt`, text)
              onToast(`${filename}.txt를 저장했습니다.`)
            }}
          >
            .txt
          </button>
        </div>
      </div>
      <pre className="doc-body" tabIndex={0}>
        {text}
      </pre>
    </div>
  )
}
