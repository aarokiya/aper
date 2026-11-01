import { rebuildSearchIndex } from '@/lib/search/index';
import {
  importStudyHubPath,
  studyHubPath,
  type StudyHubImport,
} from '@/lib/study/hub';

const target = process.argv[2];
if (!target) {
  console.error(
    'Usage: pnpm study:import <courses .json, folder with courses.json, or hub .html>',
  );
  process.exit(1);
}

let result: StudyHubImport;
try {
  result = importStudyHubPath(target);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const { hub, seeded } = result;
rebuildSearchIndex();
const codes = (ids: string[]) =>
  ids
    .map((id) => hub.courses.find((course) => course.id === id)?.code ?? id)
    .join(', ');
console.log(
  `Imported "${hub.title}" (${codes(hub.courses.map((course) => course.id))}) into ${studyHubPath}`,
);
if (seeded.length)
  console.log(
    `Progress from the import replaced older saved progress for ${codes(seeded)}.`,
  );
