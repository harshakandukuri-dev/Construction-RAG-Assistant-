"""Measure how well retrieval finds the right passage.

Usage:
    python evaluate.py PROJECT_ID eval_questions.json [-k 5]

PROJECT_ID is the project's id (shown in the browser address bar on the Documents
page, or in MongoDB). The questions file is a list like eval_questions.example.json.
A question counts as a hit when one of the top-k passages is on the expected page
(and from the expected document, if given) or contains all the expected keywords.
"""

import argparse
import json
import sys

import rag


def is_match(hit, item):
    meta, text = hit["meta"], hit["text"].lower()
    if "page" in item:
        pages = item["page"] if isinstance(item["page"], list) else [item["page"]]
        same_doc = not item.get("title") or meta.get("title") == item["title"]
        if meta.get("page") in pages and same_doc:
            return True
    keywords = [k.lower() for k in item.get("keywords", [])]
    return bool(keywords) and all(k in text for k in keywords)


def evaluate(project_id, items, k=rag.TOP_K):
    rows = []
    for item in items:
        hits = rag.retrieve(item["question"], project_id, item.get("domain"), k)
        rank = next((i for i, h in enumerate(hits, start=1) if is_match(h, item)), None)
        rows.append({"question": item["question"], "rank": rank, "returned": len(hits)})
    n = len(rows) or 1
    return {
        "questions": len(rows),
        "hit_at_1": sum(1 for r in rows if r["rank"] == 1) / n,
        "hit_at_k": sum(1 for r in rows if r["rank"] is not None) / n,
        "mrr": sum(1 / r["rank"] for r in rows if r["rank"]) / n,
        "no_result": sum(1 for r in rows if r["returned"] == 0) / n,
        "rows": rows,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("project_id")
    parser.add_argument("questions_file")
    parser.add_argument("-k", type=int, default=rag.TOP_K)
    args = parser.parse_args(argv)

    with open(args.questions_file, encoding="utf-8") as handle:
        items = json.load(handle)
    result = evaluate(args.project_id, items, args.k)

    print(f"Questions:        {result['questions']}")
    print(f"Hit@1:            {result['hit_at_1']:.0%}")
    print(f"Hit@{args.k}:            {result['hit_at_k']:.0%}")
    print(f"MRR:              {result['mrr']:.2f}")
    print(f"Nothing found:    {result['no_result']:.0%}")
    misses = [r for r in result["rows"] if r["rank"] is None]
    if misses:
        print("\nMissed questions:")
        for row in misses:
            print(f"  - {row['question']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
