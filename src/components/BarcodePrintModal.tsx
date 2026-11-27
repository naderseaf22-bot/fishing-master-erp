import React, { useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { Item } from '../db';
import { encodeCode128B } from '../utils/barcode';
import { formatCurrency } from '../utils/format';

type LabelPreset = '50x25' | '38x25' | 'a4-grid';

function BarcodeSvg({
  value,
  height = 38,
}: {
  value: string;
  height?: number;
}) {
  const { totalWidth, bars } = useMemo(() => encodeCode128B(value), [value]);
  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${height}`}
      className="mx-auto w-full max-w-[180px]"
      style={{ height: `${height}px` }}
      preserveAspectRatio="none"
    >
      <rect x={0} y={0} width={totalWidth} height={height} fill="#ffffff" />
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={0}
          width={b.width}
          height={height}
          fill="#000000"
        />
      ))}
    </svg>
  );
}

export function BarcodePrintModal({
  items,
  initialSelectedIds,
  onClose,
}: {
  items: Item[];
  initialSelectedIds?: string[];
  onClose: () => void;
}) {
  const [copies, setCopies] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    const selected = initialSelectedIds?.length
      ? new Set(initialSelectedIds)
      : new Set(items.slice(0, 1).map((i) => i.id));
    for (const it of items) {
      map[it.id] = selected.has(it.id) ? 2 : 0;
    }
    return map;
  });

  const [preset, setPreset] = useState<LabelPreset>('50x25');
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName] = useState(true);

  const labels = useMemo(() => {
    const out: Array<{ item: Item; key: string }> = [];
    for (const it of items) {
      const count = Math.max(0, Math.min(200, copies[it.id] ?? 0));
      for (let i = 0; i < count; i += 1) {
        out.push({ item: it, key: `${it.id}_${i}` });
      }
    }
    return out;
  }, [items, copies]);

  const presetDimensions: Record<LabelPreset, string> = {
    '50x25': 'w-[50mm] min-h-[26mm] p-1.5',
    '38x25': 'w-[38mm] min-h-[25mm] p-1',
    'a4-grid': 'w-[62mm] min-h-[30mm] p-2',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6">
      <div className="print-area max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-100 shadow-2xl">
        {/* Header & Settings */}
        <div className="no-print space-y-4 border-b border-neutral-800 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-white">
                طباعة ملصقات الباركود للأصناف
              </h3>
              <p className="text-xs text-neutral-400">
                باركود Code-128 متوافق مع طابعات الباركود الحرارية والطابعات العادية A4
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={labels.length === 0}
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                طباعة ({labels.length} ملصق)
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-700 p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-400">مقاس الملصق:</span>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as LabelPreset)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100"
              >
                <option value="50x25">حراري قياسي (50 × 25 مم)</option>
                <option value="38x25">حراري صغير (38 × 25 مم)</option>
                <option value="a4-grid">ورق A4 مقسم (3 أعمدة)</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showName}
                onChange={(e) => setShowName(e.target.checked)}
              />
              <span>إظهار اسم الصنف</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showPrice}
                onChange={(e) => setShowPrice(e.target.checked)}
              />
              <span>إظهار السعر</span>
            </label>
          </div>

          {/* Copy counts per item */}
          <div className="max-h-40 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-2.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs"
                >
                  <div className="truncate">
                    <div className="truncate font-semibold text-neutral-200">
                      {it.name}
                    </div>
                    <div className="font-mono text-[10px] text-neutral-400">
                      {it.barcode} • #{it.code}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={copies[it.id] ?? 0}
                    onChange={(e) =>
                      setCopies((prev) => ({
                        ...prev,
                        [it.id]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-center text-xs font-bold text-white"
                    title="عدد الملصقات"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Printable Label Grid */}
        <div className="mt-4 flex flex-wrap justify-start gap-2.5">
          {labels.map(({ item, key }) => (
            <div
              key={key}
              className={`barcode-label flex flex-col items-center justify-between rounded border border-neutral-300 bg-white text-center text-black ${presetDimensions[preset]}`}
            >
              <div className="w-full text-[9px] font-bold tracking-tight text-neutral-700">
                Fishing Master
              </div>
              {showName && (
                <div className="w-full truncate text-[10px] font-extrabold leading-tight">
                  {item.name}
                </div>
              )}
              <div className="my-0.5 w-full px-1">
                <BarcodeSvg
                  value={item.barcode || item.code}
                  height={preset === '38x25' ? 28 : 34}
                />
              </div>
              <div className="flex w-full items-center justify-between px-1 text-[10px] font-bold">
                <span className="font-mono">{item.barcode}</span>
                {showPrice && <span>{formatCurrency(item.salePrice)}</span>}
              </div>
            </div>
          ))}
          {labels.length === 0 && (
            <div className="w-full py-10 text-center text-sm text-neutral-400 no-print">
              حدد عدد الملصقات لصنف واحد على الأقل للمعاينة والطباعة.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
