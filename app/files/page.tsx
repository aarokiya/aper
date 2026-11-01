import { FilesBrowser } from '@/components/files/files-browser';
import { PageFrame } from '@/components/page-frame';
import { getFileIndex } from '@/lib/files/queries';

export const dynamic = 'force-dynamic';

export default function FilesPage() {
  const index = getFileIndex();
  return (
    <PageFrame
      title="Files"
      eyebrow={
        index.files.length ? `${index.files.length} files, ${index.cachedCount} saved on this device` : undefined
      }
    >
      <FilesBrowser index={index} />
    </PageFrame>
  );
}
