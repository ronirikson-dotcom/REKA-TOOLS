import "dotenv/config";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/wms_test";
process.env.STORAGE_DIR = "./storage-test";
