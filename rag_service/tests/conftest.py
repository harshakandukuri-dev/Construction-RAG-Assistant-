import hashlib
import math
import pathlib
import re
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import rag  # noqa: E402


class StubEmbedder:
    """Deterministic bag-of-words vectors so tests never download a model."""

    DIM = 256

    def encode(self, texts, normalize_embeddings=True):
        rows = []
        for text in texts:
            vec = [0.0] * self.DIM
            for word in re.findall(r"[a-z0-9]+", text.lower()):
                vec[int(hashlib.md5(word.encode()).hexdigest(), 16) % self.DIM] += 1.0
            norm = math.sqrt(sum(x * x for x in vec)) or 1.0
            rows.append([x / norm for x in vec])
        return np.array(rows)


@pytest.fixture()
def store(tmp_path, monkeypatch):
    """A fresh, empty vector store in a temporary folder."""
    monkeypatch.setattr(rag, "CHROMA_PATH", str(tmp_path / "chroma"))
    monkeypatch.setattr(rag, "_collection", None)
    monkeypatch.setattr(rag, "_embedder", StubEmbedder())
    rag._indexes.clear()
    return rag
