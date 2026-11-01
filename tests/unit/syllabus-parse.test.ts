import { describe, expect, it } from 'vitest';
import {
  parseSyllabus,
  type SyllabusComponent,
} from '@/lib/grades/syllabus-parse';

const text = (...lines: string[]) => lines.join('\n');

const component = (
  label: string,
  weight: number,
  quote: string,
  extra: Partial<SyllabusComponent> = {},
): SyllabusComponent => ({
  label,
  weight,
  count: null,
  each: null,
  rank: null,
  quote,
  ...extra,
});

const STANDARD_CUTOFFS = [90, 80, 70, 60];

describe('parseSyllabus', () => {
  it('reads a bulleted breakdown with a colon letter scale, drops and an averaging rule', () => {
    const parsed = parseSyllabus(
      text(
        'Widget Theory',
        'Exams',
        'There will be four exams, all weighted equally. Exam 4 has an optional second part covering',
        'earlier material. If taken, the second part score will be averaged with the lowest exam score only',
        'if it improves the grade.',
        'Grading Breakdown',
        '• Weekly Quizzes + Intro Quiz: 6%',
        '• Problem Sets: 14%',
        '• Exams: 80% (4 exams, each weighted equally at 20%)',
        'Letter Grades',
        '• A: 90–100',
        '• B: 80–89.99',
        '• C: 70–79.99',
        '• D: 60–69.99',
        '• F: 0–59.99',
        'These brackets will not change. There will be no rounding or curving of grades.',
        'Weekly Quizzes',
        '• Note: No quiz scores will be dropped.',
        'Flexibility Policy',
        '• The lowest problem set grade will be dropped (does not apply to quizzes).',
      ),
    );
    expect(parsed).toEqual({
      components: [
        component(
          'Weekly Quizzes + Intro Quiz',
          6,
          'Weekly Quizzes + Intro Quiz: 6%',
        ),
        component('Problem Sets', 14, 'Problem Sets: 14%'),
        component(
          'Exams',
          80,
          'Exams: 80% (4 exams, each weighted equally at 20%)',
          { count: 4, each: 20 },
        ),
      ],
      cutoffs: STANDARD_CUTOFFS,
      cutoffsQuote: 'A: 90–100 B: 80–89.99 C: 70–79.99 D: 60–69.99 F: 0–59.99',
      credits: null,
      drops: [
        {
          target: 'quiz',
          count: 0,
          quote: 'Note: No quiz scores will be dropped.',
        },
        {
          target: 'problem set',
          count: 1,
          quote:
            'The lowest problem set grade will be dropped (does not apply to quizzes).',
        },
      ],
      pools: [],
      notes: [
        'If taken, the second part score will be averaged with the lowest exam score only if it improves the grade.',
        'There will be no rounding or curving of grades.',
      ],
    });
  });

  it('merges split table rows across page footers and skips the table of contents', () => {
    const parsed = parseSyllabus(
      text(
        'CS 9999 Syllabus Fall 2026 1',
        'CS 9999 - Introduction to Widgets',
        '(3 credit hours)',
        'CS 9999 Syllabus Fall 2026 2',
        'Contents',
        'Grading ............................................................ 3',
        'Exams (60%) ........................................................ 4',
        'Course Grade Percentages: .......................................... 4',
        'CS 9999 Syllabus Fall 2026 3',
        'Grading',
        'The course will be graded on a traditional 60-70-80-90 system as shown below.',
        'Percent Grade',
        '90 - 100 A',
        '80 - 89 B',
        '70 - 79 C',
        '60 - 69 D',
        '<= 59 F',
        'You must have a passing average on the quizzes and the final exam, otherwise you will be',
        'penalized 5 points on your final numeric grade.',
        'Course Grade Percentages:',
        'Lab Activities',
        '~ assigned at least 8 ~',
        '6%',
        'Projects (PJs)',
        '~ assigned at least 4 ~',
        'CS 9999 Syllabus Fall 2026 4',
        '12%',
        'Quizzes (3 x 14%) 42%',
        'Final Exam 40%',
      ),
    );
    expect(parsed).toEqual({
      components: [
        component(
          'Lab Activities',
          6,
          'Lab Activities ~ assigned at least 8 ~ 6%',
        ),
        component('Projects', 12, 'Projects (PJs) ~ assigned at least 4 ~ 12%'),
        component('Quizzes', 42, 'Quizzes (3 x 14%) 42%', {
          count: 3,
          each: 14,
        }),
        component('Final Exam', 40, 'Final Exam 40%'),
      ],
      cutoffs: STANDARD_CUTOFFS,
      cutoffsQuote: '90 - 100 A 80 - 89 B 70 - 79 C 60 - 69 D <= 59 F',
      credits: 3,
      drops: [],
      pools: [],
      notes: [
        'You must have a passing average on the quizzes and the final exam, otherwise you will be penalized 5 points on your final numeric grade.',
      ],
    });
  });

  it('reads ranked midterms, a bracket scale and a capped points pool', () => {
    const parsed = parseSyllabus(
      text(
        '6. Grades',
        'Final grades are calculated using the following grade weighting.',
        'PQE Score 20%',
        'Best Midterm 25%',
        'Middle Midterm 20%',
        'Worst Midterm 15%',
        'Final Exam 20%',
        'Numerical grades are converted to letter grades based on the standard intervals:',
        'A: [90%, 100%], B: [80%, 90%), C: [70%, 80%), D: [60%, 70%), F: [0%, 60%).',
        'Midterm and final exam grades will not be curved.',
        'If the survey completion rate is above 80% for the class, then a 1% bonus will be added to',
        "each student's Final Exam score.",
        '7. PQE Score',
        'Your PQE Score is calculated as your total number of PQE pts out of 50pts possible as a',
        'maximum. There are three ways to accumulate PQE pts: OnlineLab/HomeWorx homework',
        'assignments, Studio Quizzes, and Explorations. Any PQE points over the 50pt cap will be',
        'converted to final exam bonus points at a rate of 1pt PQE = 0.1% Final Exam bonus.',
        '7.1 Homework',
        'Homework runs on OnlineLab (OLB) or HomeWorx. Points convert to PQE pts at a rate of 1pt',
        'OLB = 0.25pt PQE and 1pt HomeWorx = 0.25pt PQE. Note that only the larger total of your',
        'points in either OnlineLab or HomeWorx will count towards your PQE Score.',
      ),
    );
    expect(parsed).toEqual({
      components: [
        component('PQE Score', 20, 'PQE Score 20%'),
        component('Best Midterm', 25, 'Best Midterm 25%', { rank: 'best' }),
        component('Middle Midterm', 20, 'Middle Midterm 20%', {
          rank: 'middle',
        }),
        component('Worst Midterm', 15, 'Worst Midterm 15%', { rank: 'worst' }),
        component('Final Exam', 20, 'Final Exam 20%'),
      ],
      cutoffs: STANDARD_CUTOFFS,
      cutoffsQuote:
        'A: [90%, 100%], B: [80%, 90%), C: [70%, 80%), D: [60%, 70%), F: [0%, 60%).',
      credits: null,
      drops: [],
      pools: [
        {
          target: 'PQE',
          cap: 50,
          sources: ['OnlineLab', 'HomeWorx', 'Studio Quizzes', 'Explorations'],
          rates: { OnlineLab: 0.25, HomeWorx: 0.25 },
          alternatives: [['OnlineLab', 'HomeWorx']],
          quote:
            'Your PQE Score is calculated as your total number of PQE pts out of 50pts possible as a maximum. There are three ways to accumulate PQE pts: OnlineLab/HomeWorx homework assignments, Studio Quizzes, and Explorations.',
        },
      ],
      notes: [
        'Midterm and final exam grades will not be curved.',
        "If the survey completion rate is above 80% for the class, then a 1% bonus will be added to each student's Final Exam score.",
        'Any PQE points over the 50pt cap will be converted to final exam bonus points at a rate of 1pt PQE = 0.1% Final Exam bonus.',
      ],
    });
  });

  it('prefers the breakdown table over prose restating a weight', () => {
    const parsed = parseSyllabus(
      text(
        '8/21/26 CS 0100 Page 3 of 6',
        'Attendance',
        '• Students are given three (3) non-institutionally approved absences.',
        '• Each additional unexcused absence (more than 3), will result in a 5% deduction out of',
        'the overall grade of 100%.',
        'Participation scores will account for 15% of your final grade for this course.',
        'Course Grade Assessment',
        '• Assignments: 70%',
        '• Participation: 15%',
        '• Engagement: 15%',
        'Grading Scale',
        'Your final grade will be assigned as a letter grade according to the following scale:',
        'A 90-100%',
        'B 80-89%',
        'C 70-79%',
        'D 60-69%',
        'F 0-59%',
        '8/21/26 CS 0100 Page 4 of 6',
        'Assignments will account for 70% of your final grade for this course.',
      ),
    );
    expect(parsed).toEqual({
      components: [
        component('Assignments', 70, 'Assignments: 70%'),
        component('Participation', 15, 'Participation: 15%'),
        component('Engagement', 15, 'Engagement: 15%'),
      ],
      cutoffs: STANDARD_CUTOFFS,
      cutoffsQuote: 'A 90-100% B 80-89% C 70-79% D 60-69% F 0-59%',
      credits: null,
      drops: [],
      pools: [],
      notes: [
        'Each additional unexcused absence (more than 3), will result in a 5% deduction out of the overall grade of 100%.',
      ],
    });
  });

  it('falls back to prose weights and multiplies an "each" weight by a count stated elsewhere', () => {
    const parsed = parseSyllabus(
      text(
        '6. Course requirements:',
        'Evaluation of course performance is based on (a-b-c) three examinations, and (d) a set of',
        'class journals.',
        '6.1. Exams (each is 40 points, 25% of your grade) will consist of multiple-choice questions.',
        '6.2 A set of weekly class journals counts for 40 points (25% of grade).',
        '7. Research requirement',
        'Missing research hours lowers the course grade. The breakdown is as follows:',
        'o Only 2 hrs completed: -3% from total course grade',
        'o 0 hrs completed: -6% from total course grade',
        '8. Grading:',
        'The traditional dividing line of 90/80/70/60 for the A/B/C/D range of grades will be used.',
      ),
    );
    expect(parsed).toEqual({
      components: [
        component(
          'Exams',
          75,
          'Exams (each is 40 points, 25% of your grade) will consist of multiple-choice questions.',
          { count: 3, each: 25 },
        ),
        component(
          'Weekly class journals',
          25,
          '6.2 A set of weekly class journals counts for 40 points (25% of grade).',
        ),
      ],
      cutoffs: STANDARD_CUTOFFS,
      cutoffsQuote:
        'The traditional dividing line of 90/80/70/60 for the A/B/C/D range of grades will be used.',
      credits: null,
      drops: [],
      pools: [],
      notes: [
        'The breakdown is as follows: Only 2 hrs completed: -3% from total course grade; 0 hrs completed: -6% from total course grade',
      ],
    });
  });

  it('reads a dated table broken by a repeated header and ignores later sub-part weights', () => {
    const parsed = parseSyllabus(
      text(
        'Page 1',
        'WXYZ 3000 Syllabus (Fall 2026)',
        'Media in Context: Film and Television. 3 credits.',
        'Course Requirements & Grade Components',
        'Assignment Date Percentage of Final Grade',
        'Attendance and participation 30%',
        'Reading responses 20% (2 pts each)',
        'Page 2',
        'Assignment Date Percentage of Final Grade',
        'Scene analysis quiz 10/15 10%',
        'Group pitch 11/13 10%',
        'Final film project & screening 30%',
        'Description of Graded Components',
        '• Group Pitch (10%): Each group submits a pitch for their film.',
        '• Final Film Project (30%)',
        'o Screening (20%): Groups present the film in class.',
        'o Script (10%): Submit the full script.',
        'Grading Scale',
        'A 90-100%',
        'B 80-89%',
        'C 70-79%',
        'D 60-69%',
        'F 0-59%',
      ),
    );
    expect(parsed).toEqual({
      components: [
        component(
          'Attendance and participation',
          30,
          'Attendance and participation 30%',
        ),
        component(
          'Reading responses',
          20,
          'Reading responses 20% (2 pts each)',
        ),
        component('Scene analysis quiz', 10, 'Scene analysis quiz 10/15 10%'),
        component('Group pitch', 10, 'Group pitch 11/13 10%'),
        component(
          'Final film project & screening',
          30,
          'Final film project & screening 30%',
        ),
      ],
      cutoffs: STANDARD_CUTOFFS,
      cutoffsQuote: 'A 90-100% B 80-89% C 70-79% D 60-69% F 0-59%',
      credits: 3,
      drops: [],
      pools: [],
      notes: [],
    });
  });

  it('expands "N x M%" and per-item weights with a count in the label or parentheses', () => {
    const { components } = parseSyllabus(
      text(
        'Grading',
        'Quizzes: 4 x 5%',
        'Labs (5 labs) 4% each',
        'Three Midterm Exams 45%',
        'Final Project 15%',
        'Total 100%',
      ),
    );
    expect(components).toEqual([
      component('Quizzes', 20, 'Quizzes: 4 x 5%', { count: 4, each: 5 }),
      component('Labs', 20, 'Labs (5 labs) 4% each', { count: 5, each: 4 }),
      component('Midterm Exams', 45, 'Three Midterm Exams 45%', { count: 3 }),
      component('Final Project', 15, 'Final Project 15%'),
    ]);
  });

  it('reads several weights listed in one sentence', () => {
    const { components } = parseSyllabus(
      'Grading: Homework 20%, Quizzes 10%, Midterm 30%, and Final 40%.',
    );
    expect(components.map((c) => [c.label, c.weight])).toEqual([
      ['Homework', 20],
      ['Quizzes', 10],
      ['Midterm', 30],
      ['Final', 40],
    ]);
  });

  it('treats "Second" as a rank only beside other ranked items', () => {
    const ranked = parseSyllabus(
      text('Highest Exam 40%', 'Second Highest Exam 35%', 'Lowest Exam 25%'),
    );
    expect(ranked.components.map((c) => c.rank)).toEqual([
      'best',
      'middle',
      'worst',
    ]);
    const ordinal = parseSyllabus(
      text('First Midterm 30%', 'Second Midterm 30%', 'Final Exam 40%'),
    );
    expect(ordinal.components.map((c) => c.rank)).toEqual([null, null, null]);
  });

  it.each([
    [
      'colon ranges',
      text(
        'A: 92–100',
        'B: 82–91.99',
        'C: 72–81.99',
        'D: 65–71.99',
        'F: 0–64.99',
      ),
      [92, 82, 72, 65],
    ],
    [
      'percent ranges',
      text('A 90-100%', 'B 80-89%', 'C 70-79%', 'D 60-69%'),
      [90, 80, 70, 60],
    ],
    [
      'range then letter',
      text('93 - 100 A', '85 - 92 B', '77 - 84 C', '70 - 76 D', '<= 69 F'),
      [93, 85, 77, 70],
    ],
    [
      'interval brackets',
      'A: [90%, 100%], B: [80%, 90%), C: [70%, 80%), D: [60%, 70%), F: [0%, 60%).',
      [90, 80, 70, 60],
    ],
    [
      'slash sequence',
      'The cutoffs 88/78/68/58 for the A/B/C/D grades are fixed.',
      [88, 78, 68, 58],
    ],
    [
      'hyphen system',
      'The course uses a traditional 60-70-80-90 system.',
      [90, 80, 70, 60],
    ],
    [
      'plus and minus',
      text(
        'A 93-100',
        'A- 90-92.99',
        'B+ 87-89.99',
        'B 83-86.99',
        'B- 80-82.99',
        'C 70-79.99',
        'D 60-69.99',
      ),
      [90, 80, 70, 60],
    ],
    [
      'floors',
      text(
        'A: 90 and above',
        'B: 80 and above',
        'C: 70 and above',
        'D: 60 and above',
      ),
      [90, 80, 70, 60],
    ],
  ])('reads letter-scale %s', (_name, input, cutoffs) => {
    expect(parseSyllabus(input).cutoffs).toEqual(cutoffs);
  });

  it('keeps letter scales out of the components', () => {
    const { components } = parseSyllabus(
      text(
        'Homework 50%',
        'Exams 50%',
        'A 90-100%',
        'B 80-89%',
        'C 70-79%',
        'D 60-69%',
      ),
    );
    expect(components.map((c) => c.label)).toEqual(['Homework', 'Exams']);
  });

  it.each([
    [
      'drop the lowest 3 grades for your participation quizzes.',
      { target: 'participation quizzes', count: 3 },
    ],
    [
      'We will drop the lowest two homework assignments.',
      { target: 'homework assignments', count: 2 },
    ],
    ['The two lowest lab scores will be dropped.', { target: 'lab', count: 2 }],
    ['No quiz scores will be dropped.', { target: 'quiz', count: 0 }],
    [
      'Reading quiz scores will not be dropped.',
      { target: 'Reading quiz', count: 0 },
    ],
  ])('reads drop rule %s', (input, drop) => {
    expect(parseSyllabus(input).drops).toEqual([{ ...drop, quote: input }]);
  });

  it('reads credits written as hours or as a trailing count', () => {
    expect(parseSyllabus('Intro to Widgets (4 credit hours)').credits).toBe(4);
    expect(parseSyllabus('Widgets in Media. 3 credits.').credits).toBe(3);
    expect(parseSyllabus('Credit Hours: 2').credits).toBe(2);
    expect(
      parseSyllabus('For every 1 credit you earn online, earn one in person.')
        .credits,
    ).toBeNull();
  });

  it('returns an empty result for text without a grading section', () => {
    expect(
      parseSyllabus(
        text(
          'Course Description',
          'This course covers widgets. Attendance is encouraged.',
          'There is a 20% late penalty for any homework submitted after the deadline.',
          'You can only complete a maximum of 50% of the requirement online.',
        ),
      ),
    ).toEqual({
      components: [],
      cutoffs: null,
      cutoffsQuote: null,
      credits: null,
      drops: [],
      pools: [],
      notes: [],
    });
  });
});
