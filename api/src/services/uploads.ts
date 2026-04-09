import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { FileAttachment } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure directories exist
async function ensureDirectories(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

// Get the full path to a file
export function getUploadPath(filename: string): string {
  return path.join(UPLOADS_DIR, filename);
}

// Save a file and return metadata
export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<FileAttachment> {
  await ensureDirectories();

  const id = uuidv4();
  const ext = path.extname(originalName) || '';
  const filename = `${id}${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  await fs.writeFile(filePath, buffer);

  return {
    id,
    filename,
    originalName,
    mimeType,
    size: buffer.length,
    path: filename,
  };
}

// Get file by ID
export async function getUploadedFile(filename: string): Promise<Buffer | null> {
  try {
    const filePath = getUploadPath(filename);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

// Delete file
export async function deleteUploadedFile(filename: string): Promise<void> {
  try {
    const filePath = getUploadPath(filename);
    await fs.unlink(filePath);
  } catch {
    // File might not exist
  }
}

// Get file metadata from stored attachment info
export function getAttachmentUrl(attachment: FileAttachment): string {
  return `/api/uploads/${attachment.filename}`;
}
