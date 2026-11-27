import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { WAREHOUSES, db } from '../db';
import {
  computeTreasuryBalances,
  computeTripFinancials,
  getTreasuryName,
  getWarehouseName,
} from '../erpEngine';
import {
  ACCOUNT_TYPE_LABELS,
  INVOICE_TYPE_LABELS,
  VOUCHER_TYPE_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  inDateRange,
  todayInputDate,
} from '../utils/format';
import { PrintButton, SectionHeader, StatCard } from './UiPrimitives';

export type ReportTab =
  | 'daily'
  | 'sales-analysis'
  | 'best-sellers'
  | 'dormant-items'
  | 'purchase-analysis'
  | 'treasury'
  | 'pnl'
  | 'trips'
  | 'account-statement'
  | 'account-items'
  | 'cheques-installments'
  | 'historical-balances'
  | 'expenses-analysis'
  | 'receipts-analysis'
  | 'item-movement'
  | 'warehouse-goods'
  | 'item-expiry'
  | 'stock-count-report';

const MAIN_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'daily', label: 'تقرير الحركة اليومية' },
  { id: 'sales-analysis', label: 'تقرير تحليل المبيعات' },
  { id: 'purchase-analysis', label: 'تقرير تحليل المشتريات' },
  { id: 'treasury', label: 'تقرير الخزينة' },
  { id: 'pnl', label: 'الأرباح والخسائر' },
  { id: 'trips', label: 'تقرير الرحلات' },
];

const SIDE_REPORTS: Array<{ id: ReportTab; label: string }> = [
  { id: 'best-sellers', label: 'الأصناف الأكثر مبيعاً' },
  { id: 'dormant-items', label: 'الأصناف الراقدة' },
  { id: 'account-statement', label: 'كشف حساب' },
  { id: 'account-items', label: 'كشف حساب بالأصناف' },
  { id: 'cheques-installments', label: 'الشيكات والأقساط' },
  { id: 'historical-balances', label: 'أرصدة الحسابات بتاريخ سابق' },
  { id: 'expenses-analysis', label: 'تحليل المصروفات' },
  { id: 'receipts-analysis', label: 'تحليل المقبوضات' },
  { id: 'item-movement', label: 'تقرير حركة الصنف' },
  { id: 'warehouse-goods', label: 'تقرير بضاعة مخزن' },
  { id: 'item-expiry', label: 'صلاحية الأصناف' },
  { id: 'stock-count-report', label: 'جرد مخزني' },
];

export function ReportsScreen({
  initialTab = 'daily',
}: {
  initialTab?: ReportTab;
}) {
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(todayInputDate());
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('MAIN_WH');
  const [bestSellerSort, setBestSellerSort] = useState<'QTY' | 'REVENUE'>('QTY');

  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const stocks = useLiveQuery(() => db.stocks.toArray(), []) ?? [];
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];
  const vouchers = useLiveQuery(() => db.vouchers.toArray(), []) ?? [];
  const stockLogs = useLiveQuery(() => db.stockLogs.toArray(), []) ?? [];
  const trips = useLiveQuery(() => db.trips.toArray(), []) ?? [];

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const filteredInvoices = useMemo(
    () => invoices.filter((i) => inDateRange(i.date, fromDate, toDate)),
    [invoices, fromDate, toDate]
  );
  const filteredVouchers = useMemo(
    () => vouchers.filter((v) => inDateRange(v.date, fromDate, toDate)),
    [vouchers, fromDate, toDate]
  );
  const filteredLogs = useMemo(
    () => stockLogs.filter((l) => inDateRange(l.date, fromDate, toDate)),
    [stockLogs, fromDate, toDate]
  );
  const filteredTrips = useMemo(
    () => trips.filter((t) => inDateRange(t.startDate, fromDate, toDate)),
    [trips, fromDate, toDate]
  );

  const effectiveAccountId = selectedAccountId || accounts[0]?.id || '';
  const effectiveItemId = selectedItemId || items[0]?.id || '';

  // Sales & Cost of Goods Sold analytics
  const salesAnalytics = useMemo(() => {
    const saleInvs = filteredInvoices.filter((i) => i.type === 'SALE');
    const returnInvs = filteredInvoices.filter((i) => i.type === 'SALE_RETURN');

    let grossSales = 0;
    let totalReturns = 0;
    let cogs = 0;
    const byItem = new Map<
      string,
      { name: string; qty: number; revenue: number; cost: number }
    >();

    for (const inv of saleInvs) {
      grossSales += inv.netTotal;
      for (const line of inv.items) {
        const lineCost = line.qty * line.costAtTime;
        cogs += lineCost;
        const prev = byItem.get(line.itemId) ?? {
          name: line.name,
          qty: 0,
          revenue: 0,
          cost: 0,
        };
        byItem.set(line.itemId, {
          name: line.name,
          qty: prev.qty + line.qty,
          revenue: prev.revenue + line.total,
          cost: prev.cost + lineCost,
        });
      }
    }

    for (const inv of returnInvs) {
      totalReturns += inv.netTotal;
      for (const line of inv.items) {
        cogs -= line.qty * line.costAtTime;
      }
    }

    const netSales = grossSales - totalReturns;
    const grossProfit = netSales - cogs;
    return {
      grossSales,
      totalReturns,
      netSales,
      cogs,
      grossProfit,
      rows: Array.from(byItem.entries()).map(([id, v]) => ({ id, ...v })),
    };
  }, [filteredInvoices]);

  // Best Sellers (sorted by qty or revenue)
  const bestSellersRows = useMemo(() => {
    return [...salesAnalytics.rows].sort((a, b) =>
      bestSellerSort === 'QTY' ? b.qty - a.qty : b.revenue - a.revenue
    );
  }, [salesAnalytics.rows, bestSellerSort]);

  // Dormant Items (items with stock > 0 and 0 sales during selected period)
  const dormantItemsRows = useMemo(() => {
    const soldItemIds = new Set(salesAnalytics.rows.map((r) => r.id));
    const stockTotals = new Map<string, number>();
    for (const s of stocks) {
      stockTotals.set(s.itemId, (stockTotals.get(s.itemId) ?? 0) + s.quantity);
    }

    return items
      .map((it) => {
        const totalQty = stockTotals.get(it.id) ?? 0;
        return {
          item: it,
          totalQty,
          stockValue: totalQty * it.avgCost,
        };
      })
      .filter((row) => row.totalQty > 0 && !soldItemIds.has(row.item.id))
      .sort((a, b) => b.stockValue - a.stockValue);
  }, [items, stocks, salesAnalytics.rows]);

  // Purchases analytics
  const purchaseAnalytics = useMemo(() => {
    const purInvs = filteredInvoices.filter((i) => i.type === 'PURCHASE');
    const retInvs = filteredInvoices.filter((i) => i.type === 'PURCHASE_RETURN');
    const grossPurchases = purInvs.reduce((s, i) => s + i.netTotal, 0);
    const returns = retInvs.reduce((s, i) => s + i.netTotal, 0);

    const byItem = new Map<string, { name: string; qty: number; total: number }>();
    for (const inv of purInvs) {
      for (const line of inv.items) {
        const prev = byItem.get(line.itemId) ?? { name: line.name, qty: 0, total: 0 };
        byItem.set(line.itemId, {
          name: line.name,
          qty: prev.qty + line.qty,
          total: prev.total + line.total,
        });
      }
    }
    return {
      grossPurchases,
      returns,
      netPurchases: grossPurchases - returns,
      rows: Array.from(byItem.entries()).map(([id, v]) => ({ id, ...v })),
    };
  }, [filteredInvoices]);

  const treasuryBalances = useMemo(
    () => computeTreasuryBalances(vouchers),
    [vouchers]
  );

  // P&L summary
  const pnlSummary = useMemo(() => {
    const tripProfits = filteredTrips.reduce(
      (s, t) => s + computeTripFinancials(t).netProfit,
      0
    );
    const generalExpenses = filteredVouchers
      .filter((v) => v.type === 'PAYMENT' && !v.accountId && !v.tripId)
      .reduce((s, v) => s + v.amount, 0);
    const netProfit = salesAnalytics.grossProfit + tripProfits - generalExpenses;
    return { tripProfits, generalExpenses, netProfit };
  }, [filteredTrips, filteredVouchers, salesAnalytics.grossProfit]);

  const allReportTitle =
    [...MAIN_TABS, ...SIDE_REPORTS].find((r) => r.id === activeTab)?.label ??
    'التقارير';

  return (
    <div className="space-y-4">
      <SectionHeader
        title="مركز التقارير والتحليلات"
        subtitle={`التقرير الحالي: ${allReportTitle}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="no-print flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-neutral-400">من:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100"
              />
              <span className="font-semibold text-neutral-400">إلى:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100"
              />
            </div>
            <PrintButton />
          </div>
        }
      />

      {/* Main 6 Report Cards/Tabs */}
      <div className="no-print grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
              activeTab === tab.id
                ? 'border-sky-600 bg-sky-700 text-white shadow-xs'
                : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Sidebar Detailed Reports */}
        <aside className="no-print space-y-1.5 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 lg:col-span-3">
          <div className="px-2 py-1 text-xs font-bold text-neutral-400">
            التقارير التفصيلية
          </div>
          {SIDE_REPORTS.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => setActiveTab(rep.id)}
              className={`w-full rounded-xl px-3 py-2 text-right text-sm font-medium transition ${
                activeTab === rep.id
                  ? 'border border-sky-700 bg-sky-950/60 font-bold text-sky-300'
                  : 'text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {rep.label}
            </button>
          ))}
        </aside>

        {/* Report Body */}
        <div className="print-area space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs lg:col-span-9">
          <div className="border-b border-neutral-800 pb-3">
            <h3 className="text-lg font-bold text-white">{allReportTitle}</h3>
            <p className="text-xs text-neutral-400">
              الفترة من {formatDate(fromDate)} إلى {formatDate(toDate)}
            </p>
          </div>

          {activeTab === 'daily' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="إجمالي الفواتير" value={`${filteredInvoices.length}`} />
                <StatCard label="السندات" value={`${filteredVouchers.length}`} />
                <StatCard label="حركات المخزن" value={`${filteredLogs.length}`} />
                <StatCard
                  label="صافي المبيعات"
                  value={formatCurrency(salesAnalytics.netSales)}
                  tone="emerald"
                />
              </div>
              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">النوع</th>
                    <th className="px-3 py-2">المرجع</th>
                    <th className="px-3 py-2">القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filteredInvoices.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 text-xs text-neutral-400">{formatDateTime(i.date)}</td>
                      <td className="px-3 py-2">{INVOICE_TYPE_LABELS[i.type]}</td>
                      <td className="px-3 py-2 font-mono text-sky-400">{i.invoiceNo}</td>
                      <td className="px-3 py-2 font-bold">{formatCurrency(i.netTotal)}</td>
                    </tr>
                  ))}
                  {filteredVouchers.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 text-xs text-neutral-400">{formatDateTime(v.date)}</td>
                      <td className="px-3 py-2">{VOUCHER_TYPE_LABELS[v.type]}</td>
                      <td className="px-3 py-2 font-mono text-sky-400">{v.voucherNo}</td>
                      <td className="px-3 py-2 font-bold">{formatCurrency(v.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'sales-analysis' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="إجمالي المبيعات" value={formatCurrency(salesAnalytics.grossSales)} tone="sky" />
                <StatCard label="مرتجع المبيعات" value={formatCurrency(salesAnalytics.totalReturns)} tone="rose" />
                <StatCard label="تكلفة البضاعة المباعة" value={formatCurrency(salesAnalytics.cogs)} tone="amber" />
                <StatCard label="مجمل ربح المبيعات" value={formatCurrency(salesAnalytics.grossProfit)} tone="emerald" />
              </div>
              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">الصنف</th>
                    <th className="px-3 py-2">الكمية المباعة</th>
                    <th className="px-3 py-2">إجمالي الإيراد</th>
                    <th className="px-3 py-2">التكلفة</th>
                    <th className="px-3 py-2">الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {salesAnalytics.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-semibold">{r.name}</td>
                      <td className="px-3 py-2">{r.qty}</td>
                      <td className="px-3 py-2">{formatCurrency(r.revenue)}</td>
                      <td className="px-3 py-2 text-neutral-400">{formatCurrency(r.cost)}</td>
                      <td className="px-3 py-2 font-bold text-emerald-400">
                        {formatCurrency(r.revenue - r.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'best-sellers' && (
            <div className="space-y-4">
              <div className="no-print flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-neutral-400">
                  ترتيب الأصناف الأكثر مبيعاً خلال الفترة المحددة
                </div>
                <div className="inline-flex rounded-lg border border-neutral-700 bg-neutral-950 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setBestSellerSort('QTY')}
                    className={`rounded-md px-3 py-1 font-bold ${
                      bestSellerSort === 'QTY'
                        ? 'bg-sky-700 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    حسب الكمية المباعة
                  </button>
                  <button
                    type="button"
                    onClick={() => setBestSellerSort('REVENUE')}
                    className={`rounded-md px-3 py-1 font-bold ${
                      bestSellerSort === 'REVENUE'
                        ? 'bg-emerald-700 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    حسب القيمة المباعة
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="أصناف تحركت بالبيع"
                  value={`${bestSellersRows.length} صنف`}
                  tone="sky"
                />
                <StatCard
                  label="الأكثر كمية"
                  value={bestSellersRows[0]?.name ?? '—'}
                  hint={bestSellersRows[0] ? `${bestSellersRows[0].qty} وحدة` : undefined}
                  tone="emerald"
                />
                <StatCard
                  label="إجمالي مبيعات القائمة"
                  value={formatCurrency(
                    bestSellersRows.reduce((s, r) => s + r.revenue, 0)
                  )}
                  tone="amber"
                />
              </div>

              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">الكود</th>
                    <th className="px-3 py-2">الصنف</th>
                    <th className="px-3 py-2">الكمية المباعة</th>
                    <th className="px-3 py-2">القيمة المباعة</th>
                    <th className="px-3 py-2">صافي الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {bestSellersRows.map((r, idx) => {
                    const item = itemMap.get(r.id);
                    return (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                          {item?.code ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-semibold text-neutral-100">
                          {r.name}
                        </td>
                        <td className="px-3 py-2 font-bold text-sky-400">{r.qty}</td>
                        <td className="px-3 py-2 font-bold">{formatCurrency(r.revenue)}</td>
                        <td className="px-3 py-2 font-bold text-emerald-400">
                          {formatCurrency(r.revenue - r.cost)}
                        </td>
                      </tr>
                    );
                  })}
                  {bestSellersRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        لا توجد مبيعات مسجلة خلال الفترة المحددة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'dormant-items' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="عدد الأصناف الراقدة"
                  value={`${dormantItemsRows.length} صنف`}
                  tone="amber"
                />
                <StatCard
                  label="إجمالي الكميات الراقدة"
                  value={`${dormantItemsRows.reduce((s, r) => s + r.totalQty, 0)} وحدة`}
                  tone="slate"
                />
                <StatCard
                  label="رأس المال المجمد (بالتكلفة)"
                  value={formatCurrency(
                    dormantItemsRows.reduce((s, r) => s + r.stockValue, 0)
                  )}
                  tone="rose"
                />
              </div>

              <p className="text-xs text-neutral-400">
                الأصناف التالية لها رصيد متاح بالمخازن ولم تسجل أي حركة بيع خلال الفترة من{' '}
                {formatDate(fromDate)} إلى {formatDate(toDate)}.
              </p>

              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">الكود</th>
                    <th className="px-3 py-2">الصنف</th>
                    <th className="px-3 py-2">التصنيف</th>
                    <th className="px-3 py-2">الرصيد المتاح</th>
                    <th className="px-3 py-2">متوسط التكلفة</th>
                    <th className="px-3 py-2">قيمة المخزون الراقد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {dormantItemsRows.map(({ item, totalQty, stockValue }) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                        {item.code}
                      </td>
                      <td className="px-3 py-2 font-semibold text-neutral-100">
                        {item.name}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-400">
                        {item.category}
                      </td>
                      <td className="px-3 py-2 font-bold text-amber-400">
                        {totalQty} {item.unit}
                      </td>
                      <td className="px-3 py-2">{formatCurrency(item.avgCost)}</td>
                      <td className="px-3 py-2 font-bold text-rose-400">
                        {formatCurrency(stockValue)}
                      </td>
                    </tr>
                  ))}
                  {dormantItemsRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-emerald-400">
                        ممتاز! جميع الأصناف المتوفرة بالمخازن تحركت بالبيع خلال هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'purchase-analysis' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label="إجمالي المشتريات" value={formatCurrency(purchaseAnalytics.grossPurchases)} tone="sky" />
                <StatCard label="مرتجع المشتريات" value={formatCurrency(purchaseAnalytics.returns)} tone="amber" />
                <StatCard label="صافي المشتريات" value={formatCurrency(purchaseAnalytics.netPurchases)} tone="emerald" />
              </div>
              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">الصنف</th>
                    <th className="px-3 py-2">الكمية المشتراة</th>
                    <th className="px-3 py-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {purchaseAnalytics.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-semibold">{r.name}</td>
                      <td className="px-3 py-2">{r.qty}</td>
                      <td className="px-3 py-2 font-bold">{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'treasury' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="إجمالي الخزائن" value={formatCurrency(treasuryBalances.total)} tone="sky" />
                <StatCard label="الخزينة الرئيسية" value={formatCurrency(treasuryBalances.MAIN_TR ?? 0)} tone="emerald" />
                <StatCard label="البنك / الشبكة" value={formatCurrency(treasuryBalances.BANK_TR ?? 0)} tone="emerald" />
                <StatCard label="عهدة الرحلات" value={formatCurrency(treasuryBalances.SUB_TR ?? 0)} tone="amber" />
              </div>
              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">السند</th>
                    <th className="px-3 py-2">النوع</th>
                    <th className="px-3 py-2">الخزينة</th>
                    <th className="px-3 py-2">المبلغ</th>
                    <th className="px-3 py-2">البيان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filteredVouchers.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 font-mono text-sky-400">{v.voucherNo}</td>
                      <td className="px-3 py-2">{VOUCHER_TYPE_LABELS[v.type]}</td>
                      <td className="px-3 py-2">{getTreasuryName(v.treasuryId)}</td>
                      <td className="px-3 py-2 font-bold">{formatCurrency(v.amount)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">{v.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'pnl' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="مجمل ربح المبيعات" value={formatCurrency(salesAnalytics.grossProfit)} tone="sky" />
                <StatCard label="صافي أرباح الرحلات" value={formatCurrency(pnlSummary.tripProfits)} tone="emerald" />
                <StatCard label="مصروفات عامة" value={formatCurrency(pnlSummary.generalExpenses)} tone="rose" />
                <StatCard
                  label="صافي الربح / الخسارة"
                  value={formatCurrency(pnlSummary.netProfit)}
                  tone={pnlSummary.netProfit >= 0 ? 'emerald' : 'rose'}
                />
              </div>
            </div>
          )}

          {activeTab === 'trips' && (
            <table className="w-full text-right text-sm">
              <thead className="bg-neutral-950 text-xs text-neutral-400">
                <tr>
                  <th className="px-3 py-2">الرحلة</th>
                  <th className="px-3 py-2">الوجهة</th>
                  <th className="px-3 py-2">الأعضاء</th>
                  <th className="px-3 py-2">الاشتراكات</th>
                  <th className="px-3 py-2">تكلفة المعدات</th>
                  <th className="px-3 py-2">المصروفات</th>
                  <th className="px-3 py-2">الصافي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredTrips.map((tr) => {
                  const fin = computeTripFinancials(tr);
                  return (
                    <tr key={tr.id}>
                      <td className="px-3 py-2 font-semibold">{tr.title}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">{tr.destination}</td>
                      <td className="px-3 py-2">{tr.members.length}</td>
                      <td className="px-3 py-2">{formatCurrency(fin.totalFees)}</td>
                      <td className="px-3 py-2">{formatCurrency(fin.gearCost)}</td>
                      <td className="px-3 py-2">{formatCurrency(fin.cashExpenses)}</td>
                      <td
                        className={`px-3 py-2 font-bold ${
                          fin.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatCurrency(fin.netProfit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {(activeTab === 'account-statement' || activeTab === 'account-items') && (
            <div className="space-y-4">
              <div className="no-print flex items-center gap-2">
                <label className="text-xs font-semibold text-neutral-400">اختر الحساب:</label>
                <select
                  value={effectiveAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({ACCOUNT_TYPE_LABELS[a.type]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
                الرصيد الحالي:{' '}
                <strong>
                  {formatCurrency(
                    Math.abs(accountMap.get(effectiveAccountId)?.balance ?? 0)
                  )}
                </strong>{' '}
                (
                {(accountMap.get(effectiveAccountId)?.balance ?? 0) > 0
                  ? 'عليه / مدين'
                  : (accountMap.get(effectiveAccountId)?.balance ?? 0) < 0
                  ? 'له / دائن'
                  : 'متزن'}
                )
              </div>
              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">المرجع</th>
                    <th className="px-3 py-2">البيان</th>
                    <th className="px-3 py-2">القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filteredInvoices
                    .filter((i) => i.accountId === effectiveAccountId)
                    .map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-3 py-2 text-xs text-neutral-400">{formatDateTime(inv.date)}</td>
                        <td className="px-3 py-2 font-mono text-sky-400">{inv.invoiceNo}</td>
                        <td className="px-3 py-2">
                          {INVOICE_TYPE_LABELS[inv.type]}
                          {activeTab === 'account-items' && (
                            <div className="mt-1 text-xs text-neutral-400">
                              {inv.items
                                .map((it) => `${it.name} × ${it.qty}`)
                                .join(' | ')}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-bold">
                          {formatCurrency(inv.netTotal)}
                        </td>
                      </tr>
                    ))}
                  {filteredVouchers
                    .filter((v) => v.accountId === effectiveAccountId)
                    .map((v) => (
                      <tr key={v.id}>
                        <td className="px-3 py-2 text-xs text-neutral-400">{formatDateTime(v.date)}</td>
                        <td className="px-3 py-2 font-mono text-sky-400">{v.voucherNo}</td>
                        <td className="px-3 py-2">
                          {VOUCHER_TYPE_LABELS[v.type]} — {v.notes}
                        </td>
                        <td className="px-3 py-2 font-bold">{formatCurrency(v.amount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'cheques-installments' && (
            <div className="space-y-4">
              <h4 className="font-bold text-neutral-200">
                الذمم الآجلة والأقساط المستحقة (فواتير غير مسددة + متبقي رحلات)
              </h4>
              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">المصدر</th>
                    <th className="px-3 py-2">الطرف</th>
                    <th className="px-3 py-2">الإجمالي</th>
                    <th className="px-3 py-2">المدفوع</th>
                    <th className="px-3 py-2">المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {invoices
                    .filter((i) => i.remainingAmount > 0)
                    .map((i) => (
                      <tr key={i.id}>
                        <td className="px-3 py-2 font-mono text-sky-400">{i.invoiceNo}</td>
                        <td className="px-3 py-2">
                          {i.accountId ? accountMap.get(i.accountId)?.name : '—'}
                        </td>
                        <td className="px-3 py-2">{formatCurrency(i.netTotal)}</td>
                        <td className="px-3 py-2">{formatCurrency(i.paidAmount)}</td>
                        <td className="px-3 py-2 font-bold text-rose-400">
                          {formatCurrency(i.remainingAmount)}
                        </td>
                      </tr>
                    ))}
                  {trips.flatMap((t) =>
                    t.members
                      .filter((m) => m.remaining > 0)
                      .map((m) => (
                        <tr key={`${t.id}_${m.accountId}`}>
                          <td className="px-3 py-2">قسط رحلة: {t.title}</td>
                          <td className="px-3 py-2">{m.name}</td>
                          <td className="px-3 py-2">{formatCurrency(m.fee)}</td>
                          <td className="px-3 py-2">{formatCurrency(m.paid)}</td>
                          <td className="px-3 py-2 font-bold text-amber-400">
                            {formatCurrency(m.remaining)}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'historical-balances' && (
            <table className="w-full text-right text-sm">
              <thead className="bg-neutral-950 text-xs text-neutral-400">
                <tr>
                  <th className="px-3 py-2">الحساب</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">الرصيد الحالي</th>
                  <th className="px-3 py-2">الرصيد بتاريخ {formatDate(toDate)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {accounts.map((acc) => {
                  let hist = acc.balance;
                  for (const inv of invoices) {
                    if (inv.accountId !== acc.id || inv.date.slice(0, 10) <= toDate) continue;
                    if (inv.type === 'SALE') hist -= inv.remainingAmount;
                    else if (inv.type === 'SALE_RETURN') hist += inv.remainingAmount;
                    else if (inv.type === 'PURCHASE') hist += inv.remainingAmount;
                    else if (inv.type === 'PURCHASE_RETURN') hist -= inv.remainingAmount;
                  }
                  for (const v of vouchers) {
                    if (v.accountId !== acc.id || v.date.slice(0, 10) <= toDate) continue;
                    if (v.type === 'RECEIPT') hist += v.amount;
                    else if (v.type === 'PAYMENT') hist -= v.amount;
                  }
                  for (const t of trips) {
                    if (t.startDate.slice(0, 10) <= toDate) continue;
                    const mem = t.members.find((m) => m.accountId === acc.id);
                    if (mem) hist -= mem.fee;
                  }
                  return (
                    <tr key={acc.id}>
                      <td className="px-3 py-2 font-semibold">{acc.name}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">{ACCOUNT_TYPE_LABELS[acc.type]}</td>
                      <td className="px-3 py-2">{formatCurrency(acc.balance)}</td>
                      <td className="px-3 py-2 font-bold text-sky-400">
                        {formatCurrency(hist)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {activeTab === 'expenses-analysis' && (
            <table className="w-full text-right text-sm">
              <thead className="bg-neutral-950 text-xs text-neutral-400">
                <tr>
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">التصنيف</th>
                  <th className="px-3 py-2">البيان</th>
                  <th className="px-3 py-2">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredVouchers
                  .filter((v) => v.type === 'PAYMENT')
                  .map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 text-xs text-neutral-400">{formatDateTime(v.date)}</td>
                      <td className="px-3 py-2">{v.expenseCategory || 'صرف نقدية'}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">{v.notes}</td>
                      <td className="px-3 py-2 font-bold text-rose-400">
                        {formatCurrency(v.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {activeTab === 'receipts-analysis' && (
            <table className="w-full text-right text-sm">
              <thead className="bg-neutral-950 text-xs text-neutral-400">
                <tr>
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">السند</th>
                  <th className="px-3 py-2">البيان</th>
                  <th className="px-3 py-2">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredVouchers
                  .filter((v) => v.type === 'RECEIPT')
                  .map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 text-xs text-neutral-400">{formatDateTime(v.date)}</td>
                      <td className="px-3 py-2 font-mono text-sky-400">{v.voucherNo}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">{v.notes}</td>
                      <td className="px-3 py-2 font-bold text-emerald-400">
                        {formatCurrency(v.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {activeTab === 'item-movement' && (
            <div className="space-y-4">
              <div className="no-print flex items-center gap-2">
                <label className="text-xs font-semibold text-neutral-400">اختر الصنف:</label>
                <select
                  value={effectiveItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100"
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </select>
              </div>
              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">الحركة</th>
                    <th className="px-3 py-2">الكمية</th>
                    <th className="px-3 py-2">السعر / الأثر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filteredInvoices.flatMap((inv) =>
                    inv.items
                      .filter((l) => l.itemId === effectiveItemId)
                      .map((l, idx) => (
                        <tr key={`${inv.id}_${idx}`}>
                          <td className="px-3 py-2 text-xs text-neutral-400">{formatDateTime(inv.date)}</td>
                          <td className="px-3 py-2">
                            {INVOICE_TYPE_LABELS[inv.type]} ({inv.invoiceNo})
                          </td>
                          <td className="px-3 py-2 font-bold">
                            {inv.type === 'SALE' || inv.type === 'PURCHASE_RETURN'
                              ? `-${l.qty}`
                              : `+${l.qty}`}
                          </td>
                          <td className="px-3 py-2">{formatCurrency(l.total)}</td>
                        </tr>
                      ))
                  )}
                  {filteredLogs
                    .filter((l) => l.itemId === effectiveItemId)
                    .map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 text-xs text-neutral-400">{formatDateTime(l.date)}</td>
                        <td className="px-3 py-2">{l.notes}</td>
                        <td className="px-3 py-2 font-bold">
                          {l.qtyDiff > 0 ? `+${l.qtyDiff}` : l.qtyDiff}
                        </td>
                        <td className="px-3 py-2">{formatCurrency(l.costImpact)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {(activeTab === 'warehouse-goods' || activeTab === 'stock-count-report') && (
            <div className="space-y-4">
              <div className="no-print flex items-center gap-2">
                <label className="text-xs font-semibold text-neutral-400">المخزن:</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100"
                >
                  {WAREHOUSES.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <table className="w-full text-right text-sm">
                <thead className="bg-neutral-950 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">الصنف</th>
                    <th className="px-3 py-2">المخزن</th>
                    <th className="px-3 py-2">الكمية الدفترية</th>
                    <th className="px-3 py-2">التكلفة</th>
                    <th className="px-3 py-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {items.map((it) => {
                    const qty =
                      stocks.find(
                        (s) =>
                          s.warehouseId === selectedWarehouseId &&
                          s.itemId === it.id
                      )?.quantity ?? 0;
                    return (
                      <tr key={it.id}>
                        <td className="px-3 py-2 font-semibold">{it.name}</td>
                        <td className="px-3 py-2 text-xs text-neutral-400">
                          {getWarehouseName(selectedWarehouseId)}
                        </td>
                        <td className="px-3 py-2 font-bold">{qty}</td>
                        <td className="px-3 py-2">{formatCurrency(it.avgCost)}</td>
                        <td className="px-3 py-2 font-bold text-sky-400">
                          {formatCurrency(qty * it.avgCost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'item-expiry' && (
            <table className="w-full text-right text-sm">
              <thead className="bg-neutral-950 text-xs text-neutral-400">
                <tr>
                  <th className="px-3 py-2">الصنف</th>
                  <th className="px-3 py-2">التصنيف</th>
                  <th className="px-3 py-2">تاريخ الصلاحية</th>
                  <th className="px-3 py-2">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {items
                  .filter((i) => Boolean(i.expiryDate))
                  .map((it) => {
                    const daysLeft = it.expiryDate
                      ? Math.ceil(
                          (new Date(it.expiryDate).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : 999;
                    return (
                      <tr key={it.id}>
                        <td className="px-3 py-2 font-semibold">{it.name}</td>
                        <td className="px-3 py-2 text-neutral-400">{it.category}</td>
                        <td className="px-3 py-2 font-mono">{it.expiryDate}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              daysLeft <= 0
                                ? 'bg-rose-950 text-rose-300'
                                : daysLeft <= 30
                                ? 'bg-amber-950 text-amber-300'
                                : 'bg-emerald-950 text-emerald-300'
                            }`}
                          >
                            {daysLeft <= 0
                              ? 'منتهي الصلاحية'
                              : `متبقي ${daysLeft} يوم`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
