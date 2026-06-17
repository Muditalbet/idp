import { prisma, toDnsLabel } from '@idp/shared';

/** Generate a globally-unique, DNS-safe service slug from a display name. */
export async function uniqueServiceSlug(name: string): Promise<string> {
  const base = toDnsLabel(name) || 'service';
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.service.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}
