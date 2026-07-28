import type { Baker } from '@prisma/client';
import { prisma } from '../../shared/database/prisma.js';

const DEFAULT_MATERIALS = [
  { materialName: 'Flour', unit: 'kg', pricePerUnit: 5000, quantity: 10, totalCost: 50000 },
  { materialName: 'Sugar', unit: 'kg', pricePerUnit: 4500, quantity: 5, totalCost: 22500 },
  { materialName: 'Butter', unit: 'g', pricePerUnit: 50, quantity: 1000, totalCost: 50000 },
  { materialName: 'Fresh Cream', unit: 'ml', pricePerUnit: 25, quantity: 1000, totalCost: 25000 },
  { materialName: 'Chocolate', unit: 'g', pricePerUnit: 80, quantity: 500, totalCost: 40000 },
  { materialName: 'Cake Board', unit: 'pcs', pricePerUnit: 2000, quantity: 20, totalCost: 40000 },
  { materialName: 'Packaging Box', unit: 'pcs', pricePerUnit: 3500, quantity: 20, totalCost: 70000 },
  { materialName: 'Cake Box', unit: 'pcs', pricePerUnit: 3000, quantity: 20, totalCost: 60000 },
];

export class TenantService {
  /**
   * Provisions a new Baker tenant upon first login.
   * Creates the Baker record and seeds default business materials and settings.
   */
  static async provisionTenant(email: string): Promise<Baker> {
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    return await prisma.$transaction(async (tx) => {
      // 1. Insert Baker
      const baker = await tx.baker.create({
        data: {
          email,
          status: 'PENDING_ONBOARDING',
          subscriptionStatus: 'TRIAL',
          trialStartDate: now,
          trialEndDate,
          preferredApps: ['WHATSAPP', 'INSTAGRAM'],
          defaultCollectionMethod: 'UPI',
          dynamicQrEnabled: true,
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
          purchaseDate: now,
        })),
      });

      return baker;
    });
  }
}
