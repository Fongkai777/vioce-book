"""Typeset the public-domain Gutenberg #11 text for reproducible upload QA.

No network/model calls. Source text and the full Gutenberg license are retained.
Requires reportlab and pypdf; output is deliberately separate from private books.
"""
from pathlib import Path
import hashlib
import json
import os
import re
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/acceptance/source/pg11.txt'
OUTPUT = ROOT / 'output/pdf/alice-in-wonderland.pdf'
MANIFEST = ROOT / 'docs/acceptance/alice-manifest.json'
source_bytes = SOURCE.read_bytes()
source = source_bytes.decode('utf-8-sig').replace('\r\n', '\n')
matches = list(re.finditer(r'^CHAPTER ([IVX]+)\.\n([^\n]+)\n', source, re.M))
assert len(matches) == 12, 'Expected the 12 body chapter headings, not the contents list'
end = source.index('*** END OF THE PROJECT GUTENBERG EBOOK')
chapters = []
for i, match in enumerate(matches):
    finish = matches[i + 1].start() if i + 1 < len(matches) else end
    chapters.append({'number': i + 1, 'roman': match[1], 'title': match[2],
                     'text': source[match.end():finish].strip()})

# Use a supplied font path for portable regeneration; the committed PDF is fixed.
font = os.environ.get('ACCEPTANCE_FONT', '/System/Library/Fonts/Supplemental/Georgia.ttf')
bold = os.environ.get('ACCEPTANCE_BOLD_FONT', '/System/Library/Fonts/Supplemental/Georgia Bold.ttf')
pdfmetrics.registerFont(TTFont('Reader', font))
pdfmetrics.registerFont(TTFont('ReaderBold', bold))
ink, accent = colors.HexColor('#23382f'), colors.HexColor('#1c5b48')
body_style = ParagraphStyle('Body', fontName='Reader', fontSize=10.5, leading=15.2,
    textColor=ink, spaceAfter=7, allowWidows=0, allowOrphans=0)
title_style = ParagraphStyle('Title', fontName='ReaderBold', fontSize=32, leading=39,
    textColor=accent, spaceAfter=22)
chapter_style = ParagraphStyle('Chapter', fontName='ReaderBold', fontSize=19, leading=25,
    textColor=accent, spaceAfter=22)
small_style = ParagraphStyle('Small', fontName='Reader', fontSize=8.5, leading=12.2,
    textColor=ink, spaceAfter=8)
toc_style = ParagraphStyle('Contents', parent=body_style, fontSize=11, leading=19)

def paragraph(text, style=body_style):
    # Preserve lexical content; Gutenberg underscores mark emphasis in plain text.
    clean = re.sub(r'\s+', ' ', text).strip()
    clean = re.sub(r'_([^_]+)_', r'\1', clean)
    return Paragraph(escape(clean), style)

def blocks(text, style=body_style):
    return [paragraph(block, style) for block in re.split(r'\n\s*\n', text) if block.strip()]

story = [Spacer(1, 55), Paragraph("Alice's Adventures<br/>in Wonderland", title_style),
    paragraph('Lewis Carroll', chapter_style),
    paragraph('Complete text edition · 12 chapters', body_style), Spacer(1, 20),
    paragraph('Voicebook reproducible PDF upload fixture', small_style),
    paragraph('Text source: Project Gutenberg eBook #11, updated 26 June 2025. '
              'Credits: Arthur DiBianca and David Widger. Source and license are included.', small_style),
    paragraph('https://www.gutenberg.org/ebooks/11', small_style),
    paragraph('Typeset for this acceptance test on 19 October 2026. This is a new text-only '
              'layout, not a facsimile of a historical print edition. PDF page numbers refer '
              'only to this file. No story chapters have been abbreviated.', small_style),
    paragraph('Project Gutenberg lists this work as public domain in the USA. Readers '
              'outside the USA should check applicable local law and the appended license.', small_style),
    PageBreak(), Paragraph('Contents', chapter_style)]
for c in chapters:
    story.append(paragraph(f"{c['number']:02d}   {c['title']}", toc_style))
story.extend([Spacer(1, 20), paragraph('The license appendix follows chapter twelve. '
    'Use the PDF page counter when checking answer citations.', small_style)])
for c in chapters:
    story.extend([PageBreak(), paragraph(f"CHAPTER {c['roman']}. {c['title']}", chapter_style)])
    story.extend(blocks(c['text']))
story.extend([PageBreak(), paragraph('Source notice and license', chapter_style)])
story.extend(blocks(source[:source.index('*** START OF')], small_style))
story.extend(blocks(source[end:], small_style))

def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#d6dfd8'))
    canvas.line(50, 40, 545, 40)
    canvas.setFont('Reader', 8)
    canvas.setFillColor(accent)
    canvas.drawString(50, 27, "Alice's Adventures in Wonderland | Lewis Carroll")
    canvas.drawRightString(545, 27, str(document.page))
    canvas.restoreState()

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(OUTPUT), pagesize=(595.28, 841.89),
    rightMargin=50, leftMargin=50, topMargin=53, bottomMargin=57,
    title="Alice's Adventures in Wonderland", author='Lewis Carroll',
    subject='Complete twelve-chapter text. Voicebook acceptance fixture. Gutenberg #11.')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
reader = PdfReader(OUTPUT)
texts = [page.extract_text() for page in reader.pages]
for c in chapters:
    c['pageStart'] = next(i + 1 for i, text in enumerate(texts)
                          if f"CHAPTER {c['roman']}." in text)
license_start = next(i + 1 for i, text in enumerate(texts) if 'Source notice and license' in text)
for i, c in enumerate(chapters):
    c['pageEnd'] = chapters[i + 1]['pageStart'] - 1 if i + 1 < 12 else license_start - 1
    del c['text']
manifest = {'title': "Alice's Adventures in Wonderland", 'author': 'Lewis Carroll',
    'sourceUrl': 'https://www.gutenberg.org/cache/epub/11/pg11.txt',
    'catalogUrl': 'https://www.gutenberg.org/ebooks/11', 'retrievedDate': '2026-10-19',
    'sourceSha256': hashlib.sha256(source_bytes).hexdigest(),
    'pdfSha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    'pdfFile': 'output/pdf/alice-in-wonderland.pdf', 'pdfPages': len(texts),
    'chapters': chapters, 'licensePageStart': license_start}
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'pages': len(texts), 'chapters': len(chapters),
                  'pdf': str(OUTPUT), 'sha256': manifest['pdfSha256']}, indent=2))
