"""Copy existing book text, LlamaIndex chunks and vectors into an offline bundle.

Never calls an API, runs a splitter, imports the source app, or reads its secrets.
Usage: python3 scripts/export-copilot-library.py SOURCE_DIRECTORY OUTPUT_FILE
"""
import hashlib
import json
import math
import re
import sqlite3
import sys
from pathlib import Path


def export_library(source, destination):
    root = Path(source).resolve()
    target = Path(destination).resolve()
    if target.exists():
        raise ValueError("Output already exists; choose a new destination.")
    directory = root / "data/llamaindex_storage/vector"
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest["embedding_model"] != "text-embedding-v4":
        raise ValueError("Expected the original text-embedding-v4 index.")
    nodes = json.loads((directory / "docstore.json").read_text())["docstore/data"]
    vectors = json.loads((directory / "default__vector_store.json").read_text())["embedding_dict"]
    with sqlite3.connect((root / "data/assistant.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        documents = db.execute("SELECT id, title, content FROM documents ORDER BY id").fetchall()
    books = []
    for document_id, title, text in documents:
        # LlamaIndex may normalize punctuation while joining sentences.
        normalized_text = re.sub(r"[\W_]+", "", text)
        rows = []
        for node_id, record in nodes.items():
            node = record["__data__"]
            if node["metadata"]["document_id"] == document_id:
                rows.append((node_id, node))
        rows.sort(key=lambda item: item[1]["metadata"]["chunk_index"])
        if not rows:
            raise ValueError(f"Missing existing index for {title}; refusing to re-index.")
        passages = []
        for node_id, node in rows:
            vector = vectors[node_id]
            if len(vector) != 1024 or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in vector):
                raise ValueError(f"Invalid source vector for {title}.")
            # Verify the index still belongs to the text we are copying.
            if re.sub(r"[\W_]+", "", node["text"]) not in normalized_text:
                raise ValueError(f"Stale source index for {title}.")
            number = node["metadata"]["chunk_index"] + 1
            passages.append({"id": node_id, "sectionTitle": f"{title.removesuffix('.pdf')} · 分块 {number}",
                             "pageStart": 0, "pageEnd": 0, "text": node["text"], "embedding": vector})
        digest = hashlib.sha256((str(document_id) + text).encode()).hexdigest()[:24]
        books.append({"id": "copilot-" + digest, "name": title.removesuffix(".pdf"),
                      "embeddingModel": manifest["embedding_model"], "embeddingDimensions": 1024,
                      "fullText": text, "index": passages})
    if sum(len(book["index"]) for book in books) != manifest["node_count"]:
        raise ValueError("Source manifest count mismatch.")
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("x", encoding="utf-8") as file:
        json.dump({"format": "voicebook-library", "version": 1, "books": books}, file, ensure_ascii=False, separators=(",", ":"))
    print(json.dumps({"books": len(books), "passages": sum(len(b["index"]) for b in books),
                      "model": manifest["embedding_model"], "bytes": target.stat().st_size,
                      "output": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    export_library(*sys.argv[1:])
