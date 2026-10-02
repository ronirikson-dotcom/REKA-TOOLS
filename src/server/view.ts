import "server-only";
import type { VehicleOption } from "@/components/client/pickers";
import type { AuthContext } from "@/server/auth/context";
import { getVehicle } from "@/server/services/vehicles";

export async function vehicleOption(ctx: AuthContext, vehicleId: string | null | undefined): Promise<VehicleOption | null> {
  if (!vehicleId) return null;
  const v = await getVehicle(ctx, vehicleId).catch(() => null);
  if (!v) return null;
  return {
    id: v.id,
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    brand: v.brand?.name ?? null,
    model: v.model?.name ?? null,
    year: v.year,
    lastOdometer: v.lastOdometer,
    customerId: v.customerId,
    customerName: v.customer.name,
    customerPhone: v.customer.phone,
  };
}
