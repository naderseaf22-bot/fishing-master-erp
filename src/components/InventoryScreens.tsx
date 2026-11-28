import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowLeftRight,
  Barcode,
  ClipboardCheck,
  Edit3,
  Image as ImageIcon,
  Lock,
  PackagePlus,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { Item, db } from '../db';
import { useWarehouses } from '../useCatalog';
import {
  generateNextItemCodes,
  getWarehouseName,
  saveItem,
  settleStockCount,
  transferStock,
} from '../erpEngine';
import { formatCurrency, formatDateTime } from '../utils/format';
import { BarcodePrintModal } from './BarcodePrintModal';
import { PrintButton, SectionHeader, StatCard } from './UiPrimitives';

export function ItemsListScreen({
  onEditItem,
  onNewItem,
}: {
  onEditItem: (item: Item) => void;
  onNewItem: () => void;
}) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const stocks = useLiveQuery(() => db.stocks.toArray(), []) ?? [];
  const [search, setSearch] = useState('');
  const [barcodeModalIds, setBarcodeModalIds] = useState<string[] | null>(null);

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stocks) {
      m.set(`${s.warehouseId}_${s.itemId}`, s.quantity);
    }
    return m;
  }, [stocks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.barcode.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="دليل الأصناف"
        subtitle="إدارة أصناف أدوات الصيد وطباعة ملصقات الباركود ومتوسط التكلفة"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBarcodeModalIds(filtered.map((i) => i.id))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700/60 bg-sky-950/60 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-900/60"
            >
              <Barcode className="h-4 w-4" />
              طباعة باركود الأصناف
            </button>
            <PrintButton />
            <button
              type="button"
              onClick={onNewItem}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              <PackagePlus className="h-4 w-4" />
              إضافة صنف جديد
            </button>
          </div>
        }
      />

      <div className="relative no-print">
        <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الكود أو الباركود أو التصنيف..."
          className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pr-9 pl-3 text-sm text-neutral-100 placeholder-neutral-500"
        />
      </div>

      <div className="print-area overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 shadow-xs">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-950 text-xs text-neutral-400">
            <tr>
              <th className="px-3 py-3">الكود</th>
              <th className="px-3 py-3">الباركود</th>
              <th className="px-3 py-3">اسم الصنف</th>
              <th className="px-3 py-3">التصنيف / الماركة</th>
              <th className="px-3 py-3">متوسط التكلفة</th>
              <th className="px-3 py-3">سعر البيع</th>
              <th className="px-3 py-3">الرئيسي</th>
              <th className="px-3 py-3">الفرع/الرحلات</th>
              <th className="px-3 py-3 no-print">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filtered.map((it) => {
              const qMain = stockMap.get(`MAIN_WH_${it.id}`) ?? 0;
              const qSub = stockMap.get(`SUB_WH_${it.id}`) ?? 0;
              return (
                <tr key={it.id} className="hover:bg-neutral-800/40">
                  <td className="px-3 py-2.5 font-mono text-xs text-neutral-300">{it.code}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-neutral-400">
                    {it.barcode}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {it.imageUrl ? (
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          className="h-10 w-10 rounded-lg border border-neutral-700 object-cover shrink-0"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-950 text-neutral-500">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-neutral-100">{it.name}</div>
                        <div className="text-xs text-neutral-400">{it.specs}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-neutral-300">
                    {it.category} • {it.brand}
                  </td>
                  <td className="px-3 py-2.5 font-semibold">
                    {formatCurrency(it.avgCost)}
                  </td>
                  <td className="px-3 py-2.5 font-bold text-sky-400">
                    {formatCurrency(it.salePrice)}
                  </td>
                  <td className="px-3 py-2.5 font-semibold">{qMain}</td>
                  <td className="px-3 py-2.5 font-semibold">{qSub}</td>
                  <td className="px-3 py-2.5 no-print">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditItem(it)}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => setBarcodeModalIds([it.id])}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-800 bg-sky-950/60 px-2.5 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-900/60"
                        title="طباعة باركود هذا الصنف"
                      >
                        <Barcode className="h-3.5 w-3.5" />
                        باركود
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {barcodeModalIds && (
        <BarcodePrintModal
          items={items}
          initialSelectedIds={barcodeModalIds}
          onClose={() => setBarcodeModalIds(null)}
        />
      )}
    </div>
  );
}

export function ItemEntryScreen({
  editingItem,
  onDone,
  onNotify,
}: {
  editingItem: Item | null;
  onDone: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [form, setForm] = useState({
    code: editingItem?.code ?? '',
    barcode: editingItem?.barcode ?? '',
    name: editingItem?.name ?? '',
    category: editingItem?.category ?? 'خيوط',
    brand: editingItem?.brand ?? '',
    specs: editingItem?.specs ?? '',
    unit: editingItem?.unit ?? 'قطعة',
    avgCost: editingItem?.avgCost ?? 0,
    lastPurchasePrice: editingItem?.lastPurchasePrice ?? 0,
    salePrice: editingItem?.salePrice ?? 0,
    wholesalePrice: editingItem?.wholesalePrice ?? 0,
    minStock: editingItem?.minStock ?? 5,
    expiryDate: editingItem?.expiryDate ?? '',
    imageUrl: editingItem?.imageUrl ?? '',
    description: editingItem?.description ?? '',
    initialMain: 0,
    initialSub: 0,
  });

  // Auto-generate sequential non-editable code & barcode for new items
  useEffect(() => {
    if (editingItem) return;
    let active = true;
    void generateNextItemCodes().then(({ code, barcode }) => {
      if (active) {
        setForm((prev) => ({ ...prev, code, barcode }));
      }
    });
    return () => {
      active = false;
    };
  }, [editingItem]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      onNotify('حجم الصورة يتجاوز 2 ميجابايت، يفضل اختيار صورة أصغر.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      onNotify('يرجى إدخال اسم الصنف.', 'error');
      return;
    }
    try {
      const codes =
        editingItem || (form.code && form.barcode)
          ? { code: form.code, barcode: form.barcode }
          : await generateNextItemCodes();

      await saveItem(
        {
          id: editingItem?.id,
          code: codes.code,
          barcode: codes.barcode,
          name: form.name.trim(),
          category: form.category.trim(),
          brand: form.brand.trim(),
          specs: form.specs.trim(),
          unit: form.unit.trim() || 'قطعة',
          avgCost: Number(form.avgCost) || 0,
          lastPurchasePrice: Number(form.lastPurchasePrice) || 0,
          salePrice: Number(form.salePrice) || 0,
          wholesalePrice: Number(form.wholesalePrice) || undefined,
          minStock: Number(form.minStock) || 0,
          expiryDate: form.expiryDate || undefined,
          imageUrl: form.imageUrl.trim() || undefined,
          description: form.description.trim() || undefined,
        },
        Number(form.initialMain) || 0,
        Number(form.initialSub) || 0
      );
      onNotify(
        editingItem ? 'تم تحديث بيانات الصنف بنجاح.' : 'تم إضافة الصنف للمخازن بنجاح.'
      );
      onDone();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={editingItem ? `تعديل صنف: ${editingItem.name}` : 'إدخال صنف جديد'}
        subtitle="الكود والباركود يُولّدان تلقائياً وهما غير قابلين للتعديل لمنع التكرار أو التلاعب"
      />
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xs sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-neutral-400">
            <Lock className="h-3.5 w-3.5 text-amber-400" />
            <span>الكود (تلقائي / محمي)</span>
          </label>
          <input
            readOnly
            value={form.code}
            className="w-full cursor-not-allowed rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm font-bold text-amber-300"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-neutral-400">
            <Lock className="h-3.5 w-3.5 text-amber-400" />
            <span>الباركود (تلقائي / محمي)</span>
          </label>
          <input
            readOnly
            value={form.barcode}
            className="w-full cursor-not-allowed rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm font-bold text-sky-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">اسم الصنف *</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">التصنيف</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {['خيوط', 'سنار', 'قصبات', 'ماكينات', 'طعوم', 'إكسسوارات بحرية'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">الماركة</label>
          <input
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            placeholder="Shimano / Daiwa / Sufix..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">المواصفات</label>
          <input
            value={form.specs}
            onChange={(e) => setForm({ ...form, specs: e.target.value })}
            placeholder="0.30mm / 3.6m..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">الوحدة</label>
          <input
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">التكلفة المتوسطة</label>
          <input
            type="number"
            min={0}
            step="any"
            value={form.avgCost}
            onChange={(e) => setForm({ ...form, avgCost: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">آخر سعر شراء</label>
          <input
            type="number"
            min={0}
            step="any"
            value={form.lastPurchasePrice}
            onChange={(e) => setForm({ ...form, lastPurchasePrice: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">سعر البيع</label>
          <input
            type="number"
            min={0}
            step="any"
            value={form.salePrice}
            onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">حد الطلب (Min Stock)</label>
          <input
            type="number"
            min={0}
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">تاريخ الصلاحية (للأطعمة)</label>
          <input
            type="date"
            value={form.expiryDate}
            onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>

        {!editingItem && (
          <>
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">رصيد افتتاحي (المخزن الرئيسي)</label>
              <input
                type="number"
                min={0}
                value={form.initialMain}
                onChange={(e) => setForm({ ...form, initialMain: Number(e.target.value) })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">رصيد افتتاحي (مخزن الرحلات/الفرع)</label>
              <input
                type="number"
                min={0}
                value={form.initialSub}
                onChange={(e) => setForm({ ...form, initialSub: Number(e.target.value) })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2 lg:col-span-3 space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <label className="block text-xs font-semibold text-neutral-300">
            صورة الصنف (رابط مباشر أو رفع ملف من الجهاز — تُستخدم في المعاينة والنشر على فيسبوك)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="https://example.com/item.jpg أو اختر ملف صورة..."
              className="flex-1 min-w-[220px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            />
            <label className="cursor-pointer rounded-lg border border-sky-700 bg-sky-950 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-sky-900">
              رفع صورة
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
            {form.imageUrl && (
              <button
                type="button"
                onClick={() => setForm({ ...form, imageUrl: '' })}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-800 bg-rose-950 px-2.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900"
              >
                <Trash2 className="h-3.5 w-3.5" />
                إزالة
              </button>
            )}
          </div>
          {form.imageUrl && (
            <div className="pt-2">
              <img
                src={form.imageUrl}
                alt="معاينة الصنف"
                className="h-28 w-28 rounded-xl border border-neutral-700 bg-black object-cover shadow-xs"
              />
            </div>
          )}
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-neutral-400">
            التفاصيل والوصف التسويقي (للعملاء وذكاء الـ AI وفيسبوك)
          </label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="اكتب تفاصيل الخامة، الاستخدام، المزايا، أو أي ملاحظات تهم الصياد..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>

        <div className="col-span-full flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-6 py-2 text-sm font-bold text-white hover:bg-emerald-500"
          >
            حفظ الصنف
          </button>
        </div>
      </form>
    </div>
  );
}

export function GoodsOverviewScreen({
  onGoToPurchase,
}: {
  onGoToPurchase?: () => void;
}) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const stocks = useLiveQuery(() => db.stocks.toArray(), []) ?? [];
  const warehouses = useWarehouses(true);
  const [whFilter, setWhFilter] = useState('ALL');
  const [stockTab, setStockTab] = useState<'ALL' | 'OUT_OF_STOCK' | 'LOW_STOCK'>('ALL');

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stocks) m.set(`${s.warehouseId}_${s.itemId}`, s.quantity);
    return m;
  }, [stocks]);

  const enriched = useMemo(() => {
    return items.map((it) => {
      const qMain = stockMap.get(`MAIN_WH_${it.id}`) ?? 0;
      const qSub = stockMap.get(`SUB_WH_${it.id}`) ?? 0;
      const qty =
        whFilter === 'ALL'
          ? warehouses.reduce((sum, w) => sum + (stockMap.get(`${w.id}_${it.id}`) ?? 0), 0)
          : stockMap.get(`${whFilter}_${it.id}`) ?? 0;
      return { item: it, qMain, qSub, qty };
    });
  }, [items, stockMap, whFilter, warehouses]);

  const totals = useMemo(() => {
    let costValue = 0;
    let saleValue = 0;
    let lowCount = 0;
    let outCount = 0;
    for (const row of enriched) {
      costValue += row.qty * row.item.avgCost;
      saleValue += row.qty * row.item.salePrice;
      if (row.qty <= 0) outCount += 1;
      else if (row.qty <= row.item.minStock) lowCount += 1;
    }
    return { costValue, saleValue, lowCount, outCount };
  }, [enriched]);

  const visibleRows = useMemo(() => {
    if (stockTab === 'OUT_OF_STOCK') return enriched.filter((r) => r.qty <= 0);
    if (stockTab === 'LOW_STOCK') {
      return enriched.filter((r) => r.qty > 0 && r.qty <= r.item.minStock);
    }
    return enriched;
  }, [enriched, stockTab]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="البضاعة والمخزون"
        subtitle="أرصدة المخازن لحظياً مع قسم مخصص للأصناف التي نفذت لتسهيل إعادة طلبها"
        actions={
          <div className="flex gap-2">
            <select
              value={whFilter}
              onChange={(e) => setWhFilter(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 no-print"
            >
              <option value="ALL">كل المخازن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <PrintButton />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="قيمة المخزون بالتكلفة" value={formatCurrency(totals.costValue)} tone="sky" />
        <StatCard label="القيمة البيعية المتوقعة" value={formatCurrency(totals.saleValue)} tone="emerald" />
        <StatCard
          label="أصناف تحت حد الطلب"
          value={`${totals.lowCount} صنف`}
          tone={totals.lowCount > 0 ? 'amber' : 'slate'}
        />
        <StatCard
          label="أصناف نفذت (رصيد 0)"
          value={`${totals.outCount} صنف`}
          tone={totals.outCount > 0 ? 'rose' : 'slate'}
        />
      </div>

      {/* Filter Tabs including Out of Stock */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStockTab('ALL')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              stockTab === 'ALL'
                ? 'bg-sky-600 text-white'
                : 'border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            كل البضاعة ({enriched.length})
          </button>
          <button
            type="button"
            onClick={() => setStockTab('OUT_OF_STOCK')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              stockTab === 'OUT_OF_STOCK'
                ? 'bg-rose-600 text-white'
                : 'border border-rose-800/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            أصناف نفذت ({totals.outCount})
          </button>
          <button
            type="button"
            onClick={() => setStockTab('LOW_STOCK')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              stockTab === 'LOW_STOCK'
                ? 'bg-amber-600 text-white'
                : 'border border-amber-800/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50'
            }`}
          >
            قربت على النفاد ({totals.lowCount})
          </button>
        </div>

        {onGoToPurchase && (
          <button
            type="button"
            onClick={onGoToPurchase}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
          >
            <ShoppingBag className="h-4 w-4" />
            فتح فاتورة شراء لتوريد النواقص
          </button>
        )}
      </div>

      <div className="print-area overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 shadow-xs">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-950 text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-3">الكود</th>
              <th className="px-4 py-3">الصنف</th>
              <th className="px-4 py-3">المخزن الرئيسي</th>
              <th className="px-4 py-3">مخزن الفرع/الرحلات</th>
              <th className="px-4 py-3">المتاح ({whFilter === 'ALL' ? 'الكل' : getWarehouseName(whFilter)})</th>
              <th className="px-4 py-3">التكلفة</th>
              <th className="px-4 py-3">قيمة البضاعة</th>
              <th className="px-4 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {visibleRows.map(({ item: it, qMain, qSub, qty }) => {
              const isOut = qty <= 0;
              const isLow = !isOut && qty <= it.minStock;
              return (
                <tr key={it.id} className="hover:bg-neutral-800/40">
                  <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{it.code}</td>
                  <td className="px-4 py-2.5 font-semibold text-neutral-100">{it.name}</td>
                  <td className="px-4 py-2.5">{qMain}</td>
                  <td className="px-4 py-2.5">{qSub}</td>
                  <td className="px-4 py-2.5 font-bold">{qty} {it.unit}</td>
                  <td className="px-4 py-2.5">{formatCurrency(it.avgCost)}</td>
                  <td className="px-4 py-2.5 font-bold text-sky-400">
                    {formatCurrency(qty * it.avgCost)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isOut
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                          : isLow
                          ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                      }`}
                    >
                      {isOut ? 'نفذ من المخزن' : isLow ? 'تحت حد الطلب' : 'متوفر'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-neutral-500">
                  لا توجد أصناف ضمن هذا التصنيف حالياً.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StockTransferScreen({
  onNotify,
}: {
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const stocks = useLiveQuery(() => db.stocks.toArray(), []) ?? [];
  const logs =
    useLiveQuery(
      () => db.stockLogs.filter((l) => l.type === 'TRANSFER').reverse().toArray(),
      []
    ) ?? [];
  const warehouses = useWarehouses(true);

  const [fromWh, setFromWh] = useState('MAIN_WH');
  const [toWh, setToWh] = useState('SUB_WH');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  const effectiveItemId = itemId || items[0]?.id || '';
  const available =
    stocks.find((s) => s.warehouseId === fromWh && s.itemId === effectiveItemId)
      ?.quantity ?? 0;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveItemId) return;
    try {
      await transferStock({
        fromWarehouseId: fromWh,
        toWarehouseId: toWh,
        itemId: effectiveItemId,
        qty,
        notes,
      });
      setNotes('');
      onNotify('تم تنفيذ التحويل المخزني بنجاح.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر التحويل.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="تحويل لمخزن"
        subtitle="نقل بضاعة بين المخزن الرئيسي ومخزن الفرع / الرحلات مع تسجيل الأثر في السجل وطابور المزامنة"
      />

      <form
        onSubmit={handleTransfer}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs sm:grid-cols-2 lg:grid-cols-5"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">من مخزن</label>
          <select
            value={fromWh}
            onChange={(e) => setFromWh(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">إلى مخزن</label>
          <select
            value={toWh}
            onChange={(e) => setToWh(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-neutral-400">
            الصنف (المتاح في المصدر: {available})
          </label>
          <select
            value={effectiveItemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">الكمية</label>
          <input
            type="number"
            min={1}
            step="any"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات التحويل..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
        >
          <ArrowLeftRight className="h-4 w-4" />
          تنفيذ التحويل
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 shadow-xs">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-950 text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">الصنف</th>
              <th className="px-4 py-3">الكمية</th>
              <th className="px-4 py-3">من / إلى</th>
              <th className="px-4 py-3">التفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-xs text-neutral-400">{formatDateTime(l.date)}</td>
                <td className="px-4 py-2.5 font-semibold">{l.itemName}</td>
                <td className="px-4 py-2.5 font-bold">{l.qtyDiff}</td>
                <td className="px-4 py-2.5 text-xs text-neutral-300">
                  {getWarehouseName(l.fromWarehouseId)} ← {getWarehouseName(l.toWarehouseId)}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-400">{l.notes}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-neutral-500">
                  لا توجد تحويلات مخزنية مسجلة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StockCountAndSettlementScreen({
  mode,
  onNotify,
}: {
  mode: 'COUNT' | 'SETTLEMENT';
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const stocks = useLiveQuery(() => db.stocks.toArray(), []) ?? [];
  const logs =
    useLiveQuery(
      () => db.stockLogs.filter((l) => l.type === 'COUNT_SETTLEMENT').reverse().toArray(),
      []
    ) ?? [];
  const warehouses = useWarehouses(true);

  const [warehouseId, setWarehouseId] = useState('MAIN_WH');
  const [actualInputs, setActualInputs] = useState<Record<string, string>>({});

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stocks) m.set(`${s.warehouseId}_${s.itemId}`, s.quantity);
    return m;
  }, [stocks]);

  const handleSettleOne = async (item: Item) => {
    const raw = actualInputs[item.id];
    const current = stockMap.get(`${warehouseId}_${item.id}`) ?? 0;
    const actualQty = raw === undefined || raw === '' ? current : Number(raw);
    try {
      await settleStockCount({
        warehouseId,
        itemId: item.id,
        actualQty,
      });
      setActualInputs((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      onNotify(`تم اعتماد التسوية الجردية لصنف "${item.name}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذرت التسوية.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={mode === 'COUNT' ? 'جرد مخزني' : 'تسوية جردية'}
        subtitle="مقارنة الرصيد الدفتري بالجرد الفعلي واعتماد الفروقات في المخزن وتقرير الأثر المالي"
        actions={
          <div className="flex gap-2">
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white no-print"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <PrintButton />
          </div>
        }
      />

      <div className="print-area overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 shadow-xs">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-950 text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-3">الصنف</th>
              <th className="px-4 py-3">الرصيد الدفتري</th>
              <th className="px-4 py-3">الرصيد الفعلي</th>
              <th className="px-4 py-3">الفرق</th>
              <th className="px-4 py-3">الأثر المالي</th>
              <th className="px-4 py-3 no-print">اعتماد</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {items.map((it) => {
              const current = stockMap.get(`${warehouseId}_${it.id}`) ?? 0;
              const raw = actualInputs[it.id];
              const actual = raw === undefined || raw === '' ? current : Number(raw) || 0;
              const diff = actual - current;
              return (
                <tr key={it.id} className="hover:bg-neutral-800/40">
                  <td className="px-4 py-2.5 font-semibold">{it.name}</td>
                  <td className="px-4 py-2.5 font-mono">{current}</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={raw ?? String(current)}
                      onChange={(e) =>
                        setActualInputs((prev) => ({ ...prev, [it.id]: e.target.value }))
                      }
                      className="w-24 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-center text-sm text-white"
                    />
                  </td>
                  <td
                    className={`px-4 py-2.5 font-bold ${
                      diff > 0
                        ? 'text-emerald-400'
                        : diff < 0
                        ? 'text-rose-400'
                        : 'text-neutral-500'
                    }`}
                  >
                    {diff > 0 ? `+${diff}` : diff}
                  </td>
                  <td className="px-4 py-2.5">{formatCurrency(diff * it.avgCost)}</td>
                  <td className="px-4 py-2.5 no-print">
                    <button
                      type="button"
                      onClick={() => handleSettleOne(it)}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      تسوية
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-3 font-bold text-neutral-200">سجل التسويات الجردية</h3>
        <div className="space-y-2">
          {logs.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs"
            >
              <div>
                <strong>{l.itemName}</strong> — {l.notes}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold">
                  فرق: {l.qtyDiff > 0 ? `+${l.qtyDiff}` : l.qtyDiff}
                </span>
                <span className="font-semibold text-neutral-300">
                  أثر: {formatCurrency(l.costImpact)}
                </span>
                <span className="text-neutral-500">{formatDateTime(l.date)}</span>
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-sm text-neutral-500">لا توجد تسويات مسجلة بعد.</p>
          )}
        </div>
      </div>
    </div>
  );
}
