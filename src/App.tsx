import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes, Link } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import { Spinner } from './components/ui';
import { HldPlaygroundPage, LldPlaygroundPage, SimulatorLabPage, SqlPlaygroundPage, Lazy } from './components/playgrounds';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Curriculum = lazy(() => import('./pages/Curriculum'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const Practice = lazy(() => import('./pages/Practice'));
const Patterns = lazy(() => import('./pages/Patterns'));
const PlaygroundHub = lazy(() => import('./pages/PlaygroundHub'));
const CSharpPlayground = lazy(() => import('./pages/CSharpPlayground'));
const ApiPlayground = lazy(() => import('./pages/ApiPlayground'));
const DecisionSimulator = lazy(() => import('./pages/DecisionSimulator'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const Assessments = lazy(() => import('./pages/Assessments'));
const Projects = lazy(() => import('./pages/Projects'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Search = lazy(() => import('./pages/Search'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));

function Playground({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="px-4 py-6 sm:px-6"><Lazy label={label}>{children}</Lazy></div>;
}

function NotFound() {
  return <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-xl font-semibold text-ink">Page not found</h1><p className="mt-2 text-sm text-ink-2"><Link to="/" className="text-accent">Go to the home page</Link></p></div>;
}

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/curriculum" element={<Curriculum />} />
            <Route path="/lesson/:id" element={<LessonPage />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/patterns" element={<Patterns />} />
            <Route path="/playground" element={<PlaygroundHub />} />
            <Route path="/playground/csharp" element={<CSharpPlayground />} />
            <Route path="/playground/sql" element={<Playground label="SQL playground"><SqlPlaygroundPage /></Playground>} />
            <Route path="/playground/lld" element={<Playground label="LLD designer"><LldPlaygroundPage /></Playground>} />
            <Route path="/playground/hld" element={<Playground label="HLD canvas"><HldPlaygroundPage /></Playground>} />
            <Route path="/playground/sim" element={<Playground label="simulators"><SimulatorLabPage /></Playground>} />
            <Route path="/playground/api" element={<ApiPlayground />} />
            <Route path="/playground/decision" element={<DecisionSimulator />} />
            <Route path="/flashcards" element={<Flashcards />} />
            <Route path="/assessments" element={<Assessments />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}
