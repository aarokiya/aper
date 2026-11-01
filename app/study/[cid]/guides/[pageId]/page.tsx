import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Guide } from '@/components/study/guide';
import { loadStudyPage } from '@/components/study/load';
import { getStudyCourse } from '@/lib/study/hub';

export const dynamic = 'force-dynamic';

type Params = Promise<{ cid: string; pageId: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { cid, pageId } = await params;
  const page = getStudyCourse(cid)?.pages.find(
    (item) => item.id === decodeURIComponent(pageId),
  );
  return { title: page?.title ?? 'Guide not found' };
}

export default async function StudyGuidePage({ params }: { params: Params }) {
  const { pageId } = await params;
  const { course } = await loadStudyPage(params);
  const page = course.pages.find(
    (item) => item.id === decodeURIComponent(pageId),
  );
  if (!page) notFound();
  return <Guide page={page} math={course.math} />;
}
