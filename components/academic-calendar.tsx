'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CalendarItem } from '@/lib/db/queries';
import { CourseColorDot } from '@/components/course-color-dot';
import { getCourseColor, type CourseColorSource } from '@/lib/course-colors';

type View = 'month' | 'week' | 'agenda';
type DatedItem = CalendarItem & { date: Date };
const views: View[] = ['month', 'week', 'agenda'];

export function AcademicCalendar({
  initialItems,
  courses,
}: {
  initialItems: CalendarItem[];
  courses: readonly CourseColorSource[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(new Date());
  const today = new Date();
  const items = useMemo(
    () =>
      initialItems.map((item) => ({ ...item, date: new Date(item.startAt) })),
    [initialItems],
  );
  const monthDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(cursor)),
        end: endOfWeek(endOfMonth(cursor)),
      }),
    [cursor],
  );
  const weekDays = useMemo(
    () =>
      eachDayOfInterval({ start: startOfWeek(cursor), end: endOfWeek(cursor) }),
    [cursor],
  );
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (view === 'month')
          return monthDays.some((day) => isSameDay(day, item.date));
        if (view === 'week')
          return weekDays.some((day) => isSameDay(day, item.date));
        return (
          item.date >= startOfWeek(cursor) &&
          item.date <= addDays(startOfWeek(cursor), 60)
        );
      }),
    [cursor, items, monthDays, view, weekDays],
  );
  const title =
    view === 'month'
      ? format(cursor, 'MMMM yyyy')
      : view === 'week'
        ? `${format(weekDays[0], 'MMM d')} – ${format(weekDays[6], 'MMM d, yyyy')}`
        : `Agenda from ${format(startOfWeek(cursor), 'MMM d, yyyy')}`;
  const move = (direction: -1 | 1) =>
    setCursor((value) =>
      view === 'month'
        ? direction < 0
          ? subMonths(value, 1)
          : addMonths(value, 1)
        : direction < 0
          ? subWeeks(value, 1)
          : addWeeks(value, 1),
    );
  const open = (item: CalendarItem) =>
    item.assignmentId
      ? router.push(`/assignments/${item.assignmentId}`)
      : item.localTaskId
        ? router.push(`/tasks?task=${item.localTaskId}`)
        : item.sourceUrl
          ? window.open(item.sourceUrl, '_blank', 'noopener,noreferrer')
          : undefined;
  const itemsOn = (day: Date) =>
    visibleItems.filter((item) => isSameDay(item.date, day));

  /** Compact text chip; the course colour is the 2px left rule. */
  const Event = ({
    item,
    compact = false,
  }: {
    item: DatedItem;
    compact?: boolean;
  }) => {
    const color =
      item.courseId == null
        ? 'var(--ink-4)'
        : getCourseColor(item.courseId, courses);
    return (
      <button
        type="button"
        onClick={() => open(item)}
        title={`${item.title} · ${item.course ?? 'Personal'} · ${format(item.date, 'PPp')}`}
        data-course-color={color}
        data-course-id={item.courseId ?? 'personal'}
        style={{ borderColor: color, '--chip': color } as CSSProperties}
        className={cn(
          'block w-full truncate rounded-r-[3px] border-0 border-l-2 pl-1.5 text-left leading-snug text-ink-2 transition-colors hover:bg-wash hover:text-ink',
          compact
            ? 'py-px text-xs max-sm:h-1.5 max-sm:rounded-full max-sm:border-0 max-sm:bg-(--chip) max-sm:p-0'
            : 'py-1 text-[0.8125rem]',
          /EXAM|QUIZ/.test(item.eventType) && 'font-medium text-ink',
        )}
      >
        <span
          className={cn(
            'tabular-nums text-ink-3',
            compact && 'hidden lg:inline',
          )}
        >
          {format(item.date, 'p')}{' '}
        </span>
        <span className={cn(compact && 'max-sm:sr-only')}>
          {item.title}
          {item.personalTarget ? ' · target' : ''}
        </span>
      </button>
    );
  };

  const DayNumber = ({ day, large = false }: { day: Date; large?: boolean }) => {
    const isToday = isSameDay(day, today);
    return (
      <span
        aria-current={isToday ? 'date' : undefined}
        className={cn(
          'grid place-items-center rounded-full tabular-nums',
          large ? 'size-8 text-[0.9375rem]' : 'size-6 text-xs',
          isToday && 'bg-ink font-medium text-paper',
        )}
      >
        {format(day, 'd')}
      </span>
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="display min-w-[12ch] text-[1.5rem] sm:text-[1.75rem]" aria-live="polite">
            {title}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Previous period"
              onClick={() => move(-1)}
              size="icon-sm"
              variant="ghost"
            >
              <ChevronLeft />
            </Button>
            <Button
              onClick={() => setCursor(new Date())}
              variant="outline"
              size="sm"
            >
              Today
            </Button>
            <Button
              aria-label="Next period"
              onClick={() => move(1)}
              size="icon-sm"
              variant="ghost"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <fieldset className="m-0 flex min-w-0 gap-6 border-x-0 border-t-0 border-b border-rule p-0">
          <legend className="sr">Calendar view</legend>
          {views.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                '-mb-px border-b-[1.5px] pt-1 pb-2 text-sm capitalize transition-colors',
                view === value
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-3 hover:text-ink',
              )}
            >
              {value}
            </button>
          ))}
        </fieldset>
      </div>
      {view === 'month' && (
        <div className="border-t border-l border-rule">
          <div className="grid grid-cols-7">
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="border-r border-b border-rule px-2 py-1.5 text-xs text-ink-3"
              >
                <span className="sm:hidden">{format(day, 'EEEEE')}</span>
                <span className="hidden sm:inline">{format(day, 'EEE')}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const dayItems = itemsOn(day);
              const inMonth = isSameMonth(day, cursor);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'min-h-20 min-w-0 border-r border-b border-rule p-1 sm:min-h-28 sm:p-1.5',
                    !inMonth && 'text-ink-4',
                  )}
                >
                  <DayNumber day={day} />
                  <div className={cn('mt-1 space-y-0.5', !inMonth && 'opacity-60')}>
                    {dayItems.slice(0, 3).map((item) => (
                      <Event key={item.id} item={item} compact />
                    ))}
                    {dayItems.length > 3 && (
                      <p className="pl-2 text-[0.6875rem] text-ink-3">
                        +{dayItems.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {view === 'week' && (
        <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <div className="grid min-w-[760px] grid-cols-7 border-t border-l border-rule">
            {weekDays.map((day) => {
              const dayItems = itemsOn(day);
              return (
                <section
                  key={day.toISOString()}
                  aria-label={format(day, 'EEEE, MMMM d')}
                  className="min-h-[440px] min-w-0 border-r border-b border-rule p-2"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <DayNumber day={day} large />
                    <span className="text-xs text-ink-3">{format(day, 'EEE')}</span>
                  </div>
                  <div className="space-y-1">
                    {dayItems.map((item) => (
                      <Event key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
      {view === 'agenda' && (
        <div className="rule-rows">
          {eachDayOfInterval({
            start: startOfWeek(cursor),
            end: addDays(startOfWeek(cursor), 60),
          }).map((day) => {
            const dayItems = itemsOn(day);
            if (!dayItems.length) return null;
            const isToday = isSameDay(day, today);
            return (
              <section
                key={day.toISOString()}
                aria-label={format(day, 'EEEE, MMMM d')}
                className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
              >
                <h3 className="flex items-baseline gap-2 sm:block">
                  <span className="numeral text-[1.125rem]">
                    {format(day, 'MMM d')}
                  </span>
                  <span
                    className={cn(
                      'text-[0.78125rem] sm:block',
                      isToday ? 'font-medium text-ink' : 'text-ink-3',
                    )}
                  >
                    {isToday ? 'Today' : format(day, 'EEEE')}
                  </span>
                </h3>
                <ul>
                  {dayItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => open(item)}
                        className="group grid w-full grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-x-3 py-1.5 text-left sm:grid-cols-[4.75rem_minmax(0,1fr)_auto]"
                      >
                        <time
                          dateTime={item.date.toISOString()}
                          className="text-[0.8125rem] text-ink-3 tabular-nums"
                        >
                          {format(item.date, 'p')}
                        </time>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <CourseColorDot
                              courseId={item.courseId}
                              courses={courses}
                              className="size-1.5"
                            />
                            <span className="truncate text-[0.9375rem] underline-offset-[3px] group-hover:underline">
                              {item.title}
                            </span>
                          </span>
                          <span className="block pl-3.5 text-[0.78125rem] text-ink-3">
                            {item.course ?? 'Personal'}
                            {item.personalTarget ? ' · Personal target' : ''}
                          </span>
                        </span>
                        <span className="hidden text-[0.78125rem] text-ink-3 sm:block">
                          {item.eventType.charAt(0).toUpperCase() +
                            item.eventType
                              .slice(1)
                              .toLowerCase()
                              .replaceAll('_', ' ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {!visibleItems.length && (
            <p className="py-8 text-[0.9375rem] text-ink-3">
              Nothing scheduled in the next two months.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
