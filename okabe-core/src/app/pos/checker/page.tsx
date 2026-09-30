import type { Metadata } from "next";
import { getSession } from "@/lib/data";
import { Checker } from "./checker";

export const metadata: Metadata = { title: "Checker Display" };

export default async function CheckerPage() {
  const { role } = await getSession();
  return <Checker canUpdate={["admin", "manager", "cashier"].includes(role)} />;
}
