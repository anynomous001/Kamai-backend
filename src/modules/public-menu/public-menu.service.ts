import { prisma } from '../../shared/database/prisma.js';
import { storageProvider } from '../../shared/storage/supabase.storage.js';
import { NotFoundError } from '../../shared/errors/index.js';

const READ_URL_EXPIRES_IN_SECONDS = 3600; // 1 hour; regenerated fresh on every page load, never persisted

export async function getPublicMenu(bakerSlug: string) {
  const normalizedSlug = bakerSlug.trim().toLowerCase();

  const baker = await prisma.baker.findUnique({
    where: { menuSlug: normalizedSlug },
    select: {
      id: true,
      businessName: true,
      logoPath: true,
      whatsappNumber: true,
    },
  });

  if (!baker) {
    throw new NotFoundError('No published menu at this link');
  }

  const items = await prisma.menuItem.findMany({
    where: { bakerId: baker.id, isAvailable: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      name: true,
      category: true,
      price: true,
      unit: true,
      description: true,
      photoPath: true,
    },
  });

  const [logoUrl, itemsWithPhotoUrl] = await Promise.all([
    baker.logoPath ? storageProvider.getSignedReadUrl(baker.logoPath, READ_URL_EXPIRES_IN_SECONDS) : Promise.resolve(null),
    Promise.all(
      items.map(async (item) => ({
        name: item.name,
        category: item.category,
        price: Number(item.price),
        unit: item.unit,
        description: item.description,
        photoUrl: item.photoPath
          ? await storageProvider.getSignedReadUrl(item.photoPath, READ_URL_EXPIRES_IN_SECONDS)
          : null,
      })),
    ),
  ]);

  // Explicitly whitelisted — never spread `baker` or an item record
  // directly into the response, so baker_id/menuItemId can never leak
  // through a future field added upstream without a matching change here.
  return {
    businessName: baker.businessName,
    logoUrl,
    whatsappNumber: baker.whatsappNumber,
    items: itemsWithPhotoUrl,
  };
}
