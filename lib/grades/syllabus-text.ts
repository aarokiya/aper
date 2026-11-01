import fs from 'node:fs';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { dataDir, getDb, initializeDatabase } from '@/lib/db/client';
import { htmlToText } from '@/lib/export/content';

export class SyllabusTextError extends Error {}

/** Plain text from an uploaded or synced syllabus: PDF, HTML, or text. */
export async function syllabusTextFromFile(
  bytes: Uint8Array,
  name: string,
  type = '',
) {
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      return text;
    } catch {
      throw new SyllabusTextError(`${name} could not be read as a PDF.`);
    }
  }
  if (/\.(docx?|pages|odt|rtf)$/i.test(name))
    throw new SyllabusTextError(
      'Word and Pages files cannot be read here. Export the syllabus as a PDF, or paste its grading section.',
    );
  const raw = new TextDecoder().decode(bytes);
  return type.includes('html') || /\.html?$/i.test(name)
    ? htmlToText(raw)
    : raw;
}

/** The Canvas syllabus page's text, or null when Canvas has none. */
export function canvasSyllabusText(courseId: number) {
  initializeDatabase();
  const row = getDb()
    .sqlite.prepare(`SELECT syllabus_text AS text FROM courses WHERE id=?`)
    .get(courseId) as { text: string | null } | undefined;
  return row?.text?.trim() ? row.text : null;
}

/** A synced course file's text, by course file id. */
export async function courseFileSyllabusText(courseId: number, fileId: number) {
  initializeDatabase();
  const row = getDb()
    .sqlite.prepare(
      `SELECT display_name AS name,content_type AS type,local_path AS localPath FROM course_files WHERE id=? AND course_id=?`,
    )
    .get(fileId, courseId) as
    | { name: string; type: string | null; localPath: string | null }
    | undefined;
  if (!row)
    throw new SyllabusTextError("That file isn't one of this class's files.");
  if (!row.localPath)
    throw new SyllabusTextError('That file is not saved on this device.');
  const file = path.resolve(dataDir, row.localPath);
  if (!file.startsWith(path.resolve(dataDir) + path.sep))
    throw new SyllabusTextError('That file is outside the data folder.');
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new SyllabusTextError(
      `${row.name} is no longer saved on this device. Sync files again, or upload the syllabus.`,
    );
  }
  return {
    name: row.name,
    text: await syllabusTextFromFile(
      new Uint8Array(bytes),
      row.name,
      row.type ?? '',
    ),
  };
}
