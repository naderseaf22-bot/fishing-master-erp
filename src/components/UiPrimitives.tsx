import React from 'react';
import { Printer } from 'lucide-react';

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
      <div>
        <h2 className="text-xl font-bold text-neutral-100">{title}</h2>
        {subtitle && <p className="text-sm text-neutral-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'slate' | 'emerald' | 'rose' | 'sky' | 'amber';
}) {
  const toneClasses: Record<string, string> = {
    slate: 'border-neutral-800 bg-neutral-900 text-neutral-100',
    emerald: 'border-emerald-800/60 bg-emerald-950/50 text-emerald-100',
    rose: 'border-rose-800/60 bg-rose-950/50 text-rose-100',
    sky: 'border-sky-800/60 bg-sky-950/50 text-sky-100',
    amber: 'border-amber-800/60 bg-amber-950/50 text-amber-100',
  };

  return (
    <div className={`rounded-xl border p-4 shadow-xs ${toneClasses[tone]}`}>
      <div className="text-xs font-medium text-neutral-400">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}

export function PrintButton({ label = 'طباعة' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 active:scale-[0.99]"
    >
      <Printer className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
