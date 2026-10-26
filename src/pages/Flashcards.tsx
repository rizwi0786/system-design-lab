import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllLessons } from '../lib/useLessons';
import { actions, dueCards, useProgress } from '../lib/progress';
import { cardId, GRADE_LABEL, type Grade } from '../lib/srs';
import { lessonById } from '../lib/content';
import { Markdown } from '../components/Markdown';
import { Button, Card, Empty, PageHeader, Spinner, Stat } from '../components/ui';

export default function Flashcards() {
  const lessons = useAllLessons();
  const p = useProgress();
  const [revealed, setRevealed] = useState(false);
  const [now] = useState(() => new Date());
  const cards = useMemo(() => {
    const map = new Map<string, { front: string; back: string; lessonId: string }>();
    for (const l of lessons ?? []) for (const c of l.flashcards) map.set(cardId(l.meta.id, c.front), { ...c, lessonId: l.meta.id });
    return map;
  }, [lessons]);
  const due = dueCards(p, now).filter(([id]) => cards.has(id));
  const current = due[0];
  const card = current && cards.get(current[0]);
  const deck = Object.keys(p.srs).length;
  const lessonsWithCards = (lessons ?? []).filter(l => l.flashcards.length);

  const grade = (g: Grade) => { if (!current) return; actions.reviewCard(current[0], g); setRevealed(false); };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Flashcards">
        Spaced repetition using the SM-2 algorithm: cards you know come back after longer and longer gaps (1 day, 6 days, then the gap × your ease factor); cards you miss come back in 10 minutes.
      </PageHeader>
      {!lessons ? <Spinner /> : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-4 rounded-lg border border-line bg-surface p-4">
            <Stat label="Due now" value={due.length} />
            <Stat label="In your deck" value={deck} />
            <Stat label="Available in lessons" value={cards.size} />
          </div>
          {card ? (
            <Card>
              <div className="text-xs text-ink-3">From <Link className="text-accent" to={`/lesson/${card.lessonId}`}>{lessonById.get(card.lessonId)?.title}</Link></div>
              <div className="mt-3 min-h-20"><Markdown text={card.front} /></div>
              {revealed ? (
                <>
                  <div className="mt-3 border-t border-line pt-3"><Markdown text={card.back} /></div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {([1, 3, 4, 5] as Grade[]).map(g => <Button key={g} variant={g === 4 ? 'primary' : 'secondary'} onClick={() => grade(g)}>{GRADE_LABEL[g]}</Button>)}
                  </div>
                  <p className="mt-2 text-xs text-ink-3">Again = forgot · Hard = recalled with effort · Good = recalled · Easy = instant</p>
                </>
              ) : <Button className="mt-4" variant="primary" onClick={() => setRevealed(true)}>Show answer</Button>}
            </Card>
          ) : (
            <Empty title={deck ? 'Nothing due right now' : 'Your review deck is empty'}>
              {deck ? 'Come back later — the next card is scheduled.' : 'Add flashcards from any lesson below, or from the lesson’s Summary section.'}
            </Empty>
          )}
          <h2 className="mb-2 mt-8 text-sm font-semibold text-ink">Add lesson decks</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {lessonsWithCards.map(l => {
              const ids = l.flashcards.map(c => cardId(l.meta.id, c.front));
              const have = ids.filter(id => p.srs[id]).length;
              return (
                <li key={l.meta.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <Link to={`/lesson/${l.meta.id}`} className="min-w-0 truncate text-sm text-ink hover:text-accent">{l.meta.title}</Link>
                  <Button size="sm" disabled={have === ids.length} onClick={() => actions.addCards(l.meta.id, ids)}>{have === ids.length ? `${ids.length} added` : `Add ${ids.length - have}`}</Button>
                </li>
              );
            })}
            {!lessonsWithCards.length && <li className="px-4 py-3 text-sm text-ink-3">No written lessons have flashcards yet.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
