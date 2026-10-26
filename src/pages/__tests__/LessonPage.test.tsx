import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LessonPage from '../LessonPage';
import { getProgress } from '../../lib/progress';

vi.mock('../../components/Mermaid', () => ({ default: ({ source }: { source: string }) => <pre data-testid="mermaid">{source}</pre> }));

beforeAll(() => {
  // jsdom lacks these browser APIs.
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  Element.prototype.scrollIntoView = () => {};
});

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/lesson/:id" element={<LessonPage />} /></Routes></MemoryRouter>);
}

describe('LessonPage', () => {
  it('renders the Strategy lesson with all key sections, and the quiz records an attempt', async () => {
    renderAt('/lesson/m06-strategy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Strategy' }, { timeout: 30000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Full page' }));
    for (const h of ['Learning objectives', "Explain it like I'm a beginner", 'Visual explanation', 'Exercises', 'Knowledge check', 'Completion criteria'])
      expect(screen.getByRole('heading', { level: 2, name: h })).toBeInTheDocument();
    expect(screen.getAllByTestId('mermaid').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByTestId('exercise').length).toBeGreaterThanOrEqual(5);

    // Solutions stay hidden until requested and confirmed.
    const ex1 = screen.getAllByTestId('exercise')[0];
    expect(within(ex1).queryByTestId('solution')).toBeNull();
    fireEvent.click(within(ex1).getByRole('button', { name: 'Show solution' }));
    fireEvent.click(within(ex1).getByRole('button', { name: 'Yes, show solution' }));
    expect(within(ex1).getByTestId('solution')).toBeInTheDocument();

    // Progressive hints.
    fireEvent.click(within(ex1).getByRole('button', { name: 'Show first hint' }));
    expect(within(ex1).getByText('Hint 1')).toBeInTheDocument();

    // Answer every quiz question with its first option and submit.
    const quiz = screen.getByTestId('quiz');
    for (const q of within(quiz).getAllByTestId('quiz-question')) fireEvent.click(q.querySelector('input')!);
    fireEvent.click(within(quiz).getByRole('button', { name: 'Submit answers' }));
    expect(within(quiz).getByTestId('quiz-score')).toBeInTheDocument();
    expect(getProgress().quiz['m06-strategy']).toHaveLength(1);
    expect(getProgress().exercises['m06-strategy-ex1'].hintsUsed).toBe(1);
    expect(getProgress().completed['m06-strategy']).toBeUndefined();
  });

  it('Study mode shows one step at a time, with concept cards and step navigation', async () => {
    renderAt('/lesson/m06-strategy');
    await screen.findByRole('heading', { level: 1, name: 'Strategy' }, { timeout: 30000 });
    fireEvent.click(screen.getByRole('radio', { name: 'Study mode' }));
    const h2s = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    // Jump to the first step, then only that section is rendered.
    fireEvent.click(within(screen.getByRole('list', { name: 'Lesson steps' })).getAllByRole('button')[0]);
    expect(h2s()).toEqual(['Learning objectives']);
    expect(screen.queryByTestId('quiz')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    expect(h2s()).toEqual(['Prerequisites']);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(h2s()).toEqual(['First-principles explanation']);

    // Subsections become concept cards: the first is open, "Got it" opens the next.
    const card = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
    expect(card('What it is')).toHaveAttribute('aria-expanded', 'true');
    expect(card('Why it exists')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: /Got it — next idea/ }));
    expect(card('Why it exists')).toHaveAttribute('aria-expanded', 'true');

    // Deep links pick the right step.
    fireEvent.click(screen.getByRole('button', { name: 'knowledge check' }));
    expect(h2s()).toEqual(['Knowledge check']);
    expect(screen.getByTestId('quiz')).toBeInTheDocument();
  });

  it('shows a clear message for an unknown lesson id', async () => {
    renderAt('/lesson/does-not-exist');
    expect(await screen.findByText('Lesson not found', {}, { timeout: 30000 })).toBeInTheDocument();
  });
});
