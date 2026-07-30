import type { Baker } from '@prisma/client';

import { prisma } from '../../shared/database/prisma.js';

// Amounts in rupees (the baker-ops schema stores money as numeric rupees,
// not integer paise). Same materials/quantities as before, values divided
// by 100 from the old paise-scale seed data.
const DEFAULT_MATERIALS = [
  { materialName: 'Flour', unit: 'kg', pricePerUnit: 50, quantity: 10, totalCost: 500, category: 'Ingredients' },
  { materialName: 'Sugar', unit: 'kg', pricePerUnit: 45, quantity: 5, totalCost: 225, category: 'Ingredients' },
  { materialName: 'Butter', unit: 'g', pricePerUnit: 0.5, quantity: 1000, totalCost: 500, category: 'Ingredients' },
  { materialName: 'Fresh Cream', unit: 'ml', pricePerUnit: 0.25, quantity: 1000, totalCost: 250, category: 'Ingredients' },
  { materialName: 'Chocolate', unit: 'g', pricePerUnit: 0.8, quantity: 500, totalCost: 400, category: 'Ingredients' },
  { materialName: 'Cake Board', unit: 'pcs', pricePerUnit: 20, quantity: 20, totalCost: 400, category: 'Packaging' },
  { materialName: 'Packaging Box', unit: 'pcs', pricePerUnit: 35, quantity: 20, totalCost: 700, category: 'Packaging' },
  { materialName: 'Cake Box', unit: 'pcs', pricePerUnit: 30, quantity: 20, totalCost: 600, category: 'Packaging' },
];

export class TenantService {
  /**
   * Provisions a new Baker tenant upon first login.
   * Creates the Baker record and seeds default business materials and settings.
   */
  static async provisionTenant(email: string): Promise<Baker> {
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      // 1. Insert Baker
      // trialEndsAt is intentionally omitted — the DB default
      // (now() + interval '90 days') computes it at insert time.
      const baker = await tx.baker.create({
        data: {
          email,
          status: 'PENDING_ONBOARDING',
          subscriptionStatus: 'TRIAL',
          preferredApps: ['WHATSAPP', 'INSTAGRAM'],
          defaultCollectionMethod: 'UPI',
          qrCodeEnabled: true,
        },
      });

      // 2. Seed Default Materials (Investments)
      await tx.investment.createMany({
        data: DEFAULT_MATERIALS.map((mat) => ({
          bakerId: baker.id,
          materialName: mat.materialName,
          unit: mat.unit,
          pricePerUnit: mat.pricePerUnit,
          quantity: mat.quantity,
          totalCost: mat.totalCost,
          category: mat.category,
          purchaseDate: now,
        })),
      });

      return baker;
    });
  }
}
