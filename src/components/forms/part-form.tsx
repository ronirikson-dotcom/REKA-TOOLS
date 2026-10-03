import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ActionFooter, Card, Field, Grid, Input, Select } from "@/components/ui";
import { savePartAction } from "@/server/actions/inventory";

type Part = {
  id: string;
  sku: string;
  barcode: string | null;
  partName: string;
  categoryId: string | null;
  itemType: string;
  unit: string;
  brand: string | null;
  purchasePrice: number;
  sellingPrice: number;
  minimumStock: number;
  status: string;
};

export function PartForm({ part, categories }: { part?: Part; categories: { id: string; name: string }[] }) {
  return (
    <ActionForm action={savePartAction}>
      {part && <input type="hidden" name="id" value={part.id} />}
      <Card>
        <Grid cols={3}>
          <Field label="SKU" required>
            <Input name="sku" defaultValue={part?.sku} required className="uppercase" />
          </Field>
          <Field label="Barcode">
            <Input name="barcode" defaultValue={part?.barcode ?? ""} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={part?.status ?? "active"}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </Select>
          </Field>
          <Field label="Nama part" required className="md:col-span-2">
            <Input name="partName" defaultValue={part?.partName} required />
          </Field>
          <Field label="Merk">
            <Input name="brand" defaultValue={part?.brand ?? ""} />
          </Field>
          <Field label="Kategori">
            <Select name="categoryId" defaultValue={part?.categoryId ?? ""}>
              <option value="">-</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipe">
            <Select name="itemType" defaultValue={part?.itemType ?? "part"}>
              <option value="part">Spare part</option>
              <option value="material">Material / consumable</option>
            </Select>
          </Field>
          <Field label="Satuan" required>
            <Input name="unit" defaultValue={part?.unit ?? "pcs"} required />
          </Field>
          <Field label="Harga beli" required>
            <Input name="purchasePrice" type="number" min={0} defaultValue={part?.purchasePrice ?? 0} required />
          </Field>
          <Field label="Harga jual" required hint="Perubahan harga tercatat di audit log (BR-010)">
            <Input name="sellingPrice" type="number" min={0} defaultValue={part?.sellingPrice ?? 0} required />
          </Field>
          <Field label="Minimum stok">
            <Input name="minimumStock" type="number" min={0} step="0.01" defaultValue={part?.minimumStock ?? 0} />
          </Field>
        </Grid>
        <ActionFooter>
          <SubmitButton>Simpan part</SubmitButton>
        </ActionFooter>
      </Card>
    </ActionForm>
  );
}
