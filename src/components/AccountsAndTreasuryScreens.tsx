import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, Edit3, PlusCircle, Search, Wallet } from 'lucide-react';
import { Account, TREASURIES, TreasuryVoucher, db } from '../db';
import {
  computeTreasuryBalances,
  createVoucher,
  getTreasuryName,
  saveAccount,
} from '../erpEngine';
import {
  ACCOUNT_TYPE_LABELS,
  VOUCHER_TYPE_LABELS,
  formatCurrency,
  formatDateTime,
  todayInputDate,
} from '../utils/format';
import { PrintButton, SectionHeader, StatCard } from './UiPrimitives';

const darkInput =
  'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none';

export function AccountsListScreen({
  mode,
  onNewAccount,
  onEditAccount,
  onQuickVoucher,
}: {
  mode: 'ALL' | 'SUPPLIER';
  onNewAccount: () => void;
  onEditAccount: (acc: Account) => void;
  onQuickVoucher: (type: 'RECEIPT' | 'PAYMENT', accountId: string) => void;
}) {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (mode === 'SUPPLIER' && a.type !== 'SUPPLIER') return false;
      if (mode === 'ALL' && typeFilter !== 'ALL' && a.type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q)
      );
    });
  }, [accounts, mode, typeFilter, search]);

  const totalReceivable = filtered
    .filter((a) => a.balance > 0)
    .reduce((s, a) => s + a.balance, 0);
  const totalPayable = filtered
    .filter((a) => a.balance < 0)
    .reduce((s, a) => s + Math.abs(a.balance), 0);

  return (
    <div className="space-y-4">
      <SectionHeader
        title={mode === 'SUPPLIER' ? 'حسابات الموردين' : 'دليل الحسابات'}
        subtitle={
          mode === 'SUPPLIER'
            ? 'متابعة أرصدة الموردين والمستحقات وسداد الدفعات'
            : 'إدارة حسابات العملاء والموردين وأعضاء الرحلات والمصروفات'
        }
        actions={
          <div className="flex gap-2">
            <PrintButton />
            <button
              type="button"
              onClick={onNewAccount}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600"
            >
              <PlusCircle className="h-4 w-4" />
              إضافة حساب
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="عدد الحسابات" value={`${filtered.length}`} tone="slate" />
        <StatCard
          label="إجمالي أرصدة لنا (مدين / عليهم)"
          value={formatCurrency(totalReceivable)}
          tone="emerald"
        />
        <StatCard
          label="إجمالي أرصدة علينا (دائن / لهم)"
          value={formatCurrency(totalPayable)}
          tone="rose"
        />
      </div>

      <div className="no-print flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الكود أو الهاتف..."
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pr-9 pl-3 text-sm text-neutral-100 placeholder:text-neutral-500"
          />
        </div>
        {mode === 'ALL' && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="ALL">كل الأنواع</option>
            <option value="CUSTOMER">العملاء</option>
            <option value="SUPPLIER">الموردين</option>
            <option value="TRIP_MEMBER">أعضاء الرحلات</option>
            <option value="EXPENSE">المصروفات</option>
            <option value="REVENUE">الإيرادات</option>
          </select>
        )}
      </div>

      <div className="print-area overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 shadow-xs">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-950 text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-3">الكود</th>
              <th className="px-4 py-3">الاسم</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">الرصيد</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 no-print">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filtered.map((acc) => (
              <tr key={acc.id} className="hover:bg-neutral-800/40">
                <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{acc.code}</td>
                <td className="px-4 py-2.5 font-semibold text-neutral-100">{acc.name}</td>
                <td className="px-4 py-2.5 text-xs">
                  <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 font-semibold text-neutral-300">
                    {ACCOUNT_TYPE_LABELS[acc.type]}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-neutral-300">
                  {acc.phone || '—'}
                </td>
                <td
                  className={`px-4 py-2.5 font-bold ${
                    acc.balance > 0
                      ? 'text-emerald-400'
                      : acc.balance < 0
                      ? 'text-rose-400'
                      : 'text-neutral-400'
                  }`}
                >
                  {formatCurrency(Math.abs(acc.balance))}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-400">
                  {acc.balance > 0
                    ? 'عليه (مدين)'
                    : acc.balance < 0
                    ? 'له (دائن)'
                    : 'متزن'}
                </td>
                <td className="px-4 py-2.5 no-print">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => onEditAccount(acc)}
                      className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                    >
                      <Edit3 className="h-3 w-3" />
                      تعديل
                    </button>
                    {acc.type === 'SUPPLIER' ? (
                      <button
                        type="button"
                        onClick={() => onQuickVoucher('PAYMENT', acc.id)}
                        className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                      >
                        سداد للمورد
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onQuickVoucher('RECEIPT', acc.id)}
                        className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        تحصيل دفعة
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AccountEntryScreen({
  editingAccount,
  onDone,
  onNotify,
}: {
  editingAccount: Account | null;
  onDone: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [form, setForm] = useState({
    code: editingAccount?.code ?? '',
    name: editingAccount?.name ?? '',
    type: (editingAccount?.type ?? 'CUSTOMER') as Account['type'],
    phone: editingAccount?.phone ?? '',
    balance: editingAccount?.balance ?? 0,
    creditLimit: editingAccount?.creditLimit ?? 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      onNotify('يرجى إدخال كود واسم الحساب.', 'error');
      return;
    }
    try {
      await saveAccount({
        id: editingAccount?.id,
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        phone: form.phone.trim(),
        balance: Number(form.balance) || 0,
        creditLimit: Number(form.creditLimit) || 0,
      });
      onNotify(
        editingAccount ? 'تم تحديث الحساب بنجاح.' : 'تم إضافة الحساب بنجاح.'
      );
      onDone();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ الحساب.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={editingAccount ? `تعديل حساب: ${editingAccount.name}` : 'إدخال حساب جديد'}
        subtitle="إضافة عميل أو مورد أو عضو رحلات صيد أو حساب مصروفات/إيرادات"
      />
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xs sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">كود الحساب *</label>
          <input
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="C-05 / S-03 / M-04..."
            className={darkInput}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">اسم الحساب *</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={darkInput}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">النوع</label>
          <select
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as Account['type'] })
            }
            className={darkInput}
          >
            <option value="CUSTOMER">عميل</option>
            <option value="SUPPLIER">مورد</option>
            <option value="TRIP_MEMBER">عضو رحلات</option>
            <option value="EXPENSE">مصروفات</option>
            <option value="REVENUE">إيرادات</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">رقم الهاتف</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={darkInput}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">
            الرصيد الافتتاحي (موجب=عليه / سالب=له)
          </label>
          <input
            type="number"
            step="any"
            value={form.balance}
            onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })}
            className={darkInput}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">الحد الائتماني</label>
          <input
            type="number"
            min={0}
            step="any"
            value={form.creditLimit}
            onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })}
            className={darkInput}
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
            حفظ الحساب
          </button>
        </div>
      </form>
    </div>
  );
}

export function TreasuryScreen({
  onNotify,
}: {
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const vouchers =
    useLiveQuery(() => db.vouchers.orderBy('date').reverse().toArray(), []) ?? [];
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const balances = useMemo(() => computeTreasuryBalances(vouchers), [vouchers]);

  const [fromTr, setFromTr] = useState('MAIN_TR');
  const [toTr, setToTr] = useState('BANK_TR');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createVoucher({
        type: 'TRANSFER',
        treasuryId: fromTr,
        targetTreasuryId: toTr,
        amount,
        notes:
          notes.trim() ||
          `تحويل من ${getTreasuryName(fromTr)} إلى ${getTreasuryName(toTr)}`,
      });
      setAmount(0);
      setNotes('');
      onNotify('تم تنفيذ التحويل بين الخزائن بنجاح.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر التحويل.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="إدارة الخزينة والتحويلات"
        subtitle="متابعة أرصدة الخزائن لحظياً والتحويل بين الخزينة الرئيسية والبنك وعهدة الرحلات"
        actions={<PrintButton />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الإجمالي الكلي للخزائن" value={formatCurrency(balances.total)} tone="sky" />
        {TREASURIES.map((t) => (
          <StatCard
            key={t.id}
            label={t.name}
            value={formatCurrency(balances[t.id] ?? 0)}
            tone="emerald"
          />
        ))}
      </div>

      <form
        onSubmit={handleTransfer}
        className="no-print grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs sm:grid-cols-2 lg:grid-cols-5"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">من خزينة</label>
          <select
            value={fromTr}
            onChange={(e) => setFromTr(e.target.value)}
            className={darkInput}
          >
            {TREASURIES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">إلى خزينة</label>
          <select
            value={toTr}
            onChange={(e) => setToTr(e.target.value)}
            className={darkInput}
          >
            {TREASURIES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">المبلغ</label>
          <input
            type="number"
            min={1}
            step="any"
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className={darkInput}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">البيان</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="سبب التحويل..."
            className={darkInput}
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-600"
          >
            <ArrowLeftRight className="h-4 w-4" />
            تحويل خزينة
          </button>
        </div>
      </form>

      <div className="print-area overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 shadow-xs">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-950 text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-3">رقم السند</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">الخزينة</th>
              <th className="px-4 py-3">الحساب / التصنيف</th>
              <th className="px-4 py-3">المبلغ</th>
              <th className="px-4 py-3">البيان</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {vouchers.map((v) => (
              <tr key={v.id} className="hover:bg-neutral-800/40">
                <td className="px-4 py-2.5 font-mono font-bold text-sky-400">
                  {v.voucherNo}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      v.type === 'RECEIPT'
                        ? 'bg-emerald-950 text-emerald-300'
                        : v.type === 'PAYMENT'
                        ? 'bg-rose-950 text-rose-300'
                        : 'bg-sky-950 text-sky-300'
                    }`}
                  >
                    {VOUCHER_TYPE_LABELS[v.type]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-400">
                  {formatDateTime(v.date)}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-300">
                  {getTreasuryName(v.treasuryId)}
                  {v.targetTreasuryId ? ` ← ${getTreasuryName(v.targetTreasuryId)}` : ''}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-300">
                  {v.accountId
                    ? accountMap.get(v.accountId) ?? '—'
                    : v.expenseCategory || '—'}
                </td>
                <td className="px-4 py-2.5 font-bold">{formatCurrency(v.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-neutral-400">{v.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VoucherFormScreen({
  mode,
  preselectedAccountId,
  onNotify,
}: {
  mode: 'RECEIPT' | 'PAYMENT';
  preselectedAccountId?: string;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const trips = useLiveQuery(() => db.trips.toArray(), []) ?? [];
  const vouchers =
    useLiveQuery(
      () => db.vouchers.filter((v) => v.type === mode).reverse().toArray(),
      [mode]
    ) ?? [];

  const [treasuryId, setTreasuryId] = useState('MAIN_TR');
  const [accountId, setAccountId] = useState(preselectedAccountId ?? '');
  const [tripId, setTripId] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('مصروفات تشغيل');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(todayInputDate());
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const v = await createVoucher({
        type: mode,
        date: `${date}T${new Date().toTimeString().slice(0, 8)}`,
        treasuryId,
        accountId: accountId || undefined,
        tripId: tripId || undefined,
        expenseCategory: mode === 'PAYMENT' ? expenseCategory : undefined,
        amount,
        notes:
          notes.trim() ||
          (mode === 'RECEIPT' ? 'سند قبض نقدية' : 'سند صرف نقدية'),
      });
      setAmount(0);
      setNotes('');
      onNotify(`تم حفظ ${VOUCHER_TYPE_LABELS[mode]} رقم ${v.voucherNo} بنجاح.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ السند.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={mode === 'RECEIPT' ? 'سند قبض' : 'سند صرف'}
        subtitle={
          mode === 'RECEIPT'
            ? 'تحصيل دفعات من العملاء أو أعضاء الرحلات وتوريدها للخزينة'
            : 'صرف مدفوعات للموردين أو تسجيل المصروفات العامة ومصروفات الرحلات'
        }
      />

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xs sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">الخزينة</label>
          <select
            value={treasuryId}
            onChange={(e) => setTreasuryId(e.target.value)}
            className={darkInput}
          >
            {TREASURIES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">الحساب (اختياري)</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={darkInput}
          >
            <option value="">— بدون حساب محدد —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatCurrency(a.balance)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">التاريخ</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={darkInput}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">المبلغ *</label>
          <input
            required
            type="number"
            min={1}
            step="any"
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className={`${darkInput} font-bold`}
          />
        </div>

        {mode === 'PAYMENT' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-400">بند المصروف</label>
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              className={darkInput}
            >
              {[
                'مصروفات تشغيل',
                'إيجار ومرافق',
                'رواتب وأجور',
                'إيجار مركب ووقود',
                'سداد مورد',
                'مصروفات رحلات الصيد',
              ].map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-400">ربط برحلة (اختياري)</label>
          <select
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className={darkInput}
          >
            <option value="">— بدون ربط برحلة —</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-neutral-400">البيان / الملاحظات</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="تفاصيل السند..."
            className={darkInput}
          />
        </div>

        <div className="col-span-full flex justify-end">
          <button
            type="submit"
            className={`inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white ${
              mode === 'RECEIPT'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            <Wallet className="h-4 w-4" />
            حفظ {VOUCHER_TYPE_LABELS[mode]}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-3 font-bold text-neutral-200">
          آخر سندات {mode === 'RECEIPT' ? 'القبض' : 'الصرف'}
        </h3>
        <div className="space-y-2">
          {vouchers.slice(0, 10).map((v: TreasuryVoucher) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            >
              <div>
                <span className="font-mono font-bold text-sky-400">{v.voucherNo}</span>{' '}
                <span className="text-xs text-neutral-400">— {v.notes}</span>
              </div>
              <div className="font-bold text-neutral-100">{formatCurrency(v.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
