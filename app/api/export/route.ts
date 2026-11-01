import { NextResponse } from 'next/server';
import { generateCorpus } from '@/lib/export/corpus';

export async function POST() { return NextResponse.json(generateCorpus()); }
