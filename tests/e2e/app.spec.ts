import { expect, test } from '@playwright/test';

test('Today shows cached work even after a failed sync', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Homework: malloc and pointers',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Last synced/).first()).toBeVisible();
});

test('course colors match across Today, Tasks, and Calendar', async ({
  page,
}) => {
  await page.goto('/');
  const todayDot = page
    .getByRole('article')
    .filter({ hasText: 'Homework: malloc and pointers' })
    .locator('[data-course-id="1"]');
  const secondCourseDot = page
    .getByRole('article')
    .filter({ hasText: 'Data structures worksheet' })
    .locator('[data-course-id="2"]');
  await expect(todayDot).toBeVisible();
  await expect(secondCourseDot).toBeVisible();
  const courseColor = await todayDot.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(
    await secondCourseDot.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe(courseColor);

  await page.goto('/tasks');
  const taskDot = page
    .getByRole('article')
    .filter({ hasText: 'Homework: malloc and pointers' })
    .locator('[data-course-id="1"]')
    .last();
  expect(
    await taskDot.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe(courseColor);

  await page.goto('/calendar');
  const calendarItem = page
    .getByRole('button')
    .filter({ hasText: 'Homework: malloc and pointers' })
    .first();
  await expect(calendarItem).toBeVisible();
  expect(
    await calendarItem.evaluate(
      (element) => getComputedStyle(element).borderTopColor,
    ),
  ).toBe(courseColor);
});

test('completion removes actionable work and persists locally', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Mark Homework: malloc and pointers complete',
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Homework: malloc and pointers',
      exact: true,
    }),
  ).toBeHidden();
  const assignment = await request.get('/api/assignments/1');
  expect((await assignment.json()).workflow_status).toBe('DONE_LOCALLY');
  await request.patch('/api/local-tasks', {
    data: { assignmentId: 1, workflowStatus: 'NOT_STARTED' },
  });
  await page.goto('/assignments/1');
  await expect(
    page.getByRole('heading', { name: 'Homework: malloc and pointers' }),
  ).toBeVisible();
  await expect(page.getByText('Use malloc safely.')).toBeVisible();
});

test('full-text search returns source content', async ({ page }) => {
  await page.goto('/search');
  await page.getByPlaceholder(/Search malloc/).fill('malloc');
  await expect(
    page.getByRole('heading', { name: 'Homework: malloc and pointers' }),
  ).toBeVisible();
});

test('grade calculator projects what-ifs and persists them', async ({ page }) => {
  await page.goto('/grades');
  const course = page.locator('details[data-course-id]').filter({ hasText: 'CS 2110' });
  const summary = course.locator('summary');
  // Released: 18.5/20. Projected at the default 90% on the 40- and 10-point items: 63.5/70.
  await expect(summary.getByText('92.5%')).toBeVisible();
  await expect(summary.getByText('90.7%')).toBeVisible();
  await summary.click();
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/grades/calculator') && response.request().method() === 'PUT',
  );
  await course.getByLabel('What-if score for Homework: malloc and pointers').fill('20');
  // (18.5 + 20 + 9) / 70
  await expect(summary.getByText('67.9%')).toBeVisible();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(summary.getByText('67.9%')).toBeVisible();
});

test('command palette navigates and triggers manual sync', async ({ page }) => {
  let triggered = false;
  await page.route('**/api/sync', async (route) => {
    triggered = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'SUCCESS' }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Search courses/ }).click();
  await page
    .getByPlaceholder(/Search, or describe a task to add/)
    .fill('Homework: malloc');
  await page
    .getByRole('button', {
      name: /Homework: malloc and pointers assignment/,
    })
    .click();
  await expect(page).toHaveURL(/\/assignments\/1/);
  await page.goto('/');
  await page.getByRole('button', { name: /Search courses/ }).click();
  await page.getByRole('button', { name: /Sync Canvas \+ Gradescope/ }).click();
  await expect.poll(() => triggered).toBe(true);
});

test('academic sync ignores Handshake sign-in state and reloads after completion', async ({
  page,
  request,
}) => {
  const statusResponse = await request.get('/api/sync/status');
  const status = (await statusResponse.json()) as {
    providers: Array<{ key: string }>;
    handshake: { active: boolean; authStatus: string };
  };
  // Handshake syncs daily on its own; the academic status only lists Canvas/Gradescope.
  expect(status.providers.map((provider) => provider.key)).not.toContain('handshake');
  expect(status.handshake).toMatchObject({
    active: false,
    authStatus: 'AUTHENTICATION_REQUIRED',
  });

  let statusCalls = 0;
  await page.route('**/api/sync/status', async (route) => {
    statusCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        active: false,
        providers: [
          {
            key: 'canvas',
            displayName: 'Georgia Tech Canvas',
            authStatus: 'CONNECTED',
            lastError: null,
          },
          {
            key: 'gradescope',
            displayName: 'Gradescope',
            authStatus: 'CONNECTED',
            lastError: null,
          },
          {
            key: 'handshake',
            displayName: 'Handshake',
            authStatus: 'AUTHENTICATION_REQUIRED',
            lastError: 'Sign in to Handshake with your Georgia Tech account.',
          },
        ],
        latestRun: {
          id: statusCalls === 1 ? 40 : 41,
          status: statusCalls === 1 ? 'FAILED' : 'SUCCESS',
          progressLabel: null,
          errors: '[]',
        },
      }),
    });
  });
  await page.route('**/api/sync', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: true, active: true }),
    });
  });
  await page.goto('/');
  let reloads = 0;
  page.on('request', (request) => {
    if (
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === '/'
    )
      reloads += 1;
  });
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect.poll(() => reloads, { timeout: 5000 }).toBeGreaterThan(0);
});

test('Today task menu updates priority and opens details', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Actions for Homework: malloc and pointers' })
    .click();
  await page.getByRole('menuitem', { name: 'High priority' }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/assignments/1')).json()).priority,
    )
    .toBe(3);
  await page
    .getByRole('button', { name: 'Actions for Homework: malloc and pointers' })
    .click();
  await page.getByRole('menuitem', { name: 'Mark done locally' }).click();
  await expect(
    page.getByRole('button', {
      name: 'Homework: malloc and pointers',
      exact: true,
    }),
  ).toBeHidden();
  await page.goto('/tasks');
  await page
    .getByRole('combobox', { name: 'Status' })
    .selectOption('DONE_LOCALLY');
  await expect(
    page.getByRole('button', {
      name: 'Homework: malloc and pointers',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('article')
      .filter({ hasText: 'Homework: malloc and pointers' })
      .getByText('Done locally', { exact: true }),
  ).toBeVisible();
  await request.patch('/api/local-tasks', {
    data: { assignmentId: 1, workflowStatus: 'NOT_STARTED' },
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Actions for Homework: malloc and pointers' })
    .click();
  await page.getByRole('menuitem', { name: 'Open details' }).click();
  await expect(page).toHaveURL(/\/assignments\/1/);
});

test('task list action menus apply status and priority immediately', async ({
  page,
  request,
}) => {
  await page.goto('/tasks');
  await page
    .getByRole('button', { name: 'Actions for Homework: malloc and pointers' })
    .click();
  await page.getByRole('menuitem', { name: 'High priority' }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/assignments/1')).json()).priority,
    )
    .toBe(3);
  await page
    .getByRole('button', { name: 'Actions for Homework: malloc and pointers' })
    .click();
  await page.getByRole('menuitem', { name: 'Mark done locally' }).click();
  await expect(
    page
      .getByRole('article')
      .filter({ hasText: 'Homework: malloc and pointers' })
      .getByText('Done locally', { exact: true }),
  ).toBeVisible();
  await request.patch('/api/local-tasks', {
    data: {
      assignmentId: 1,
      workflowStatus: 'NOT_STARTED',
      priority: 2,
    },
  });
});

test('graded assignment details show the numeric score', async ({ page }) => {
  await page.goto('/assignments/2');
  await expect(page.getByText('Score', { exact: true })).toBeVisible();
  await expect(page.getByText('18.5 / 20', { exact: true })).toBeVisible();
  await expect(page.getByText('92.5%', { exact: true })).toBeVisible();
});

test('calendar switches between month week and agenda', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'month' })).toBeVisible();
  await page.getByRole('button', { name: 'week' }).click();
  await expect(page.getByRole('button', { name: 'agenda' })).toBeVisible();
  await page.getByRole('button', { name: 'agenda' }).click();
  await expect(page.getByText(/Agenda from/)).toBeVisible();
});

test('assignment metadata and subtasks persist', async ({ page, request }) => {
  await page.goto('/assignments/1');
  await page.getByLabel('Priority').selectOption('2');
  await page.getByLabel('Estimated minutes').fill('45');
  await page.getByLabel('Personal target date').fill('2026-09-01T18:00');
  await page.getByPlaceholder('Add a subtask…').fill('Run valgrind');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Run valgrind')).toBeVisible();
  await page.getByRole('button', { name: 'Save locally' }).click();
  const value = await (await request.get('/api/assignments/1')).json();
  expect(value.priority).toBe(2);
  expect(value.estimated_minutes).toBe(45);
  expect(
    value.subtasks.some(
      (item: { title: string }) => item.title === 'Run valgrind',
    ),
  ).toBe(true);
});

test('course alias and Gradescope artifact import work in-app', async ({
  page,
}) => {
  await page.goto('/courses/1');
  await page.getByRole('button', { name: 'Edit alias' }).click();
  await page.getByRole('dialog').locator('input').fill('CS 2110');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save alias' })
    .click();
  await expect(
    page.getByText('CS 2110', { exact: true }).first(),
  ).toBeVisible();
  await page.goto('/settings');
  await page.getByLabel('Downloaded artifact').setInputFiles({
    name: 'gradescope-export.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ assignment: 'Homework', score: 38, max_score: 40 }),
    ),
  });
  await page.getByRole('button', { name: 'Import artifact' }).click();
  await expect(page.getByText(/Artifact imported/)).toBeVisible();
  await expect(page.getByText('gradescope-export.json')).toBeVisible();
});

test('mobile navigation and command palette stay reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Menu' }).click();
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  await expect(navigation.getByRole('link', { name: 'Today' })).toBeVisible();
  await navigation.getByRole('link', { name: 'Calendar' }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect(navigation.getByRole('link', { name: 'Today' })).not.toBeInViewport();
  await page.goto('/');
  await page.getByRole('button', { name: 'Open command palette' }).click();
  await expect(
    page.getByPlaceholder(/Search, or describe a task to add/),
  ).toBeVisible();
});

test('the desktop rail scrolls independently from the main page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 320 });
  for (const path of ['/', '/settings']) {
    await page.goto(path);
    const rail = page.getByRole('complementary', { name: 'Navigation' });
    await expect(
      rail.getByRole('link', { name: /CS 2110/ }),
    ).toBeVisible();
    await expect
      .poll(() =>
        rail.evaluate((element) => element.scrollHeight > element.clientHeight),
      )
      .toBe(true);
    await rail.hover();
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => rail.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
});

test('Gradescope-only assignments become first-class tasks in the system dark theme', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByLabel('Gradescope course').selectOption({ label: 'CS 2110' });
  await page.getByLabel('Gradescope assignment title').fill('Gradescope Quiz');
  await page.getByLabel('Gradescope due date').fill('2026-09-04T17:00');
  await page.getByRole('button', { name: 'Add Gradescope assignment' }).click();
  await expect(page).toHaveURL(/\/assignments\/\d+/);
  await expect(
    page.getByRole('heading', { name: 'Gradescope Quiz' }),
  ).toBeVisible();
  await expect(page.getByText('Gradescope due date')).toBeVisible();
  await page.goto('/courses/1');
  await expect(page.locator('html')).toHaveClass(/dark/);
  // The quiz is due in the past, so it sits in the collapsed "Earlier" group.
  await page.getByText(/^Earlier ·/).click();
  await expect(
    page.getByRole('link', { name: /Gradescope Quiz/ }),
  ).toBeVisible();
});

test('Today shows the next two weeks and opens a prefiltered task view', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Next 2 weeks' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Upcoming project checkpoint',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: /items · View all/ }).click();
  await expect(page).toHaveURL(/\/tasks\?due=fortnight/);
  await expect(page.getByRole('combobox', { name: 'Due' })).toHaveValue(
    'fortnight',
  );
  await expect(page.getByText('Upcoming project checkpoint')).toBeVisible();
});
