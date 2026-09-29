# -*- coding: utf-8 -*-
"""한글(.hwpx) 틀 점검. 틀은 scripts/make_hwpx_template.py(python-hwpx)로 만들고 커밋한다.
브라우저(src/lib/hwpx.ts)가 찾는 토큰이 그대로 있는지, 한글이 요구하는 ZIP 구조인지 확인한다."""
import zipfile
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "public" / "templates" / "report.hwpx"
TOKENS = ["{{TITLE}}", "{{META}}", "{{BODYH}}", "{{BODY}}", "{{BODYSUB}}", "{{CAPTION}}", "{{NOTE}}"] + \
         [f"{{{{H{i}}}}}" for i in range(7)] + [f"{{{{C{i}}}}}" for i in range(7)]


def test_template_zip_layout():
    with zipfile.ZipFile(TEMPLATE) as z:
        first = z.infolist()[0]
        assert first.filename == "mimetype"
        assert first.compress_type == zipfile.ZIP_STORED
        assert z.read("mimetype") == b"application/hwp+zip"
        names = set(z.namelist())
        assert {"Contents/section0.xml", "Contents/header.xml", "Contents/content.hpf", "META-INF/container.xml"} <= names


def test_template_tokens_once():
    with zipfile.ZipFile(TEMPLATE) as z:
        xml = z.read("Contents/section0.xml").decode("utf-8")
    for t in TOKENS:
        assert xml.count(t) == 1, t
    assert 'repeatHeader="1"' in xml  # 쪽이 넘어가면 표 머리글 반복
