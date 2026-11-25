import pytest

import rag

ROOF = (
    "The roof waterproofing uses a 3 mm bituminous membrane laid over the screed. "
    "Laps must be at least 100 mm and sealed with a torch-on finish. "
    "Clause 4.2.1 requires a flood test of 48 hours before the final layer."
)
FLOOR = (
    "Lobby flooring is 600 x 600 mm polished vitrified tile with a 3 mm grout joint. "
    "Tiles are fixed with polymer-modified adhesive over a levelled screed."
)
FACADE = (
    "The facade cladding is 12 mm fibre cement board on an aluminium sub-frame. "
    "Board joints are 8 mm and sealed with a weatherproof sealant."
)


def load(store):
    store.add_chunks([(1, ROOF), (2, FACADE)], "doc-ext", "p1", "exterior", "Exterior spec.pdf")
    store.add_chunks([(7, FLOOR)], "doc-int", "p1", "interior", "Interior spec.pdf")


# ---- chunking ------------------------------------------------------------- #

def test_chunk_text_respects_size_and_keeps_all_text():
    text = " ".join(f"Sentence number {i} describes the wall finish." for i in range(80))
    chunks = rag.chunk_text(text, size=300, overlap=60)
    assert len(chunks) > 5
    assert all(len(c) <= 300 for c in chunks)
    assert "Sentence number 79" in chunks[-1]


def test_chunk_text_overlaps_neighbours():
    text = " ".join(f"Item {i} is listed here." for i in range(60))
    chunks = rag.chunk_text(text, size=200, overlap=60)
    assert any(chunks[i].split()[-3:] == chunks[i + 1].split()[:3] or
               chunks[i].split()[-1] in chunks[i + 1] for i in range(len(chunks) - 1))


def test_chunk_text_handles_empty_and_unpunctuated_text():
    assert rag.chunk_text("") == []
    assert rag.chunk_text("   \n\n  ") == []
    long_run = "x" * 2500
    assert all(len(c) <= 900 for c in rag.chunk_text(long_run))


# ---- tokenizing and domain detection -------------------------------------- #

def test_tokenize_keeps_clause_numbers_and_codes():
    tokens = rag.tokenize("See clause 3.2.1 and grade M-25 concrete")
    assert "3.2.1" in tokens and "m-25" in tokens and "25" in tokens
    assert "and" not in tokens


@pytest.mark.parametrize(
    "question,expected",
    [
        ("What cladding is used on the facade?", "exterior"),
        ("Which tile is used for the kitchen floor finish?", "interior"),
        ("Tell me about the gate and boundary wall", "exterior"),
        ("How long is the contract?", None),
        ("Please investigate the schedule", None),  # 'gate' inside a word must not match
    ],
)
def test_detect_domain(question, expected):
    assert rag.detect_domain(question) == expected


# ---- retrieval ------------------------------------------------------------ #

def test_retrieve_finds_the_right_page(store):
    load(store)
    hits = store.retrieve("what membrane waterproofs the roof", "p1")
    assert hits and hits[0]["meta"]["page"] == 1
    assert hits[0]["meta"]["title"] == "Exterior spec.pdf"


def test_keyword_search_matches_clause_numbers(store):
    load(store)
    index = store.get_index("p1")
    top = index.scores("clause 4.2.1")[0][0]
    assert "4.2.1" in index.docs[top]


def test_unrelated_question_returns_nothing(store):
    load(store)
    assert store.retrieve("quantum chromodynamics lattice gauge", "p1") == []


def test_projects_are_isolated(store):
    load(store)
    assert store.retrieve("roof membrane", "another-project") == []


def test_domain_filter_keeps_general_documents(store):
    load(store)
    store.add_chunks([(1, "General notes: all dimensions are in millimetres unless stated.")],
                     "doc-gen", "p1", "general", "Notes.pdf")
    exterior = store.retrieve("tile grout joint", "p1", "exterior")
    assert all(h["meta"]["domain"] in ("exterior", "general") for h in exterior)
    interior = store.retrieve("tile grout joint", "p1", "interior")
    assert interior and interior[0]["meta"]["domain"] == "interior"


def test_removing_a_document_removes_its_chunks(store):
    load(store)
    store.remove_document("doc-int")
    assert store.retrieve("polished vitrified tile grout", "p1") == []
    assert store.retrieve("roof membrane", "p1")


def test_reindexing_replaces_instead_of_duplicating(store):
    load(store)
    before = store.get_collection().count()
    store.add_chunks([(7, FLOOR)], "doc-int", "p1", "interior", "Interior spec.pdf")
    assert store.get_collection().count() == before


# ---- answering ------------------------------------------------------------ #

def test_needs_rewrite_only_for_follow_ups():
    history = [{"role": "user", "content": "x"}]
    assert rag.needs_rewrite("what about its thickness?", history)
    assert not rag.needs_rewrite("what about its thickness?", [])
    long_q = "Describe the complete waterproofing build-up specified for the main podium roof slab"
    assert not rag.needs_rewrite(long_q, history)


def test_answer_events_streams_tokens_after_sources(store, monkeypatch):
    load(store)
    monkeypatch.setattr(rag, "ollama_stream", lambda messages: iter(["The membrane is ", "3 mm [S1]."]))
    events = list(rag.answer_events("what membrane waterproofs the roof", "p1"))
    assert [e["type"] for e in events] == ["meta", "token", "token", "done"]
    assert events[0]["found"] and events[0]["sources"][0]["title"] == "Exterior spec.pdf"
    assert events[0]["domain"] == "exterior"


def test_not_found_skips_the_model(store, monkeypatch):
    load(store)

    def boom(messages):
        raise AssertionError("the model must not be called when nothing is relevant")

    monkeypatch.setattr(rag, "ollama_stream", boom)
    events = list(rag.answer_events("quantum chromodynamics lattice gauge", "p1"))
    assert events[0]["found"] is False and events[1]["text"] == rag.NOT_FOUND


def test_prompt_strips_old_citations_from_history(store):
    hits = [{"meta": {"title": "A.pdf", "page": 3}, "text": "Some text.", "distance": 0.2}]
    history = [{"role": "assistant", "content": "It is 3 mm [S1] thick."}]
    messages = rag.build_messages("and the laps?", hits, history)
    assert messages[1]["content"] == "It is 3 mm thick."
    assert "[S1] A.pdf, page 3" in messages[-1]["content"]
