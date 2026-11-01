import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlToText, sanitizeAcademicHtml, sanitizeFilename } from '@/lib/export/content';

describe('source content handling', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/canvas-assignment.json'), 'utf8'));
  it('preserves useful academic HTML and removes executable content', () => { const value = sanitizeAcademicHtml(fixture.description); expect(value).toContain('<h2>'); expect(value).toContain('<code>malloc</code>'); expect(value).not.toContain('<script>'); });
  it('converts HTML to searchable plain text', () => expect(htmlToText(fixture.description)).toContain('RequirementsImplement malloc handling.'));
  it('prevents path traversal in filenames', () => { const value = sanitizeFilename('../../private:notes.pdf'); expect(value).not.toContain('/'); expect(value).not.toContain('..'); expect(value).toContain('private-notes.pdf'); });
});
