"""Build an explicitly labeled screenshot walkthrough, not a live recording.

Requires ffmpeg with libx264 and drawtext. No browser or model calls.
Source screenshots are actual, public-book acceptance observations.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/acceptance/demo.mp4'
FFMPEG = os.environ.get('FFMPEG', shutil.which('ffmpeg') or 'ffmpeg')
FONT = os.environ.get('DEMO_FONT', '/System/Library/Fonts/Supplemental/Arial.ttf')
SCENES = [
    ('index-ready.png', '01  Upload once',
     'A complete 12-chapter book\nAlice in Wonderland\n56 PDF pages, 148 passages\n\nActual deployed app screenshots.\nThis is a screenshot walkthrough,\nnot a continuous screen recording.'),
    ('book-ready-details.png', '02  Inspect the library',
     'The original PDF and index stay\nin this browser, under this account.\n\n27 detected sections include\nfront matter and license headings.\nThe story has 12 actual chapters.'),
    ('microphone-level.png', '03  Speak a question',
     'Real microphone + synthetic speech\nplayed through computer speakers.\n\nDetected turns are transcribed,\nshown in chat, and sent automatically.\nFour questions produced four answers.'),
    ('answer-citations.png', '04  Read and hear the reply',
     'The rabbit took a watch from\nits waistcoat-pocket.\n\nThe answer cites PDF page 3.\nAutomatic playback was observed\nfor questions one and three.'),
    ('citation-passage.png', '05  Inspect the evidence',
     'The mushroom answer cites page 18.\nOne side makes Alice taller;\nthe other makes her shorter.\n\nOpen a citation, then View in book\nto find its saved source passage.'),
    ('pdf-page18.png', '06  Return to the PDF',
     'View PDF page opens the original\npage, rendered locally.\n\nRefresh and reopen preserved\nall four turns and 148 passages.\nNo re-upload was needed.'),
    ('unsupported-answer.png', '07  Respect missing evidence',
     'The book does not supply a salary\nfor Alice\'s father. No number invented.\n\nKnown issue: unnecessary citations.\nHuman barge-in and broad device\nreliability are not established here.'),
]

with tempfile.TemporaryDirectory(prefix='voicebook-demo-') as directory:
    temp = Path(directory)
    segments = []
    for i, (image, title, body) in enumerate(SCENES):
        title_file, body_file = temp / f'{i}-title.txt', temp / f'{i}-body.txt'
        title_file.write_text(title)
        body_file.write_text(body)
        segment = temp / f'{i}.mp4'
        # Keep the entire screenshot visible. Captions sit beside it, never cover it.
        filters = (
            'scale=540:620:force_original_aspect_ratio=decrease,'
            'pad=1280:720:30:50:color=0xf5f3eb,'
            f"drawtext=fontfile='{FONT}':textfile='{title_file}':expansion=none:"
            'fontcolor=0x173e33:fontsize=32:x=610:y=105,'
            f"drawtext=fontfile='{FONT}':textfile='{body_file}':expansion=none:"
            'fontcolor=0x34483f:fontsize=24:line_spacing=14:x=610:y=185,'
            f"drawtext=fontfile='{FONT}':text='VOICEBOOK  /  ACCEPTANCE WALKTHROUGH  /  19 OCT 2026':"
            'expansion=none:fontcolor=0x617269:fontsize=16:x=610:y=640'
        )
        subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1',
                        '-framerate', '2', '-i', str(ROOT / 'docs/acceptance/images' / image),
                        '-vf', filters, '-t', '10', '-r', '24', '-an', '-c:v', 'libx264',
                        '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', str(segment)], check=True)
        segments.append(segment)
    listing = temp / 'segments.txt'
    listing.write_text(''.join(f"file '{segment}'\n" for segment in segments))
    subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat',
                    '-safe', '0', '-i', str(listing), '-c', 'copy', '-movflags', '+faststart', str(OUT)], check=True)
print(f'{OUT}: 70-second silent screenshot walkthrough, {OUT.stat().st_size} bytes')
