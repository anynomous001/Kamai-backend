/**
 * Order Number Service
 *
 * Generates human-readable, unique order numbers.
 * Example format: ORD-20260726-00001
 *
 * Note: A robust implementation in production should use a database sequence
 * or counter table to ensure uniqueness across concurrent requests. For now,
 * we generate a random 5-digit number appended to the date.
 */
export class OrderNumberService {
  /**
   * Generates a new order number based on the current date.
   */
  async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    
    // Generate a random 5-digit number between 10000 and 99999
    const randomSequence = Math.floor(10000 + Math.random() * 90000);

    return `ORD-${dateStr}-${randomSequence}`;
  }
}

export const orderNumberService = new OrderNumberService();
