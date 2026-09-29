import { copyText, downloadText } from '../lib/clipboard'

interface Props {
  text: string
  filename: string
  onToast: (msg: string) => void
  label?: string
}

/** 보고 문안 미리보기 + 복사·저장. 한글에 붙여 넣으면 개조식 기호와 들여쓰기가 그대로 들어간다. */
export function CopyBox({ text, filename, onToast, label = '문안' }: Props) {
  return (
    <div className="doc">
      <div className="doc-bar">
        <span>{label}</span>
        <div className="doc-act">
          <button
            type="button"
            className="btn sm"
            onClick={async () => onToast((await copyText(text)) ? '복사했습니다. 한글 문서에 붙여 넣으세요.' : '복사하지 못했습니다. 문안을 직접 선택해 복사하세요.')}
          >
            복사
          </button>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => {
              downloadText(filename, text)
              onToast(`${filename}을 저장했습니다.`)
            }}
          >
            .txt 저장
          </button>
        </div>
      </div>
      <pre className="doc-body" tabIndex={0}>
        {text}
      </pre>
    </div>
  )
}
