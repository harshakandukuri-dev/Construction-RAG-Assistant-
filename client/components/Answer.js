// Renders an assistant answer: paragraphs, bullet lists, **bold**, and [S1]
// citations as small buttons that open the matching source.

function inline(text, sources, onCite) {
  return text
    .split(/(\*\*[^*]+\*\*|\[S\d+\])/g)
    .filter(Boolean)
    .map((part, i) => {
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      if (bold) return <strong key={i}>{bold[1]}</strong>;
      const cite = part.match(/^\[S(\d+)\]$/);
      if (cite) {
        const n = Number(cite[1]);
        if (!sources.some((s) => s.n === n)) return null; // ignore citations that point nowhere
        return (
          <button key={i} type="button" className="cite" aria-label={`Source ${n}`} onClick={() => onCite(n)}>
            {n}
          </button>
        );
      }
      return part;
    });
}

function toBlocks(text) {
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) {
      flush();
      const type = /^\d/.test(line) ? "ol" : "ul";
      const last = blocks.at(-1);
      if (last?.type === type) last.items.push(item[1]);
      else blocks.push({ type, items: [item[1]] });
    } else if (!line) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

export default function Answer({ text, sources = [], streaming = false, onCite = () => {} }) {
  const blocks = toBlocks(text);
  return (
    <div className="answer">
      {blocks.map((block, i) => {
        if (block.type === "p") return <p key={i}>{inline(block.text, sources, onCite)}</p>;
        const List = block.type;
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item, sources, onCite)}</li>
            ))}
          </List>
        );
      })}
      {streaming && text && <span className="caret" aria-hidden="true" />}
    </div>
  );
}
