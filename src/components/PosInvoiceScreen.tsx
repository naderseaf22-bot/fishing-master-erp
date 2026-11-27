import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Barcode,
  CheckCircle2,
  Plus,
  Printer,
  RotateCcw,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import {
  Invoice,
  Item,
  TREASURIES,
  WAREHOUSES,
  db,
} from '../db';
import { createInvoice, getWarehouseName } from '../erpEngine';
import {
  INVOICE_TYPE_LABELS,
  formatCurrency,
  formatDateTime,
  todayInputDate,
} from '../utils/format';
import { InvoicePrintModal } from './InvoicePrintPreview';
import { SectionHeader } from './UiPrimitives';

interface CartLine {
  item: Item;
  qty: number;
  price: number;
  discount: number;
}

export function PosInvoiceScreen({
  mode,
  onNotify,
}: {
  mode: Invoice['type'];
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const stocks = useLiveQuery(() => db.stocks.toArray(), []) ?? [];
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const trips = useLiveQuery(() => db.trips.toArray(), []) ?? [];

  const isPurchaseSide = mode === 'PURCHASE' || mode === 'PURCHASE_RETURN';
  const [barcodeInput, setBarcodeInput] = useState('');
  const [manualItemId, setManualItemId] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('MAIN_WH');
  const [treasuryId, setTreasuryId] = useState<string>('MAIN_TR');
  const [accountId, setAccountId] = useState<string>('');
  const [tripId, setTripId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] =
    useState<Invoice['paymentMethod']>('CASH');
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [paidInput, setPaidInput] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(todayInputDate());
  const [notes, setNotes] = useState('');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [saving, setSaving] = useState(false);
  const [lastSavedInvoice, setLastSavedInvoice] = useState<Invoice | null>(
    null
  );
  const [showPrintModal, setShowPrintModal] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const priceRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const discRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    setCart([]);
    setSelectedIdx(-1);
    setAccountId('');
    setTripId('');
    setInvoiceDiscount(0);
    setPaidInput('');
    setNotes('');
    setBarcodeInput('');
    setLastSavedInvoice(null);
    setShowPrintModal(false);
    setPaymentMethod('CASH');
    barcodeRef.current?.focus();
  }, [mode]);

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stocks) {
      map.set(`${s.warehouseId}_${s.itemId}`, s.quantity);
    }
    return map;
  }, [stocks]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) =>
      isPurchaseSide
        ? a.type === 'SUPPLIER'
        : a.type === 'CUSTOMER' || a.type === 'TRIP_MEMBER'
    );
  }, [accounts, isPurchaseSide]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + Math.max(0, line.qty * line.price - line.discount),
        0
      ),
    [cart]
  );
  const netTotal = Math.max(0, subtotal - invoiceDiscount);

  const effectivePaid = useMemo(() => {
    if (paymentMethod === 'CREDIT' && paidInput === '') return 0;
    if (paidInput === '') return netTotal;
    const parsed = Number(paidInput);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [paidInput, paymentMethod, netTotal]);

  const remaining = Math.max(0, netTotal - effectivePaid);

  const addItemToCart = (item: Item) => {
    const defaultPrice = isPurchaseSide ? item.lastPurchasePrice : item.salePrice;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        setSelectedIdx(idx);
        return next;
      }
      const next = [...prev, { item, qty: 1, price: defaultPrice, discount: 0 }];
      setSelectedIdx(next.length - 1);
      return next;
    });
  };

  // Auto-add as soon as exact barcode matches while scanning/typing
  const handleBarcodeChange = (val: string) => {
    setBarcodeInput(val);
    const q = val.trim().toLowerCase();
    if (q.length >= 4) {
      const exactBarcode = items.find((it) => it.barcode.toLowerCase() === q);
      if (exactBarcode) {
        addItemToCart(exactBarcode);
        setBarcodeInput('');
      }
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      e.preventDefault();
      const q = barcodeInput.trim().toLowerCase();
      const match =
        items.find(
          (it) => it.barcode.toLowerCase() === q || it.code.toLowerCase() === q
        ) ?? items.find((it) => it.name.toLowerCase().includes(q));

      if (match) {
        addItemToCart(match);
        setBarcodeInput('');
      } else {
        onNotify(`لم يتم العثور على صنف مطابق للباركود/الكود "${barcodeInput.trim()}".`, 'error');
      }
    }
  };

  const handleManualAdd = () => {
    const id = manualItemId || items[0]?.id;
    const found = items.find((i) => i.id === id);
    if (found) {
      addItemToCart(found);
      barcodeRef.current?.focus();
    }
  };

  const resetInvoice = () => {
    setCart([]);
    setSelectedIdx(-1);
    setInvoiceDiscount(0);
    setPaidInput('');
    setNotes('');
    setBarcodeInput('');
    setLastSavedInvoice(null);
    setShowPrintModal(false);
    barcodeRef.current?.focus();
  };

  const handleSave = async () => {
    if (cart.length === 0) {
      onNotify('أضف صنفاً واحداً على الأقل قبل الحفظ.', 'error');
      return;
    }
    setSaving(true);
    try {
      const inv = await createInvoice({
        type: mode,
        date: `${invoiceDate}T${new Date().toTimeString().slice(0, 8)}`,
        accountId: accountId || undefined,
        warehouseId,
        treasuryId,
        tripId: tripId || undefined,
        paymentMethod,
        items: cart.map((c) => ({
          itemId: c.item.id,
          qty: c.qty,
          price: c.price,
          discount: c.discount,
        })),
        discount: invoiceDiscount,
        paidAmount: effectivePaid,
        notes: notes.trim() || undefined,
      });

      setLastSavedInvoice(inv);
      setCart([]);
      setSelectedIdx(-1);
      setInvoiceDiscount(0);
      setPaidInput('');
      setNotes('');
      onNotify(`تم حفظ ${INVOICE_TYPE_LABELS[mode]} رقم ${inv.invoiceNo} بنجاح.`);
      barcodeRef.current?.focus();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر حفظ الفاتورة.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!['F5', 'F6', 'F7', 'F8', 'F10', 'F12'].includes(e.key)) {
        return;
      }
      e.preventDefault();
      const targetIdx = selectedIdx >= 0 ? selectedIdx : cart.length - 1;

      if (e.key === 'F5' && targetIdx >= 0) {
        qtyRefs.current[targetIdx]?.focus();
        qtyRefs.current[targetIdx]?.select();
      } else if (e.key === 'F6' && targetIdx >= 0) {
        priceRefs.current[targetIdx]?.focus();
        priceRefs.current[targetIdx]?.select();
      } else if (e.key === 'F7' && targetIdx >= 0) {
        discRefs.current[targetIdx]?.focus();
        discRefs.current[targetIdx]?.select();
      } else if (e.key === 'F8' && targetIdx >= 0) {
        setCart((prev) => {
          const next = prev.filter((_, i) => i !== targetIdx);
          setSelectedIdx(next.length > 0 ? Math.min(targetIdx, next.length - 1) : -1);
          return next;
        });
      } else if (e.key === 'F10') {
        resetInvoice();
      } else if (e.key === 'F12') {
        void handleSave();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const updateLine = (idx: number, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, ...patch } : line))
    );
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={INVOICE_TYPE_LABELS[mode]}
        subtitle={
          mode === 'SALE'
            ? 'نقطة البيع السريعة بالباركود — اختصارات (F5 كمية | F6 سعر | F7 خصم | F8 حذف | F10 جديد | F12 حفظ)'
            : 'إدخال فوري بالباركود مع تحديث المخزن ومتوسط التكلفة والخزينة وحساب الطرف'
        }
        actions={
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              ['F5', 'كمية'],
              ['F6', 'سعر'],
              ['F7', 'خصم'],
              ['F8', 'حذف'],
              ['F10', 'جديد'],
              ['F12', 'حفظ'],
            ].map(([k, lbl]) => (
              <span
                key={k}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono font-semibold text-neutral-300"
              >
                {k}: {lbl}
              </span>
            ))}
          </div>
        }
      />

      {lastSavedInvoice && (
        <div className="no-print rounded-xl border border-emerald-700/60 bg-emerald-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="font-bold">
                تم تسجيل {INVOICE_TYPE_LABELS[lastSavedInvoice.type]} رقم{' '}
                {lastSavedInvoice.invoiceNo}
              </span>
              <span className="text-sm text-emerald-300">
                ({formatDateTime(lastSavedInvoice.date)}) — الصافي:{' '}
                {formatCurrency(lastSavedInvoice.netTotal)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPrintModal(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
              >
                <Printer className="h-4 w-4" />
                معاينة وطباعة الفاتورة
              </button>
              <button
                type="button"
                onClick={() => setLastSavedInvoice(null)}
                className="rounded-lg border border-emerald-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-emerald-200"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrintModal && lastSavedInvoice && (
        <InvoicePrintModal
          invoice={lastSavedInvoice}
          party={
            lastSavedInvoice.accountId
              ? accountMap.get(lastSavedInvoice.accountId) ?? null
              : null
          }
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Full-width Invoice & Barcode Workspace (no suggested items panel) */}
      <div className="no-print flex flex-col justify-between space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5 shadow-xs">
        {/* Barcode Scanner + Manual Select Row */}
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-sky-800/50 bg-neutral-950 p-3.5 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <label className="mb-1 block text-xs font-bold text-sky-400">
              مسح / إدخال الباركود أو الكود (إضافة تلقائية فورية أو Enter)
            </label>
            <div className="relative">
              <Barcode className="pointer-events-none absolute right-3 top-2.5 h-5 w-5 text-sky-400" />
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => handleBarcodeChange(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                placeholder="مرّر قارئ الباركود هنا أو اكتب الكود واضغط Enter..."
                className="w-full rounded-xl border border-neutral-700 bg-black py-2 pr-10 pl-3 text-sm font-mono text-white placeholder-neutral-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="lg:col-span-6">
            <label className="mb-1 block text-xs font-semibold text-neutral-400">
              أو اختيار صنف بالاسم وإضافته للفاتورة
            </label>
            <div className="flex gap-2">
              <select
                value={manualItemId || items[0]?.id || ''}
                onChange={(e) => setManualItemId(e.target.value)}
                className="flex-1 rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100"
              >
                {items.map((it) => {
                  const qtyInWh = stockMap.get(`${warehouseId}_${it.id}`) ?? 0;
                  const price = isPurchaseSide ? it.lastPurchasePrice : it.salePrice;
                  return (
                    <option key={it.id} value={it.id}>
                      [{it.code}] {it.name} — {formatCurrency(price)} (متاح: {qtyInWh})
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                onClick={handleManualAdd}
                className="inline-flex items-center gap-1 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
              >
                <Plus className="h-4 w-4" />
                إضافة
              </button>
            </div>
          </div>
        </div>

        {/* Metadata Row */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-400">
              المخزن
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
            >
              {WAREHOUSES.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-400">
              الخزينة
            </label>
            <select
              value={treasuryId}
              onChange={(e) => setTreasuryId(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
            >
              {TREASURIES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-400">
              {isPurchaseSide ? 'المورد' : 'العميل / العضو'}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
            >
              <option value="">
                {isPurchaseSide ? '— مورد نقدي —' : '— عميل نقدي (مباشر) —'}
              </option>
              {filteredAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatCurrency(acc.balance)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-400">
              التاريخ
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
            />
          </div>
          {!isPurchaseSide && trips.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">
                ربط برحلة (اختياري)
              </label>
              <select
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
              >
                <option value="">— بدون رحلة —</option>
                {trips.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">
                ملاحظات
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات الفاتورة..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
              />
            </div>
          )}
        </div>

        {/* Cart Table */}
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-right text-sm">
            <thead className="bg-neutral-950 text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2.5">الباركود</th>
                <th className="px-3 py-2.5">الصنف</th>
                <th className="px-2 py-2.5 w-24">الكمية</th>
                <th className="px-2 py-2.5 w-28">السعر</th>
                <th className="px-2 py-2.5 w-24">الخصم</th>
                <th className="px-3 py-2.5">الإجمالي</th>
                <th className="px-2 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {cart.map((line, idx) => {
                const lineTotal = Math.max(
                  0,
                  line.qty * line.price - line.discount
                );
                const isSelected = idx === selectedIdx;
                return (
                  <tr
                    key={line.item.id}
                    onClick={() => setSelectedIdx(idx)}
                    className={`cursor-pointer transition ${
                      isSelected ? 'bg-sky-950/60' : 'hover:bg-neutral-800/40'
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                      {line.item.barcode}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-neutral-100">
                        {line.item.name}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {getWarehouseName(warehouseId)}: متاح{' '}
                        {stockMap.get(`${warehouseId}_${line.item.id}`) ?? 0}{' '}
                        {line.item.unit}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        ref={(el) => {
                          qtyRefs.current[idx] = el;
                        }}
                        type="number"
                        min={1}
                        step="any"
                        value={line.qty}
                        onChange={(e) =>
                          updateLine(idx, {
                            qty: Math.max(0.1, Number(e.target.value) || 0),
                          })
                        }
                        className="w-20 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-center text-sm text-white"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        ref={(el) => {
                          priceRefs.current[idx] = el;
                        }}
                        type="number"
                        min={0}
                        step="any"
                        value={line.price}
                        onChange={(e) =>
                          updateLine(idx, {
                            price: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-24 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-center text-sm text-white"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        ref={(el) => {
                          discRefs.current[idx] = el;
                        }}
                        type="number"
                        min={0}
                        step="any"
                        value={line.discount}
                        onChange={(e) =>
                          updateLine(idx, {
                            discount: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-20 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-center text-sm text-white"
                      />
                    </td>
                    <td className="px-3 py-2 font-bold text-sky-300">
                      {formatCurrency(lineTotal)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCart((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="rounded p-1 text-rose-400 hover:bg-rose-950"
                        title="حذف (F8)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {cart.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-neutral-500"
                  >
                    <ShoppingCart className="mx-auto mb-2 h-9 w-9 opacity-40" />
                    امسح الباركود في الحقل بالأعلى أو اختر الصنف من القائمة المنسدلة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals & Payment */}
        <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-xs text-neutral-400">الإجمالي الفرعي</div>
              <div className="text-base font-bold text-neutral-200">
                {formatCurrency(subtotal)}
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-400">
                خصم الفاتورة
              </label>
              <input
                type="number"
                min={0}
                value={invoiceDiscount}
                onChange={(e) =>
                  setInvoiceDiscount(Math.max(0, Number(e.target.value) || 0))
                }
                className="mt-0.5 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm font-semibold text-white"
              />
            </div>
            <div>
              <div className="text-xs text-neutral-400">الصافي النهائي</div>
              <div className="text-lg font-extrabold text-sky-400">
                {formatCurrency(netTotal)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400">المتبقي (آجل)</div>
              <div
                className={`text-base font-bold ${
                  remaining > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatCurrency(remaining)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-neutral-800 pt-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">
                طريقة السداد
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['CASH', 'CARD', 'CREDIT'] as const).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(pm);
                      if (pm === 'CREDIT') setPaidInput('0');
                      else setPaidInput('');
                    }}
                    className={`rounded-lg py-1.5 text-xs font-bold ${
                      paymentMethod === pm
                        ? 'bg-sky-600 text-white'
                        : 'border border-neutral-700 bg-neutral-900 text-neutral-300'
                    }`}
                  >
                    {pm === 'CASH' ? 'نقدي' : pm === 'CARD' ? 'شبكة' : 'آجل'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">
                المبلغ المدفوع للخزينة
              </label>
              <input
                type="number"
                min={0}
                max={netTotal}
                value={paidInput === '' ? netTotal : paidInput}
                onChange={(e) => setPaidInput(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm font-bold text-white"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={resetInvoice}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
                title="فاتورة جديدة (F10)"
              >
                <RotateCcw className="h-4 w-4" />
                جديد
              </button>
              <button
                type="button"
                disabled={saving || cart.length === 0}
                onClick={handleSave}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ الفاتورة (F12)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
