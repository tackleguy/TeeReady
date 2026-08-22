import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Loader2, MapPin } from 'lucide-react';
import { useGolfCourses } from '../hooks/useGolf';
import type { GolfCourseSummary } from '../lib/golf';
import { courseHeroImage } from '../lib/courseImages';
import { stashPendingCourse } from '../lib/pendingCourse';
import { defaultSearchLoc } from '../lib/searchLoc';

function accessLabel(access: GolfCourseSummary['access']) {
  if (access === 'public') return 'Public';
  if (access === 'private') return 'Private';
  if (access === 'resort') return 'Resort';
  return null;
}

function CourseCard({
  course,
  onOpen,
}: {
  course: GolfCourseSummary;
  onOpen: (c: GolfCourseSummary) => void;
}) {
  const access = accessLabel(course.access);
  const photo = courseHeroImage(course.id || course.name);

  return (
    <article className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <button
        type="button"
        onClick={() => onOpen(course)}
        className="block w-full text-left"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-canvas">
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-4">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-white">
                {course.name}
              </h2>
              {course.region ? (
                <p className="mt-0.5 truncate text-[13px] text-white/80">
                  {course.region}
                </p>
              ) : null}
            </div>
            {access ? (
              <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                {access}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            {course.distanceMi != null ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                {course.distanceMi.toFixed(1)} mi
              </span>
            ) : null}
            {course.holes != null ? <span>{course.holes} holes</span> : null}
            {course.par != null ? <span>Par {course.par}</span> : null}
          </div>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
            Hole plan
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </button>
    </article>
  );
}

export function CoursesView() {
  const navigate = useNavigate();
  const loc = defaultSearchLoc();
  const { courses, loading, error } = useGolfCourses(loc.lat, loc.lon, '');

  const openCourse = (course: GolfCourseSummary) => {
    stashPendingCourse(course);
    navigate('/rounds/prep');
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="max-w-xl">
        <p className="text-[13px] font-medium text-brand">Near {loc.name}</p>
        <h1 className="mt-1 text-[32px] font-bold tracking-[-0.04em] text-ink">
          Courses
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Public and private tracks around you — open a hole plan or jump
          straight into GPS.
        </p>
      </header>

      {loading && courses.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center gap-2 text-[14px] text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Finding courses…
        </div>
      ) : error && courses.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-5 py-8 text-center">
          <p className="text-[15px] font-medium text-ink">
            Couldn&apos;t load courses
          </p>
          <p className="mt-1 text-[13px] text-muted">{error}</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-5 py-8 text-center">
          <p className="text-[15px] font-medium text-ink">No courses nearby</p>
          <p className="mt-1 text-[13px] text-muted">
            Try changing your city in Settings, or search from Rounds.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} onOpen={openCourse} />
          ))}
        </div>
      )}
    </div>
  );
}
