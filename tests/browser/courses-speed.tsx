import '../../src/index.css';
import { lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import type { GolfCourseSummary } from '../../src/lib/golf';

const CoursesView = lazy(() => import('../../src/routes/CoursesView').then(m => ({ default: m.CoursesView })));
const Select = lazy(() => import('../../src/components/golf/CourseSearchSelect').then(m => ({ default: m.CourseSearchSelect })));
const MultiSelect = lazy(() => import('../../src/components/golf/CourseSearchMultiSelect').then(m => ({ default: m.CourseSearchMultiSelect })));

function Fixture() {
  const [view, setView] = useState('home');
  const [course, setCourse] = useState<GolfCourseSummary | null>(null);
  const [courses, setCourses] = useState<GolfCourseSummary[]>([]);
  return <BrowserRouter>
    <div className="flex h-dvh flex-col">
      <nav className="flex shrink-0 flex-wrap gap-3 p-2">
        <button onClick={() => setView('home')}>Home</button>
        <button onClick={() => { performance.mark('courses-click'); setView('courses'); }}>Open courses</button>
        <button onClick={() => setView('select')}>Open course picker</button>
        <button onClick={() => setView('multi')}>Open multi picker</button>
      </nav>
      <main className="min-h-0 flex-1">
        <Suspense fallback={<p>Loading view</p>}>
          {view === 'courses' && <CoursesView />}
          {view === 'select' && <Select value={course} onChange={setCourse} />}
          {view === 'multi' && <MultiSelect value={courses} onChange={setCourses} />}
        </Suspense>
      </main>
    </div>
  </BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
