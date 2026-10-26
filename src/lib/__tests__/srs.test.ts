import { newCard, review, isDue, cardId } from '../srs';

describe('SM-2 scheduling', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  it('grows intervals 1 → 6 → interval × ease on good answers', () => {
    let c = newCard('l', t0);
    c = review(c, 4, t0); expect(c.interval).toBe(1);
    c = review(c, 4, t0); expect(c.interval).toBe(6);
    c = review(c, 4, t0); expect(c.interval).toBe(15);
    expect(c.reps).toBe(3);
  });
  it('resets on Again and brings the card back in 10 minutes', () => {
    let c = review(review(newCard('l', t0), 5, t0), 5, t0);
    c = review(c, 1, t0);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(1);
    expect(new Date(c.due).getTime() - t0.getTime()).toBe(10 * 60 * 1000);
  });
  it('never lets ease drop below 1.3', () => {
    let c = newCard('l', t0);
    for (let i = 0; i < 20; i++) c = review(c, 1, t0);
    expect(c.ease).toBeGreaterThanOrEqual(1.3);
  });
  it('due checks and stable ids', () => {
    const c = newCard('l', t0);
    expect(isDue(c, t0)).toBe(true);
    expect(isDue(review(c, 4, t0), t0)).toBe(false);
    expect(cardId('l', 'front')).toBe(cardId('l', 'front'));
    expect(cardId('l', 'front')).not.toBe(cardId('l', 'other'));
  });
});
