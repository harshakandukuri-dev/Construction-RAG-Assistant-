import Link from "next/link";
import Nav from "@/components/Nav";
import { Icon } from "@/components/Icons";

const rise = (i) => ({ "--i": i });

function Cite({ n }) {
  return <span className="cite">{n}</span>;
}

function SourceChip({ n, title, page }) {
  return (
    <span className="chip">
      <span className="chip-n">{n}</span>
      <span className="chip-title">{title}</span>
      <span className="chip-page">page {page}</span>
    </span>
  );
}

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <section className="hero">
          <h1 className="hero-title rise" style={rise(0)}>
            Your project documents, answered.
          </h1>
          <p className="hero-sub rise" style={rise(1)}>
            Upload specifications and schedules. Ask in plain English. Every answer shows the page it came from.
          </p>
          <div className="hero-cta rise" style={rise(2)}>
            <Link href="/chat" className="btn">
              Open the assistant
            </Link>
            <Link href="/documents" className="link link-chevron">
              Add documents
            </Link>
          </div>

          <div className="demo-wrap rise" style={rise(3)}>
            <div className="demo">
              <p className="demo-caption">Example conversation</p>
              <div className="demo-stack">
                <div className="bubble">What waterproofing is specified for the roof?</div>
                <div>
                  <div className="answer">
                    <p>
                      A 3 mm bituminous membrane laid over the screed, with laps of at least 100 mm sealed with a
                      torch-on finish. <Cite n={1} />
                    </p>
                    <p>
                      A 48-hour flood test is required before the final layer is applied. <Cite n={2} />
                    </p>
                  </div>
                  <div className="chips">
                    <SourceChip n={1} title="Exterior specification" page={12} />
                    <SourceChip n={2} title="Exterior specification" page={13} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="band" aria-labelledby="why">
          <div className="band-head">
            <h2 className="band-title" id="why">
              Made for people who check the spec.
            </h2>
          </div>
          <div className="bento">
            <article className="tile tile-wide tile-dark">
              <h3 className="tile-title">Every answer shows its source.</h3>
              <p className="tile-text">
                Citations point to the document and page behind each statement, so you can read the original wording
                before anything gets built.
              </p>
              <div className="tile-visual">
                <div className="chips">
                  <SourceChip n={1} title="Interior finishes" page={7} />
                  <SourceChip n={2} title="Facade specification" page={3} />
                </div>
              </div>
            </article>

            <article className="tile tile-narrow">
              <div className="lock">
                <Icon name="lock" size={26} />
              </div>
              <h3 className="tile-title">Private by design.</h3>
              <p className="tile-text">
                Documents and questions stay on your computer. The language model runs locally.
              </p>
            </article>

            <article className="tile">
              <h3 className="tile-title">Interior and exterior, kept apart.</h3>
              <p className="tile-text">
                Tag each file as interior, exterior or structural. Questions search the right set automatically.
              </p>
              <div className="tile-visual">
                <div className="segmented" role="img" aria-label="Document types: Auto, Interior, Exterior">
                  {["Auto", "Interior", "Exterior"].map((label) => (
                    <span key={label} className="segment" aria-checked={label === "Exterior"}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </article>

            <article className="tile">
              <h3 className="tile-title">Ready for a busy team.</h3>
              <p className="tile-text">
                When several people ask at once, questions wait their turn instead of failing. Answers appear word by
                word as they are written.
              </p>
            </article>
          </div>
        </section>
      </main>
      <footer className="footer">Built with Next.js, Express, MongoDB, ChromaDB and Ollama.</footer>
    </>
  );
}
