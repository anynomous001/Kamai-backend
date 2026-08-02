import { readFile } from 'fs/promises';
import path from 'path';

// This project compiles to CommonJS (see tsconfig's NodeNext + no "type":
// "module" in package.json), so __dirname is the correct/available way to
// resolve a path relative to this file — import.meta.url is ESM-only and
// tsc rejects it under a CommonJS build target.
const ASSETS_DIR = path.join(__dirname, 'assets', 'fonts');

// Static instances extracted from the Fraunces/IBM Plex Sans variable fonts
// (fonttools varLib.instancer) and subset to the characters this card
// actually uses — satori needs discrete weight buffers (it doesn't drive
// variable-font axes itself) and .ttf/.otf/.woff, not .woff2.
export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 600;
  style: 'normal';
}

let cached: SatoriFont[] | null = null;

export async function loadReceiptCardFonts(): Promise<SatoriFont[]> {
  if (cached) return cached;

  const [fraunces600, plexRegular, plexMedium, plexSemiBold] = await Promise.all([
    readFile(path.join(ASSETS_DIR, 'Fraunces-SemiBold.ttf')),
    readFile(path.join(ASSETS_DIR, 'IBMPlexSans-Regular.ttf')),
    readFile(path.join(ASSETS_DIR, 'IBMPlexSans-Medium.ttf')),
    readFile(path.join(ASSETS_DIR, 'IBMPlexSans-SemiBold.ttf')),
  ]);

  cached = [
    { name: 'Fraunces', data: fraunces600, weight: 600, style: 'normal' },
    { name: 'IBM Plex Sans', data: plexRegular, weight: 400, style: 'normal' },
    { name: 'IBM Plex Sans', data: plexMedium, weight: 500, style: 'normal' },
    { name: 'IBM Plex Sans', data: plexSemiBold, weight: 600, style: 'normal' },
  ];

  return cached;
}
