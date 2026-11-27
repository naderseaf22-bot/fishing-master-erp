export function formatCurrency(amount: number): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return `${num.toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ج.م`;
}

export function formatDate(isoOrDate?: string): string {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function inDateRange(
  iso: string,
  fromDate: string,
  toDate: string
): boolean {
  const day = iso.slice(0, 10);
  if (fromDate && day < fromDate) return false;
  if (toDate && day > toDate) return false;
  return true;
}

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  SALE: 'فاتورة بيع',
  SALE_RETURN: 'مرتجع بيع',
  PURCHASE: 'فاتورة شراء',
  PURCHASE_RETURN: 'مرتجع شراء',
};

export const VOUCHER_TYPE_LABELS: Record<string, string> = {
  RECEIPT: 'سند قبض',
  PAYMENT: 'سند صرف',
  TRANSFER: 'تحويل خزينة',
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CUSTOMER: 'عميل',
  SUPPLIER: 'مورد',
  TRIP_MEMBER: 'عضو رحلات',
  EXPENSE: 'مصروفات',
  REVENUE: 'إيرادات',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة / شبكة',
  CREDIT: 'آجل',
};
