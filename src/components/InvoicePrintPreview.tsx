import React from 'react';
import { Anchor, Printer, X } from 'lucide-react';
import { Account, Invoice } from '../db';
import { getTreasuryName, getWarehouseName } from '../erpEngine';
import {
  INVOICE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  formatCurrency,
  formatDateTime,
} from '../utils/format';

export function InvoicePrintModal({
  invoice,
  party,
  onClose,
}: {
  invoice: Invoice;
  party?: Account | null;
  onClose: () => void;
}) {
  const paymentStatus =
    invoice.remainingAmount <= 0
      ? 'مسددة بالكامل'
      : invoice.paidAmount > 0
      ? 'مسددة جزئياً'
      : 'آجل بالكامل';

  const isPurchaseSide =
    invoice.type === 'PURCHASE' || invoice.type === 'PURCHASE_RETURN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6">
      <div className="print-area max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-neutral-100 shadow-2xl">
        {/* Top Modal Controls */}
        <div className="no-print mb-4 flex items-center justify-between border-b border-neutral-800 pb-3">
          <span className="text-sm font-bold text-neutral-300">
            معاينة الفاتورة للطباعة
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-500"
            >
              <Printer className="h-4 w-4" />
              طباعة الفاتورة
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-700 p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Store Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-neutral-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400">
              <Anchor className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-wide">
                Fishing Master ERP
              </h2>
              <p className="text-xs text-neutral-400">
                معرض ومستلزمات الصيد والرحلات البحرية
              </p>
              <p className="text-[11px] text-neutral-400">
                المستودع: {getWarehouseName(invoice.warehouseId)} • الخزينة:{' '}
                {getTreasuryName(invoice.treasuryId)}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-left">
            <div className="inline-block rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-sm font-extrabold text-sky-300">
              {INVOICE_TYPE_LABELS[invoice.type]}
            </div>
            <div className="mt-1 font-mono text-base font-bold">
              {invoice.invoiceNo}
            </div>
            <div className="text-xs text-neutral-400">
              {formatDateTime(invoice.date)}
            </div>
          </div>
        </div>

        {/* Party & Payment Info */}
        <div className="my-4 grid grid-cols-1 gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 p-3.5 text-xs sm:grid-cols-3">
          <div>
            <span className="text-neutral-400">
              {isPurchaseSide ? 'المورد: ' : 'العميل: '}
            </span>
            <strong className="text-sm">
              {party ? `${party.name} (${party.code})` : 'عميل / طرف نقدي'}
            </strong>
            {party?.phone && (
              <div className="mt-0.5 font-mono text-neutral-400">
                هاتف: {party.phone}
              </div>
            )}
          </div>
          <div>
            <span className="text-neutral-400">طريقة السداد: </span>
            <strong className="text-sm">
              {PAYMENT_METHOD_LABELS[invoice.paymentMethod]}
            </strong>
          </div>
          <div>
            <span className="text-neutral-400">حالة السداد: </span>
            <strong className="text-sm">{paymentStatus}</strong>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-right text-sm">
            <thead className="bg-neutral-900 text-xs text-neutral-300">
              <tr>
                <th className="px-3 py-2.5 w-10">#</th>
                <th className="px-3 py-2.5">الصنف</th>
                <th className="px-3 py-2.5 text-center">الكمية</th>
                <th className="px-3 py-2.5 text-center">السعر</th>
                <th className="px-3 py-2.5 text-center">الخصم</th>
                <th className="px-3 py-2.5 text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {invoice.items.map((it, idx) => (
                <tr key={`${it.itemId}_${idx}`}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2 font-semibold">{it.name}</td>
                  <td className="px-3 py-2 text-center font-mono">{it.qty}</td>
                  <td className="px-3 py-2 text-center font-mono">
                    {formatCurrency(it.price)}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-neutral-400">
                    {formatCurrency(it.discount)}
                  </td>
                  <td className="px-3 py-2 text-left font-bold">
                    {formatCurrency(it.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Summary */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="text-xs text-neutral-400 max-w-sm">
            {invoice.notes && (
              <p className="mb-2">
                <strong className="text-neutral-200">ملاحظات: </strong>
                {invoice.notes}
              </p>
            )}
            <p>شكراً لتعاملكم مع Fishing Master — نتمنى لكم صيداً موفقاً.</p>
          </div>

          <div className="w-full sm:w-72 space-y-1.5 rounded-xl border border-neutral-800 bg-neutral-900/70 p-3.5 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-400">الإجمالي الفرعي:</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">الخصم:</span>
              <span>{formatCurrency(invoice.discount)}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-800 pt-1.5 text-base font-extrabold">
              <span>الصافي النهائي:</span>
              <span className="text-sky-400">
                {formatCurrency(invoice.netTotal)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-neutral-400">المدفوع:</span>
              <span className="font-bold text-emerald-400">
                {formatCurrency(invoice.paidAmount)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-neutral-400">المتبقي:</span>
              <span className="font-bold text-rose-400">
                {formatCurrency(invoice.remainingAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
