import { Prisma } from '@prisma/client';

import { prisma } from '../../shared/database/prisma.js';
import { BadRequestError } from '../../shared/errors/index.js';

const MAX_BASE_SLUG_LENGTH = 60;
const MAX_COLLISION_ATTEMPTS = 25;

/**
 * Slugifies a business name into a URL-safe base: lowercase, [a-z0-9-]
 * only, collapsed/trimmed hyphens, capped length (cut at a hyphen
 * boundary so we never truncate mid-word).
 */
export function slugifyBusinessName(businessName: string): string {
  const slug = businessName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length <= MAX_BASE_SLUG_LENGTH) {
    return slug;
  }

  const truncated = slug.slice(0, MAX_BASE_SLUG_LENGTH);
  const lastHyphen = truncated.lastIndexOf('-');
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}

/**
 * Finds a free menu slug for `baseSlug`, appending -2, -3, ... on
 * collision. `excludeBakerId` lets a baker "re-check" their own current
 * slug without colliding against themselves (used by the one-time edit).
 */
async function findFreeSlug(baseSlug: string, excludeBakerId?: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    const existing = await prisma.baker.findFirst({
      where: {
        menuSlug: candidate,
        ...(excludeBakerId ? { id: { not: excludeBakerId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new BadRequestError('Could not generate a unique menu link — please choose a custom one');
}

/**
 * Generates a menu slug from `businessName` and persists it onto
 * `bakerId`, retrying on a unique-constraint race (two bakers with the
 * same business name publishing at the same instant) rather than
 * trusting the pre-check alone.
 */
export async function generateAndAssignMenuSlug(bakerId: string, businessName: string | null): Promise<string> {
  if (!businessName || !businessName.trim()) {
    throw new BadRequestError('Set your business name in your profile before publishing a menu');
  }

  const baseSlug = slugifyBusinessName(businessName);
  if (!baseSlug) {
    throw new BadRequestError('Business name must contain at least one letter or number to generate a menu link');
  }

  for (let retry = 0; retry < MAX_COLLISION_ATTEMPTS; retry++) {
    const candidate = await findFreeSlug(baseSlug);

    try {
      await prisma.baker.update({
        where: { id: bakerId },
        data: { menuSlug: candidate },
      });
      return candidate;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Lost the race to another request that just took `candidate` —
        // loop again, findFreeSlug will see the now-taken slug and skip it.
        continue;
      }
      throw error;
    }
  }

  throw new BadRequestError('Could not generate a unique menu link — please try again');
}

/**
 * One-time menu slug edit. Rejects if the baker has already used their
 * single edit (menuSlugEditedAt set) or if the requested slug collides
 * with another baker's.
 */
export async function editMenuSlug(bakerId: string, requestedSlug: string): Promise<string> {
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: { menuSlugEditedAt: true },
  });

  if (baker?.menuSlugEditedAt) {
    throw new BadRequestError('Menu link can only be changed once, and that edit has already been used');
  }

  const baseSlug = slugifyBusinessName(requestedSlug);
  if (!baseSlug) {
    throw new BadRequestError('Menu link must contain at least one letter or number');
  }

  for (let retry = 0; retry < MAX_COLLISION_ATTEMPTS; retry++) {
    const existing = await prisma.baker.findFirst({
      where: { menuSlug: baseSlug, id: { not: bakerId } },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestError('That menu link is already taken — please choose another');
    }

    try {
      await prisma.baker.update({
        where: { id: bakerId },
        data: { menuSlug: baseSlug, menuSlugEditedAt: new Date() },
      });
      return baseSlug;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestError('That menu link is already taken — please choose another');
      }
      throw error;
    }
  }

  throw new BadRequestError('Could not save that menu link — please try again');
}
