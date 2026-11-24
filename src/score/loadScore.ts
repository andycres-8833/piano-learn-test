import JSZip from 'jszip';
import { ScoreError } from './types';

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"

/**
 * Turn an uploaded file (.musicxml, .xml or compressed .mxl) into MusicXML text.
 */
export async function readScoreFile(data: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(data);
  if (!isZip(bytes)) return new TextDecoder('utf-8').decode(bytes);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new ScoreError('bad-archive', 'This .mxl file could not be opened.');
  }

  // The container file tells us which entry is the score.
  let rootPath: string | undefined;
  const container = zip.file('META-INF/container.xml');
  if (container) {
    const doc = new DOMParser().parseFromString(await container.async('string'), 'application/xml');
    rootPath = doc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path') ?? undefined;
  }
  if (!rootPath) {
    rootPath = Object.keys(zip.files).find(
      (p) => !p.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(p),
    );
  }
  const entry = rootPath ? zip.file(rootPath) : null;
  if (!entry) throw new ScoreError('bad-archive', 'No score was found inside this .mxl file.');
  return entry.async('string');
}
