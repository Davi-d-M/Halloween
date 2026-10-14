import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getMarketMerchantContext } from '@/lib/marketMerchantAuth.server';

export const dynamic = 'force-dynamic';

type UploadRequest = {
  mediaType: 'image' | 'video';
  contentType: string;
  size: number;
};

const imageTypes: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif'
};
const videoTypes: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm'
};

function isUploadRequest(value: unknown): value is UploadRequest {
  if (!value || typeof value !== 'object') return false;
  return 'mediaType' in value
    && (value.mediaType === 'image' || value.mediaType === 'video')
    && 'contentType' in value
    && typeof value.contentType === 'string'
    && 'size' in value
    && typeof value.size === 'number';
}

export async function POST(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  let files: UploadRequest[];
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('files' in body) || !Array.isArray(body.files)
      || !body.files.every(isUploadRequest)) throw new Error();
    files = body.files;
  } catch {
    return NextResponse.json({ error: 'Send a valid product media upload request.' }, { status: 400 });
  }

  const photos = files.filter((file) => file.mediaType === 'image');
  const videos = files.filter((file) => file.mediaType === 'video');
  if (files.length < 1 || files.length > 7 || photos.length < 1 || photos.length > 6 || videos.length > 1
    || photos.some((file) => !Object.hasOwn(imageTypes, file.contentType) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 4 * 1024 * 1024)
    || videos.some((file) => !Object.hasOwn(videoTypes, file.contentType) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 10 * 1024 * 1024)) {
    return NextResponse.json({ error: 'Use one to six JPG, PNG, WebP or AVIF photos (4 MB each) and at most one MP4 or WebM video (10 MB).' }, { status: 400 });
  }

  const uploads: Array<{ path: string; token: string; mediaType: UploadRequest['mediaType'] }> = [];
  for (const file of files) {
    const extension = file.mediaType === 'image' ? imageTypes[file.contentType] : videoTypes[file.contentType];
    const path = `${context.user.id}/${randomUUID()}.${extension}`;
    const { data, error } = await context.database.storage
      .from('midnight-market')
      .createSignedUploadUrl(path, { upsert: false });
    if (error) {
      console.error('[MerchantStudio] Could not create signed product media upload:', error);
      if (uploads.length > 0) {
        const { error: cleanupError } = await context.database.storage
          .from('midnight-market')
          .remove(uploads.map((upload) => upload.path));
        if (cleanupError) console.error('[MerchantStudio] Could not clean up incomplete signed uploads:', cleanupError);
      }
      return NextResponse.json({ error: 'Could not prepare product photo uploads.' }, { status: 503 });
    }
    uploads.push({ path: data.path, token: data.token, mediaType: file.mediaType });
  }

  return NextResponse.json({ uploads }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  let paths: string[];
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('paths' in body) || !Array.isArray(body.paths)
      || !body.paths.every((path): path is string => typeof path === 'string')) throw new Error();
    paths = body.paths;
  } catch {
    return NextResponse.json({ error: 'Send valid product media paths.' }, { status: 400 });
  }
  if (paths.length > 7 || paths.some((path) => !path.startsWith(`${context.user.id}/`))) {
    return NextResponse.json({ error: 'Product media cleanup is not available for these files.' }, { status: 403 });
  }
  if (paths.length === 0) return NextResponse.json({ removed: true });

  const { data: linked, error: lookupError } = await context.database
    .from('mm_product_media')
    .select('storage_path')
    .in('storage_path', paths);
  if (lookupError) {
    console.error('[MerchantStudio] Could not verify product media cleanup:', lookupError);
    return NextResponse.json({ error: 'Could not verify product media cleanup.' }, { status: 503 });
  }
  if ((linked || []).length > 0) {
    return NextResponse.json({ error: 'One or more files are already attached to a product.' }, { status: 409 });
  }
  const { error: removeError } = await context.database.storage.from('midnight-market').remove(paths);
  if (removeError) {
    console.error('[MerchantStudio] Could not remove unused product media:', removeError);
    return NextResponse.json({ error: 'Could not clean up unused product media.' }, { status: 503 });
  }
  return NextResponse.json({ removed: true }, { headers: { 'Cache-Control': 'no-store' } });
}
