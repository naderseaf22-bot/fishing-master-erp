import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, Search } from 'lucide-react';
import { Invoice, db } from '../db';
import { getWarehouseName } from '../erpEngine';
import {
  INVOICE_TYPE_LABELS,
  VOUCHER_TYPE_LABELS,
  formatCurrency,
  formatDateTime,
  todayInputDate,
} from '../utils/format';
import { InvoicePrintModal } from './InvoicePrintPreview';
import { PrintButton, SectionHeader, StatCard } from './UiPrimitives';

export function InvoicesListScreen() {
  const invoices =
    useLiveQuery(
      () => db.invoices.orderBy('date').reverse().toArray(),
      []
    ) ?? [];
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [selected, setSelected] = useState<Invoice | null>(null);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (typeFilter !== 'ALL' && inv.type !== typeFilter) return false;
      if (!q) return true;
      const party = inv.accountId ? accountMap.get(inv.accountId)?.name ?? '' : '';
      return (
        inv.invoiceNo.toLowerCase().includes(q) ||
        party.toLowerCase().includes(q)
      );
    });
  }, [invoices, typeFilter, search, accountMap]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="سجل الفواتير"
        subtitle="استعراض وطباعة جميع فواتير المبيعات والمشتريات والمرتجعات"
        actions={<PrintButton />}
      />

      <div className="flex flex-wrap items-center gap-2 no-print">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الفاتورة أو اسم العميل / المورد..."
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pr-9 pl-3 text-sm text-neutral-100 placeholder-neutral-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        >
          <option value="ALL">جميع الأنواع</option>
          <option value="SALE">بيع</option>
          <option value="SALE_RETURN">مرتجع بيع</option>
          <option value="PURCHASE">شراء</option>
          <option value="PURCHASE_RETURN">مرتجع شراء</option>
        </select>
      </div>

      <div className="print-area overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 shadow-xs">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-950 text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-3">رقم الفاتورة</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">الطرف</th>
              <th className="px-4 py-3">المخزن</th>
              <th className="px-4 py-3">الصافي</th>
              <th className="px-4 py-3">المدفوع</th>
              <th className="px-4 py-3">المتبقي</th>
              <th className="px-4 py-3 no-print">طباعة / عرض</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filtered.map((inv) => (
              <tr key={inv.id} className="hover:bg-neutral-800/50">
                <td className="px-4 py-2.5 font-mono font-bold text-sky-400">
                  {inv.invoiceNo}
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-semibold text-neutral-200">
                    {INVOICE_TYPE_LABELS[inv.type]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-400">
                  {formatDateTime(inv.date)}
                </td>
                <td className="px-4 py-2.5">
                  {inv.accountId ? accountMap.get(inv.accountId)?.name ?? '—' : 'نقدي'}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-300">
                  {getWarehouseName(inv.warehouseId)}
                </td>
                <td className="px-4 py-2.5 font-bold">
                  {formatCurrency(inv.netTotal)}
                </td>
                <td className="px-4 py-2.5 text-emerald-400">
                  {formatCurrency(inv.paidAmount)}
                </td>
                <td className="px-4 py-2.5 text-rose-400">
                  {formatCurrency(inv.remainingAmount)}
                </td>
                <td className="px-4 py-2.5 no-print">
                  <button
                    type="button"
                    onClick={() => setSelected(inv)}
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    معاينة وطباعة
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-neutral-500">
                  لا توجد فواتير مطابقة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <InvoicePrintModal
          invoice={selected}
          party={selected.accountId ? accountMap.get(selected.accountId) ?? null : null}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export function DailyMovementScreen() {
  const [targetDate, setTargetDate] = useState(todayInputDate());
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];
  const vouchers = useLiveQuery(() => db.vouchers.toArray(), []) ?? [];
  const stockLogs = useLiveQuery(() => db.stockLogs.toArray(), []) ?? [];

  const dayInvoices = useMemo(
    () => invoices.filter((i) => i.date.slice(0, 10) === targetDate),
    [invoices, targetDate]
  );
  const dayVouchers = useMemo(
    () => vouchers.filter((v) => v.date.slice(0, 10) === targetDate),
    [vouchers, targetDate]
  );
  const dayStockLogs = useMemo(
    () => stockLogs.filter((l) => l.date.slice(0, 10) === targetDate),
    [stockLogs, targetDate]
  );

  const totalSales = dayInvoices
    .filter((i) => i.type === 'SALE')
    .reduce((s, i) => s + i.netTotal, 0);
  const totalPurchases = dayInvoices
    .filter((i) => i.type === 'PURCHASE')
    .reduce((s, i) => s + i.netTotal, 0);
  const totalReceipts = dayVouchers
    .filter((v) => v.type === 'RECEIPT')
    .reduce((s, v) => s + v.amount, 0);
  const totalPayments = dayVouchers
    .filter((v) => v.type === 'PAYMENT')
    .reduce((s, v) => s + v.amount, 0);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="الحركة اليومية"
        subtitle="ملخص جميع فواتير وحركات الخزينة والمخزن ليوم محدد"
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100"
            />
            <PrintButton />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="مبيعات اليوم" value={formatCurrency(totalSales)} tone="emerald" />
        <StatCard label="مشتريات اليوم" value={formatCurrency(totalPurchases)} tone="sky" />
        <StatCard label="مقبوضات الخزينة" value={formatCurrency(totalReceipts)} tone="emerald" />
        <StatCard label="مدفوعات الخزينة" value={formatCurrency(totalPayments)} tone="rose" />
      </div>

      <div className="print-area grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="mb-3 font-bold text-neutral-200">
            فواتير اليوم ({dayInvoices.length})
          </h3>
          <div className="space-y-2">
            {dayInvoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-mono font-bold text-sky-400">
                    {inv.invoiceNo}
                  </span>{' '}
                  <span className="text-xs text-neutral-400">
                    ({INVOICE_TYPE_LABELS[inv.type]})
                  </span>
                </div>
                <div className="font-bold">{formatCurrency(inv.netTotal)}</div>
              </div>
            ))}
            {dayInvoices.length === 0 && (
              <p className="text-sm text-neutral-500">لا توجد فواتير في هذا اليوم.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="mb-3 font-bold text-neutral-200">
            حركات الخزينة والمخزن ({dayVouchers.length + dayStockLogs.length})
          </h3>
          <div className="space-y-2">
            {dayVouchers.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-semibold">
                    {VOUCHER_TYPE_LABELS[v.type]}
                  </span>{' '}
                  <span className="text-xs text-neutral-400">— {v.notes}</span>
                </div>
                <div
                  className={`font-bold ${
                    v.type === 'RECEIPT'
                      ? 'text-emerald-400'
                      : v.type === 'PAYMENT'
                      ? 'text-rose-400'
                      : 'text-sky-400'
                  }`}
                >
                  {formatCurrency(v.amount)}
                </div>
              </div>
            ))}
            {dayStockLogs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-amber-800/40 bg-amber-950/30 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-semibold">{l.itemName}</span>{' '}
                  <span className="text-xs text-neutral-400">— {l.notes}</span>
                </div>
                <div className="font-mono font-bold text-amber-400">
                  {l.qtyDiff > 0 ? `+${l.qtyDiff}` : l.qtyDiff}
                </div>
              </div>
            ))}
            {dayVouchers.length === 0 && dayStockLogs.length === 0 && (
              <p className="text-sm text-neutral-500">لا توجد حركات خزينة أو مخزن.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
