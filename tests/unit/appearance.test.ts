import { describe, expect, it } from 'vitest';
import { appearanceSchema } from '@/lib/appearance/schema';

describe('saved appearance', () => {
  it('drops Today section ids that no longer exist instead of resetting everything', () => {
    const parsed = appearanceSchema.safeParse({
      theme: 'dark',
      today: {
        order: ['attention', 'tomorrow', 'retired', 'events', 'graded'],
        hidden: ['retired', 'changes'],
      },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.theme).toBe('dark');
    expect(parsed.data?.today).toEqual({
      order: ['attention', 'tomorrow', 'events', 'graded'],
      hidden: ['changes'],
    });
  });
});
