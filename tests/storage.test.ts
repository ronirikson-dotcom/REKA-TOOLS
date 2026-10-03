import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadFile, saveFile } from "@/server/storage";

/** Server tiruan yang meniru endpoint Supabase Storage (/storage/v1/object/:bucket/:path) */
type Req = { method: string; url: string; headers: IncomingMessage["headers"]; body: Buffer };
const requests: Req[] = [];
const objects = new Map<string, { type: string; body: Buffer }>();
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      requests.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      const key = decodeURIComponent(req.url!.replace("/storage/v1/object/", ""));
      if (req.method === "POST") {
        objects.set(key, { type: String(req.headers["content-type"]), body });
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ Key: key }));
      } else if (objects.has(key)) {
        res.writeHead(200, { "content-type": objects.get(key)!.type }).end(objects.get(key)!.body);
      } else {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

afterEach(() => {
  requests.length = 0;
  for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET", "VERCEL"]) delete process.env[k];
});

const companyId = "1b2ea05c-7853-4d04-ae71-2b4a55c8f3cc";
const photo = { fileName: "Depan Mobil.JPG", mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) };

describe("storage — Supabase Storage", () => {
  it("upload & unduh dengan secret key baru (sb_secret_...)", async () => {
    process.env.SUPABASE_URL = `${baseUrl}/`;
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

    const rel = await saveFile(companyId, photo);
    expect(rel).toMatch(new RegExp(`^${companyId}/\\d{6}/[0-9a-f-]{36}\\.jpg$`));

    const [put] = requests;
    expect(put.method).toBe("POST");
    expect(put.url).toBe(`/storage/v1/object/wms-files/${rel}`);
    expect(put.headers.apikey).toBe("sb_secret_test");
    expect(put.headers.authorization).toBeUndefined();
    expect(put.headers["content-type"]).toBe("image/jpeg");
    expect(put.headers["x-upsert"]).toBe("false");
    expect(put.body.equals(photo.data)).toBe(true);

    const back = await loadFile(rel);
    expect(back.equals(photo.data)).toBe(true);
    expect(requests[1].method).toBe("GET");
    expect(requests[1].headers.apikey).toBe("sb_secret_test");
  });

  it("key JWT lama (service_role) dikirim juga sebagai Bearer, bucket bisa diganti", async () => {
    process.env.SUPABASE_URL = baseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiJ9.test.sig";
    process.env.SUPABASE_STORAGE_BUCKET = "bengkel";

    const rel = await saveFile(companyId, { ...photo, fileName: "nota.pdf", mimeType: "application/pdf" });
    expect(requests[0].url).toBe(`/storage/v1/object/bengkel/${rel}`);
    expect(requests[0].headers.authorization).toBe("Bearer eyJhbGciOiJIUzI1NiJ9.test.sig");
  });

  it("file yang tidak ada → NotFound; path aneh ditolak tanpa request", async () => {
    process.env.SUPABASE_URL = baseUrl;
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    await expect(loadFile(`${companyId}/202610/00000000-0000-0000-0000-000000000000.jpg`)).rejects.toThrow("File tidak ditemukan");
    await expect(loadFile(`${companyId}/../../etc/passwd`)).rejects.toThrow("Path tidak valid");
    expect(requests).toHaveLength(1);
  });

  it("validasi tipe & ukuran tetap berlaku sebelum upload", async () => {
    process.env.SUPABASE_URL = baseUrl;
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    await expect(saveFile(companyId, { ...photo, mimeType: "text/html" })).rejects.toThrow("tidak didukung");
    await expect(saveFile(companyId, { ...photo, data: Buffer.alloc(5 * 1024 * 1024 + 1) })).rejects.toThrow("maksimal 5MB");
    expect(requests).toHaveLength(0);
  });

  it("di Vercel tanpa konfigurasi Supabase → pesan jelas, bukan error filesystem", async () => {
    process.env.VERCEL = "1";
    await expect(saveFile(companyId, photo)).rejects.toThrow("Penyimpanan file belum dikonfigurasi");
  });
});

describe("storage — folder lokal", () => {
  it("simpan & baca kembali, tolak path traversal", async () => {
    const rel = await saveFile(companyId, photo);
    expect((await loadFile(rel)).equals(photo.data)).toBe(true);
    await expect(loadFile("../package.json")).rejects.toThrow("Path tidak valid");
    expect(requests).toHaveLength(0);
  });
});
