# -*- coding: utf-8 -*-
"""보고 문안 HWPX 틀 생성기 (python-hwpx, Apache-2.0).

유효한 HWPX 골격을 한 번 만들어 public/templates/report.hwpx에 둔다. 브라우저(src/lib/hwpx.ts)가
Contents/section0.xml 안의 {{토큰}} 문단과 표 행을 복제·치환해 문서를 만든다. 문서는 서버를 거치지 않는다.

틀 구성(공문서 개조식 서식)
  {{TITLE}}      제목 — 16pt 굵게, 가운데
  {{META}}       기준 시점·작성일 — 9pt, 오른쪽
  {{BODYH}}      □ 소제목 — 11.5pt 굵게
  {{BODY}}       ○ 본문 — 11pt, ○ 뒤로 내어쓰기
  {{BODYSUB}}    - 세부 — 11pt, 한 단계 더 들여 내어쓰기
  {{CAPTION}}    표 제목 — 10pt 굵게
  표 2행 × 7열   첫 행 머리글 {{H0}}~{{H6}}(굵게·가운데·음영), 둘째 행 {{C0}}~{{C6}}
                 (C0은 왼쪽 정렬 = 글자 칸, C6은 오른쪽 정렬 = 숫자 칸; 브라우저가 값에 따라 골라 쓴다)
  {{NOTE}}       ※ 주석 — 9pt, ※ 뒤로 내어쓰기

표는 셀 병합 없이 첫 행을 머리글로 두고, 숫자 칸에는 단위를 넣지 않는다(단위는 머리글에).
실행: python scripts/make_hwpx_template.py
"""
import sys
from pathlib import Path

from hwpx.document import HwpxDocument

OUT = Path(__file__).resolve().parent.parent / "public" / "templates" / "report.hwpx"
COLS = 7


def build() -> HwpxDocument:
    d = HwpxDocument.new()
    d.page.set_margins(left=5670, right=5670, top=4252, bottom=4252)  # 좌우 20mm, 위아래 15mm

    run = d.styles.ensure_run
    title, head, body = run(bold=True, size=16), run(bold=True, size=11.5), run(size=11)
    small, cap = run(size=9, color="#555555"), run(bold=True, size=10)
    th, td = run(bold=True, size=9.5), run(size=9.5)

    def index_of(p):
        return next(i for i, q in enumerate(d.paragraphs) if q.element is p.element)

    # 앞 문단 모양을 물려받지 않게 하고, 들여쓰기·간격을 문단마다 모두 명시한다
    # (apply_paragraph_format은 넘긴 항목만 바꾸므로 빠뜨린 값은 앞 문단 것이 남는다).
    base = dict(alignment="LEFT", indent_left_mm=0, first_line_indent_mm=0,
                spacing_before_pt=0, spacing_after_pt=0, line_spacing_percent=160)

    def para(text, char_pr, **fmt):
        p = d.add_paragraph(text, char_pr_id_ref=char_pr, inherit_style=False)
        d.styles.apply_paragraph_format(paragraph_index=index_of(p), **{**base, **fmt})
        return p

    def para_pr(**fmt) -> str:
        """표 칸에 쓸 문단 모양 번호. 임시 문단에 서식을 입혀 번호를 얻고 문단은 지운다."""
        p = para("", body, **fmt)
        pid = d.paragraphs[index_of(p)].para_pr_id_ref
        d.paragraphs[index_of(p)].remove()
        return pid

    center, left, right = para_pr(alignment="CENTER"), para_pr(alignment="LEFT"), para_pr(alignment="RIGHT")

    para("{{TITLE}}", title, alignment="CENTER", spacing_after_pt=4)
    para("{{META}}", small, alignment="RIGHT", spacing_after_pt=10)
    para("{{BODYH}}", head, alignment="LEFT", spacing_before_pt=6, spacing_after_pt=2, line_spacing_percent=160)
    para("{{BODY}}", body, alignment="LEFT", indent_left_mm=6, first_line_indent_mm=-4.5, line_spacing_percent=170, spacing_after_pt=1)
    para("{{BODYSUB}}", body, alignment="LEFT", indent_left_mm=10, first_line_indent_mm=-3, line_spacing_percent=170)
    para("", body)
    para("{{CAPTION}}", cap, alignment="LEFT", spacing_before_pt=6, spacing_after_pt=3)

    t = d.add_table(2, COLS)
    for c in range(COLS):
        t.set_cell_text(0, c, "{{H%d}}" % c)
        t.set_cell_text(1, c, "{{C%d}}" % c)
        t.set_cell_shading(0, c, "#EEF1F4")
        for r, char_pr, pp in ((0, th, center), (1, td, left if c == 0 else right)):
            for p in t.cell(r, c).paragraphs:
                p.para_pr_id_ref = pp
                for x in p.runs:
                    x.char_pr_id_ref = char_pr
    # 머리글 행 표시와 쪽 넘김 시 머리글 반복(기계판독·인쇄)
    t.element.set("repeatHeader", "1")
    first_tr = next(e for e in t.element if e.tag.endswith("}tr"))
    for cell in first_tr:
        if cell.tag.endswith("}tc"):
            cell.set("header", "1")

    para("", body)
    para("{{NOTE}}", small, alignment="LEFT", indent_left_mm=4, first_line_indent_mm=-4, line_spacing_percent=150)
    return d


TOKENS = ("{{TITLE}}", "{{META}}", "{{BODYH}}", "{{BODY}}", "{{BODYSUB}}", "{{CAPTION}}", "{{H0}}", "{{C6}}", "{{NOTE}}")


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    d = build()
    issues = getattr(d.validate(), "issues", []) or []
    d.save_to_path(str(OUT))
    text = HwpxDocument.open(str(OUT)).text.plain()
    found = [t for t in TOKENS if t in text]
    print(f"{OUT.name}: {OUT.stat().st_size:,}B · 토큰 {len(found)}/{len(TOKENS)} · 검증 문제 {len(issues)}건")
    for i in issues[:10]:
        print("  -", i)
    return 0 if len(found) == len(TOKENS) and not issues else 1


if __name__ == "__main__":
    sys.exit(main())
