import { z } from 'zod';

export const widgetTypes = ['guide', 'checklist', 'notes', 'timer', 'controls', 'keyboard', 'trackpad', 'performance', 'links'];

const safeUrl = z.string().url().max(500).refine((value) => ['https:', 'http:'].includes(new URL(value).protocol), 'Only HTTP(S) URLs are allowed');
const profileName = z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/);
const widgetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  type: z.enum(widgetTypes),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().max(4000).optional(),
  sourceUrl: safeUrl.optional()
}).strict();

export const deckSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(['deck', 'layout', 'widget-preset', 'theme', 'compatibility-profile']).default('deck'),
  slug: z.string().regex(/^[a-z0-9-]{3,64}$/),
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(500),
  target: z.object({
    packageNames: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_.]{2,199}$/)).min(1).max(12),
    platforms: z.array(z.enum(['android', 'retroarch', 'steam-link', 'browser'])).min(1).max(4),
    deviceProfiles: z.array(profileName).min(1).max(12).default(['generic-dual-screen'])
  }).strict(),
  layout: z.object({
    columns: z.number().int().min(1).max(4),
    widgets: z.array(widgetSchema).min(1).max(12),
    breakpoints: z.array(z.object({
      minWidth: z.number().int().min(240).max(8192),
      columns: z.number().int().min(1).max(4)
    }).strict()).max(6).default([])
  }).strict(),
  permissions: z.array(z.enum(['network', 'keyboard', 'performance', 'external-display'])).max(4).default([]),
  sources: z.array(safeUrl).max(12).default([]),
  ai: z.object({ enabled: z.boolean(), purpose: z.string().trim().max(200).optional() }).strict().default({ enabled: false })
}).strict();

export function validateDeck(input) {
  return deckSchema.safeParse(input);
}
