'use client';

import React from 'react';

/**
 * A very small markdown renderer: bold, bullet lists, numbered lists and line
 * breaks. That is everything Foreman is asked to produce, so there is no need
 * for a markdown library.
 */

/** Split a line on **bold** and return React nodes. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const bold = m[1] ?? m[2];
    if (bold !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${i++}`} style={{ fontWeight: 700 }}>
          {bold}
        </strong>
      );
    } else {
      out.push(
        <em key={`${keyPrefix}-i${i++}`} style={{ fontStyle: 'italic' }}>
          {m[3] ?? m[4]}
        </em>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const last = blocks[blocks.length - 1];

    if (bullet) {
      if (last && last.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
      continue;
    }
    if (numbered) {
      if (last && last.kind === 'ol') last.items.push(numbered[1]);
      else blocks.push({ kind: 'ol', items: [numbered[1]] });
      continue;
    }
    if (line.trim() === '') {
      if (last && last.kind === 'p' && last.lines.length) blocks.push({ kind: 'p', lines: [] });
      continue;
    }
    // Headings get flattened into bold paragraphs.
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const content = heading ? `**${heading[1]}**` : line;
    if (last && last.kind === 'p') last.lines.push(content);
    else blocks.push({ kind: 'p', lines: [content] });
  }

  return blocks.filter((b) => (b.kind === 'p' ? b.lines.length > 0 : b.items.length > 0));
}

export default function Markdown({ text }: { text: string }) {
  const blocks = parse(text);

  return (
    <>
      {blocks.map((b, bi) => {
        if (b.kind === 'p') {
          return (
            <p key={bi} style={{ margin: bi === 0 ? 0 : '8px 0 0', lineHeight: 1.55 }}>
              {b.lines.map((l, li) => (
                <React.Fragment key={li}>
                  {li > 0 ? <br /> : null}
                  {inline(l, `${bi}-${li}`)}
                </React.Fragment>
              ))}
            </p>
          );
        }
        const ListTag = b.kind === 'ul' ? 'ul' : 'ol';
        return (
          <ListTag
            key={bi}
            style={{
              margin: bi === 0 ? '0' : '8px 0 0',
              paddingLeft: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              lineHeight: 1.5,
            }}
          >
            {b.items.map((it, ii) => (
              <li key={ii}>{inline(it, `${bi}-${ii}`)}</li>
            ))}
          </ListTag>
        );
      })}
    </>
  );
}
