import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { validateDeck } from './deckSchema.js';

const maxCatalogFiles = 256;
const maxManifestBytes = 64 * 1024;
const maxMetadataBytes = 32 * 1024;
const maxIconBytes = 64 * 1024;
const maxScreenshotBytes = 512 * 1024;
const maxLocaleBytes = 32 * 1024;
const manifestPattern = /(?:^deck|\.deck)\.(?:json|ya?ml)$/i;
const localePattern = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const relativeAssetPath = z.string().min(1).max(180).refine((value) => !path.posix.isAbsolute(value) && !value.includes('\\') && value.split('/').every((part) => part && part !== '.' && part !== '..'), 'Package paths must stay inside the Deck directory.');
const safeUrl = z.string().url().max(500).refine((value) => ['https:', 'http:'].includes(new URL(value).protocol), 'Only HTTP(S) URLs are allowed.');
const packageMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  license: z.string().regex(/^[A-Za-z0-9.+-]{2,40}$/),
  homepage: safeUrl.optional(),
  icon: relativeAssetPath.optional(),
  screenshots: z.array(relativeAssetPath).max(4).default([]),
  readme: relativeAssetPath.optional(),
  defaultLocale: z.string().regex(localePattern).default('en')
}).strict();
const localizedWidgetSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  content: z.string().trim().max(4000).optional()
}).strict().refine((value) => value.title !== undefined || value.content !== undefined, 'A localized widget must include a title or content.');
const localizationSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().min(10).max(500).optional(),
  widgets: z.record(z.string().regex(/^[a-z0-9-]{1,48}$/), localizedWidgetSchema).default({})
}).strict().refine((value) => value.name !== undefined || value.description !== undefined || Object.keys(value.widgets).length > 0, 'A locale file cannot be empty.');

async function findManifests(root, relative = '', depth = 0) {
  if (depth > 4) throw new Error('Catalog directories cannot be nested more than four levels.');
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Catalog packages cannot contain symbolic links: ${child}`);
    if (entry.isDirectory()) files.push(...await findManifests(root, child, depth + 1));
    else if (entry.isFile() && manifestPattern.test(entry.name)) files.push(child);
    if (files.length > maxCatalogFiles) throw new Error(`Catalogs cannot contain more than ${maxCatalogFiles} Deck manifests.`);
  }
  return files;
}

function parseManifest(source, filename) {
  if (Buffer.byteLength(source) > maxManifestBytes) throw new Error(`${filename} exceeds 64 KiB.`);
  try {
    if (filename.toLowerCase().endsWith('.json')) return JSON.parse(source);
    const document = parseDocument(source, { prettyErrors: false, uniqueKeys: true });
    if (document.errors.length) throw document.errors[0];
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new Error(`${filename} could not be parsed: ${error.message}`);
  }
}

function assetUrl(base, filename) {
  return `${base.replace(/\/$/, '')}/${filename.split(path.sep).map(encodeURIComponent).join('/')}`;
}

async function readBounded(filename, limit, label) {
  const value = await fs.readFile(filename);
  if (value.byteLength > limit) throw new Error(`${label} exceeds ${Math.floor(limit / 1024)} KiB.`);
  return value;
}

function assetMime(filename, value, { allowSvg = true } = {}) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.svg' && allowSvg) {
    const source = value.toString('utf8');
    if (!/^\s*<svg[\s>]/i.test(source) || /<(?:script|style|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=|url\s*\(|@import|<\?(?:xml-stylesheet)|<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(`${filename} is not a self-contained safe SVG.`);
    return 'image/svg+xml';
  }
  if (extension === '.png' && value.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (extension === '.webp' && value.subarray(0, 4).toString() === 'RIFF' && value.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (['.jpg', '.jpeg'].includes(extension) && value[0] === 0xff && value[1] === 0xd8 && value[value.length - 2] === 0xff && value[value.length - 1] === 0xd9) return 'image/jpeg';
  throw new Error(`${filename} is not a supported image.`);
}

function packageFilename(root, manifestFilename, requested) {
  const packageRoot = path.resolve(root, path.dirname(manifestFilename));
  const filename = path.resolve(packageRoot, requested);
  if (filename !== packageRoot && !filename.startsWith(`${packageRoot}${path.sep}`)) throw new Error(`${requested} leaves the Deck package.`);
  return { filename, relative: path.relative(root, filename) };
}

async function optionalFile(filename) {
  try {
    const value = await fs.lstat(filename);
    if (value.isSymbolicLink()) throw new Error(`${filename} cannot be a symbolic link.`);
    return value;
  }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function loadPackage(root, manifestFilename, deck, assetBaseUrl) {
  const metadataFilename = path.join(root, path.dirname(manifestFilename), 'metadata.json');
  if (!(await optionalFile(metadataFilename))) return {};
  let metadata;
  try {
    const source = await readBounded(metadataFilename, maxMetadataBytes, `${path.relative(root, metadataFilename)}`);
    metadata = packageMetadataSchema.parse(JSON.parse(source.toString('utf8')));
  } catch (error) {
    throw new Error(`${path.relative(root, metadataFilename)} is invalid: ${error.issues?.[0]?.message || error.message}`);
  }

  const result = { license: metadata.license, defaultLocale: metadata.defaultLocale };
  if (metadata.homepage) result.homepage = metadata.homepage;
  if (metadata.icon) {
    const icon = packageFilename(root, manifestFilename, metadata.icon);
    const value = await readBounded(icon.filename, maxIconBytes, icon.relative);
    const mimeType = assetMime(icon.relative, value);
    result.icon = { path: `catalog/${icon.relative.split(path.sep).join('/')}`, url: assetUrl(assetBaseUrl, icon.relative), dataUrl: `data:${mimeType};base64,${value.toString('base64')}` };
  }
  if (metadata.readme) {
    const readme = packageFilename(root, manifestFilename, metadata.readme);
    if (path.extname(readme.filename).toLowerCase() !== '.md') throw new Error(`${readme.relative} must be Markdown.`);
    await readBounded(readme.filename, maxManifestBytes, readme.relative);
    result.readmeUrl = assetUrl(assetBaseUrl, readme.relative);
  }
  result.screenshots = [];
  for (const requested of metadata.screenshots) {
    const screenshot = packageFilename(root, manifestFilename, requested);
    const value = await readBounded(screenshot.filename, maxScreenshotBytes, screenshot.relative);
    assetMime(screenshot.relative, value, { allowSvg: false });
    result.screenshots.push({ path: `catalog/${screenshot.relative.split(path.sep).join('/')}`, url: assetUrl(assetBaseUrl, screenshot.relative) });
  }

  const localesPath = path.join(root, path.dirname(manifestFilename), 'locales');
  const localizations = {};
  if (await optionalFile(localesPath)) {
    const entries = (await fs.readdir(localesPath, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length > 12) throw new Error(`${path.relative(root, localesPath)} cannot contain more than 12 locales.`);
    const widgetIds = new Set(deck.layout.widgets.map((widget) => widget.id));
    for (const entry of entries) {
      const locale = entry.name.slice(0, -5);
      if (!localePattern.test(locale) || locale === metadata.defaultLocale) throw new Error(`${entry.name} is not a valid non-default locale filename.`);
      try {
        const value = await readBounded(path.join(localesPath, entry.name), maxLocaleBytes, entry.name);
        const localization = localizationSchema.parse(JSON.parse(value.toString('utf8')));
        const unknownWidget = Object.keys(localization.widgets).find((id) => !widgetIds.has(id));
        if (unknownWidget) throw new Error(`Unknown widget ${unknownWidget}.`);
        localizations[locale] = localization;
      } catch (error) {
        throw new Error(`${path.relative(root, path.join(localesPath, entry.name))} is invalid: ${error.issues?.[0]?.message || error.message}`);
      }
    }
  }
  result.availableLocales = [metadata.defaultLocale, ...Object.keys(localizations)];
  return { package: result, ...(Object.keys(localizations).length ? { localizations } : {}) };
}

export async function loadDeckCatalog(catalogPath, options = {}) {
  const root = catalogPath instanceof URL ? fileURLToPath(catalogPath) : path.resolve(catalogPath);
  const repository = options.repository || 'https://github.com/lindseywebsolutions/seconddeck';
  const ref = options.ref || 'main';
  const assetBaseUrl = options.assetBaseUrl || `${repository}/raw/${encodeURIComponent(ref)}/catalog`;
  const files = await findManifests(root);
  const channels = new Set();
  const records = [];
  for (const filename of files) {
    const source = await fs.readFile(path.join(root, filename), 'utf8');
    const result = validateDeck(parseManifest(source, filename));
    if (!result.success) throw new Error(`${filename} is not a valid Deck: ${result.error.issues[0]?.message || 'invalid manifest'}`);
    const deck = result.data;
    if (channels.has(deck.slug)) throw new Error(`Catalog channel ${deck.slug} is duplicated.`);
    channels.add(deck.slug);
    records.push({
      ...deck,
      ...await loadPackage(root, filename, deck, assetBaseUrl),
      id: `catalog-${deck.slug}-v${deck.version}`,
      channelId: deck.slug,
      status: 'published',
      publisher: 'SecondDeck GitHub Catalog',
      catalog: { repository, ref, path: `catalog/${filename.split(path.sep).join('/')}` }
    });
  }
  if (!records.length) throw new Error('The Git-backed Deck catalog is empty.');
  return records;
}

export const deckCatalogLimits = { maxCatalogFiles, maxManifestBytes, maxMetadataBytes, maxIconBytes, maxScreenshotBytes, maxLocaleBytes, maxDepth: 4 };
