export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type CashFlowCategory = "operating" | "investing" | "financing";
export type JournalStatus = "draft" | "posted";
export type PeriodStatus = "open" | "closed";
export type AppRole = "admin" | "accountant" | "viewer";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  created_at: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parent_id: string | null;
  is_postable: boolean;
  is_cash: boolean;
  cash_flow_category: CashFlowCategory;
  is_active: boolean;
  description: string | null;
}

export interface FiscalPeriod {
  id: string;
  year: number;
  month: number;
  status: PeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
}

export interface JournalEntry {
  id: string;
  entry_no: string;
  entry_date: string;
  description: string;
  source_type: string;
  source_ref: string | null;
  status: JournalStatus;
  reversal_of: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JournalLine {
  id: string;
  entry_id: string;
  line_no: number;
  account_id: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface AccountActivity {
  account_id: string;
  opening: number;
  period_debit: number;
  period_credit: number;
}

export interface AuditLog {
  id: number;
  occurred_at: string;
  user_id: string | null;
  user_email: string | null;
  ip_address: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  note: string | null;
}
