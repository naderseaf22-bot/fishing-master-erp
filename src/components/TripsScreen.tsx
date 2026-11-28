import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Anchor,
  Compass,
  Edit3,
  PackageMinus,
  PackagePlus,
  Plus,
  Receipt,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { FishingTrip, db } from '../db';
import { useTreasuries, useWarehouses } from '../useCatalog';
import {
  addTripExpense,
  addTripMember,
  computeTripFinancials,
  createTrip,
  deleteTrip,
  getTripLinkedSummary,
  getWarehouseName,
  issueTripGear,
  recordTripMemberPayment,
  returnTripGear,
  updateTripDetails,
  updateTripStatus,
} from '../erpEngine';
import { formatCurrency, formatDate, todayInputDate } from '../utils/format';
import { PrintButton, SectionHeader, StatCard } from './UiPrimitives';

const STATUS_LABELS: Record<FishingTrip['status'], string> = {
  PLANNED: 'مخططة',
  ACTIVE: 'جارية حالياً',
  COMPLETED: 'مكتملة',
};

const inputCls =
  'rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none';

export function TripsScreen({
  onNotify,
}: {
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const trips =
    useLiveQuery(() => db.trips.orderBy('startDate').reverse().toArray(), []) ?? [];
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const stocks = useLiveQuery(() => db.stocks.toArray(), []) ?? [];
  const treasuries = useTreasuries(true);
  const warehouses = useWarehouses(true);

  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const activeTrip =
    trips.find((t) => t.id === selectedTripId) ?? trips[0] ?? null;

  // Create Trip Form
  const [newTrip, setNewTrip] = useState({
    title: '',
    destination: '',
    boatName: '',
    startDate: todayInputDate(),
    pricePerMember: 20000,
    plannedMembersCount: 10,
    expectedTotal: 200000,
    manualTotal: false,
  });
  const [showNewForm, setShowNewForm] = useState(false);

  // Edit Trip Modal State
  const [editingTrip, setEditingTrip] = useState<{
    id: string;
    title: string;
    destination: string;
    boatName: string;
    startDate: string;
    status: FishingTrip['status'];
    pricePerMember: number;
    plannedMembersCount: number;
    expectedTotal: number;
    manualTotal: boolean;
  } | null>(null);

  // Delete Trip Confirmation State
  const [deleteDialog, setDeleteDialog] = useState<{
    trip: FishingTrip;
    vouchersCount: number;
    invoicesCount: number;
    unreturnedGearUnits: number;
    membersWithDebt: number;
    rollbackMovements: boolean;
  } | null>(null);

  // Add Member Form
  const memberCandidates = useMemo(
    () =>
      accounts.filter(
        (a) => a.type === 'TRIP_MEMBER' || a.type === 'CUSTOMER'
      ),
    [accounts]
  );
  const [memberMode, setMemberMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [memberForm, setMemberForm] = useState({
    accountId: '',
    newName: '',
    newPhone: '',
    newType: 'TRIP_MEMBER' as 'TRIP_MEMBER' | 'CUSTOMER',
    fee: 1500,
    paid: 1500,
    treasuryId: 'MAIN_TR',
  });

  // Sync default member fee with activeTrip.pricePerMember when switching trips
  useEffect(() => {
    if (activeTrip && (activeTrip.pricePerMember ?? 0) > 0) {
      const fee = activeTrip.pricePerMember ?? 0;
      setMemberForm((prev) => ({ ...prev, fee, paid: fee }));
    }
  }, [activeTrip?.id, activeTrip?.pricePerMember]);

  // Gear Issue Form
  const [gearForm, setGearForm] = useState({
    itemId: '',
    warehouseId: 'SUB_WH',
    qty: 1,
  });
  const [returnInputs, setReturnInputs] = useState<Record<string, number>>({});

  // Expense Form
  const [expForm, setExpForm] = useState({
    title: '',
    amount: 0,
    treasuryId: 'MAIN_TR',
  });

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrip.title.trim()) return;
    try {
      const created = await createTrip({
        title: newTrip.title.trim(),
        destination: newTrip.destination.trim(),
        boatName: newTrip.boatName.trim(),
        startDate: newTrip.startDate,
        pricePerMember: Number(newTrip.pricePerMember) || 0,
        plannedMembersCount: Number(newTrip.plannedMembersCount) || 0,
        expectedTotal: Number(newTrip.expectedTotal) || 0,
      });
      setSelectedTripId(created.id);
      setNewTrip({
        title: '',
        destination: '',
        boatName: '',
        startDate: todayInputDate(),
        pricePerMember: 20000,
        plannedMembersCount: 10,
        expectedTotal: 200000,
        manualTotal: false,
      });
      setShowNewForm(false);
      onNotify(`تم إنشاء رحلة "${created.title}" بنجاح.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر إنشاء الرحلة.', 'error');
    }
  };

  const openEditTrip = (trip: FishingTrip) => {
    const price = trip.pricePerMember ?? 0;
    const count = trip.plannedMembersCount ?? trip.members.length;
    const expected = trip.expectedTotal ?? price * count;
    setEditingTrip({
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      boatName: trip.boatName,
      startDate: trip.startDate.slice(0, 10),
      status: trip.status,
      pricePerMember: price,
      plannedMembersCount: count,
      expectedTotal: expected,
      manualTotal: false,
    });
  };

  const handleSaveEditTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrip) return;
    try {
      await updateTripDetails(editingTrip.id, {
        title: editingTrip.title,
        destination: editingTrip.destination,
        boatName: editingTrip.boatName,
        startDate: editingTrip.startDate,
        status: editingTrip.status,
        pricePerMember: Number(editingTrip.pricePerMember) || 0,
        plannedMembersCount: Number(editingTrip.plannedMembersCount) || 0,
        expectedTotal: Number(editingTrip.expectedTotal) || 0,
      });
      setEditingTrip(null);
      onNotify('تم تحديث بيانات الرحلة بنجاح.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تحديث الرحلة.', 'error');
    }
  };

  const openDeleteTrip = async (trip: FishingTrip) => {
    const summary = await getTripLinkedSummary(trip.id);
    setDeleteDialog({
      trip,
      ...summary,
      rollbackMovements: true,
    });
  };

  const handleConfirmDeleteTrip = async () => {
    if (!deleteDialog) return;
    try {
      await deleteTrip(deleteDialog.trip.id, {
        rollbackMovements: deleteDialog.rollbackMovements,
      });
      if (selectedTripId === deleteDialog.trip.id) {
        setSelectedTripId('');
      }
      onNotify(
        deleteDialog.rollbackMovements
          ? `تم حذف رحلة "${deleteDialog.trip.title}" وعكس الحركات المرتبطة بها.`
          : `تم حذف رحلة "${deleteDialog.trip.title}" مع الإبقاء على السجلات المالية.`
      );
      setDeleteDialog(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حذف الرحلة.', 'error');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;

    if (memberMode === 'EXISTING') {
      const accId = memberForm.accountId || memberCandidates[0]?.id;
      if (!accId) {
        onNotify('يرجى اختيار حساب عضو أو التبديل لإضافة عضو جديد غير مسجل.', 'error');
        return;
      }
      try {
        await addTripMember({
          tripId: activeTrip.id,
          accountId: accId,
          fee: Number(memberForm.fee) || 0,
          paid: Number(memberForm.paid) || 0,
          treasuryId: memberForm.treasuryId,
        });
        onNotify('تمت إضافة العضو وترحيل المدفوع للخزينة والمتبقي لحسابه.');
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'تعذرت إضافة العضو.', 'error');
      }
    } else {
      if (!memberForm.newName.trim()) {
        onNotify('يرجى إدخال اسم العضو غير المسجل.', 'error');
        return;
      }
      try {
        await addTripMember({
          tripId: activeTrip.id,
          newMember: {
            name: memberForm.newName.trim(),
            phone: memberForm.newPhone.trim(),
            type: memberForm.newType,
          },
          fee: Number(memberForm.fee) || 0,
          paid: Number(memberForm.paid) || 0,
          treasuryId: memberForm.treasuryId,
        });
        setMemberForm((prev) => ({ ...prev, newName: '', newPhone: '' }));
        onNotify('تم تسجيل العضو الجديد في الحسابات وإضافته للرحلة بنجاح.');
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'تعذرت إضافة العضو الجديد.', 'error');
      }
    }
  };

  const handleCollectRemaining = async (accountId: string, remaining: number) => {
    if (!activeTrip || remaining <= 0) return;
    try {
      await recordTripMemberPayment({
        tripId: activeTrip.id,
        accountId,
        amount: remaining,
        treasuryId: 'MAIN_TR',
      });
      onNotify('تم تحصيل المتبقي وتوريده للخزينة.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر التحصيل.', 'error');
    }
  };

  const handleIssueGear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    const itemId = gearForm.itemId || items[0]?.id;
    if (!itemId) return;
    try {
      await issueTripGear({
        tripId: activeTrip.id,
        itemId,
        warehouseId: gearForm.warehouseId,
        qty: Number(gearForm.qty) || 1,
      });
      onNotify('تم صرف المعدات/الطعوم من المخزن للرحلة.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر الصرف.', 'error');
    }
  };

  const handleReturnGear = async (
    itemId: string,
    warehouseId: string,
    maxReturn: number
  ) => {
    if (!activeTrip) return;
    const key = `${itemId}_${warehouseId}`;
    const qty = returnInputs[key] ?? maxReturn;
    try {
      await returnTripGear({
        tripId: activeTrip.id,
        itemId,
        warehouseId,
        returnQty: qty,
      });
      onNotify('تم إرجاع المتبقي للمخزن بنجاح.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر الإرجاع.', 'error');
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !expForm.title.trim()) return;
    try {
      await addTripExpense({
        tripId: activeTrip.id,
        title: expForm.title.trim(),
        amount: Number(expForm.amount) || 0,
        treasuryId: expForm.treasuryId,
      });
      setExpForm({ title: '', amount: 0, treasuryId: 'MAIN_TR' });
      onNotify('تم تسجيل مصروف الرحلة وخصمه من الخزينة.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تسجيل المصروف.', 'error');
    }
  };

  const financials = activeTrip ? computeTripFinancials(activeTrip) : null;
  const activeExpectedTotal = activeTrip
    ? activeTrip.expectedTotal ??
      (activeTrip.pricePerMember ?? 0) * (activeTrip.plannedMembersCount ?? 0)
    : 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="إدارة رحلات الصيد البحرية"
        subtitle="اشتراكات الأعضاء، الأعضاء الجدد، تسعير الرحلة، صرف وإرجاع المعدات، والمصروفات"
        actions={
          <div className="flex gap-2">
            <PrintButton />
            <button
              type="button"
              onClick={() => setShowNewForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600"
            >
              <Plus className="h-4 w-4" />
              رحلة جديدة
            </button>
          </div>
        }
      />

      {showNewForm && (
        <form
          onSubmit={handleCreateTrip}
          className="no-print space-y-3 rounded-2xl border border-sky-800/60 bg-neutral-900 p-4 shadow-lg"
        >
          <div className="text-sm font-bold text-sky-300">تسجيل رحلة جديدة</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs text-neutral-400">عنوان الرحلة *</label>
              <input
                required
                placeholder="مثال: رحلة الجونة"
                value={newTrip.title}
                onChange={(e) => setNewTrip({ ...newTrip, title: e.target.value })}
                className={`w-full ${inputCls}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">الوجهة البحرية *</label>
              <input
                required
                placeholder="الوجهة البحرية"
                value={newTrip.destination}
                onChange={(e) => setNewTrip({ ...newTrip, destination: e.target.value })}
                className={`w-full ${inputCls}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">اسم المركب *</label>
              <input
                required
                placeholder="اسم المركب"
                value={newTrip.boatName}
                onChange={(e) => setNewTrip({ ...newTrip, boatName: e.target.value })}
                className={`w-full ${inputCls}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">تاريخ البدء</label>
              <input
                type="date"
                value={newTrip.startDate}
                onChange={(e) => setNewTrip({ ...newTrip, startDate: e.target.value })}
                className={`w-full ${inputCls}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                سعر الرحلة للعضو / العميل
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={newTrip.pricePerMember}
                onChange={(e) => {
                  const price = Number(e.target.value) || 0;
                  setNewTrip((prev) => ({
                    ...prev,
                    pricePerMember: price,
                    expectedTotal: prev.manualTotal
                      ? prev.expectedTotal
                      : price * prev.plannedMembersCount,
                  }));
                }}
                className={`w-full font-bold text-sky-300 ${inputCls}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                عدد أعضاء الرحلة المتوقع
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={newTrip.plannedMembersCount}
                onChange={(e) => {
                  const count = Math.max(0, Math.round(Number(e.target.value) || 0));
                  setNewTrip((prev) => ({
                    ...prev,
                    plannedMembersCount: count,
                    expectedTotal: prev.manualTotal
                      ? prev.expectedTotal
                      : prev.pricePerMember * count,
                  }));
                }}
                className={`w-full font-bold ${inputCls}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                إجمالي الرحلة المتوقع (تلقائي / قابل للتعديل)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={newTrip.expectedTotal}
                  onChange={(e) =>
                    setNewTrip({
                      ...newTrip,
                      expectedTotal: Number(e.target.value) || 0,
                      manualTotal: true,
                    })
                  }
                  className={`flex-1 font-extrabold text-emerald-300 ${inputCls}`}
                />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
                >
                  حفظ
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Trips List */}
        <div className="no-print space-y-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 lg:col-span-4">
          <div className="px-2 py-1 text-xs font-bold text-neutral-400">
            قائمة الرحلات ({trips.length})
          </div>
          {trips.map((tr) => {
            const fin = computeTripFinancials(tr);
            const selected = activeTrip?.id === tr.id;
            const targetTotal =
              tr.expectedTotal ??
              (tr.pricePerMember ?? 0) * (tr.plannedMembersCount ?? 0);
            return (
              <button
                key={tr.id}
                type="button"
                onClick={() => setSelectedTripId(tr.id)}
                className={`w-full rounded-xl border p-3 text-right transition ${
                  selected
                    ? 'border-sky-500 bg-sky-950/50 shadow-xs'
                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-neutral-100">{tr.title}</div>
                  <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-neutral-300">
                    {STATUS_LABELS[tr.status]}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                  <Compass className="h-3.5 w-3.5" />
                  <span>{tr.destination}</span>
                  <span>•</span>
                  <Anchor className="h-3.5 w-3.5" />
                  <span>{tr.boatName}</span>
                </div>
                {targetTotal > 0 && (
                  <div className="mt-1.5 text-[11px] text-sky-300">
                    المستهدف: {formatCurrency(targetTotal)} ({tr.members.length}/
                    {tr.plannedMembersCount ?? tr.members.length} عضو)
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-neutral-500">{formatDate(tr.startDate)}</span>
                  <span
                    className={`font-bold ${
                      fin.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    صافي: {formatCurrency(fin.netProfit)}
                  </span>
                </div>
              </button>
            );
          })}
          {trips.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-500">
              لا توجد رحلات مسجلة بعد.
            </p>
          )}
        </div>

        {/* Selected Trip Details */}
        {activeTrip && financials && (
          <div className="print-area space-y-4 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div>
                <h3 className="text-lg font-bold text-white">{activeTrip.title}</h3>
                <p className="text-xs text-neutral-400">
                  {activeTrip.destination} • {activeTrip.boatName} • تاريخ البدء:{' '}
                  {formatDate(activeTrip.startDate)}
                </p>
                {activeExpectedTotal > 0 && (
                  <p className="mt-1 text-xs text-sky-300">
                    سعر العضو: {formatCurrency(activeTrip.pricePerMember ?? 0)} ×{' '}
                    {activeTrip.plannedMembersCount ?? 0} عضو = إجمالي متوقع:{' '}
                    <strong>{formatCurrency(activeExpectedTotal)}</strong> (المحصّل:{' '}
                    {formatCurrency(financials.totalCollected)})
                  </p>
                )}
              </div>
              <div className="no-print flex flex-wrap items-center gap-2">
                <select
                  value={activeTrip.status}
                  onChange={(e) =>
                    void updateTripStatus(
                      activeTrip.id,
                      e.target.value as FishingTrip['status']
                    )
                  }
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm font-semibold text-neutral-100"
                >
                  <option value="PLANNED">مخططة</option>
                  <option value="ACTIVE">جارية حالياً</option>
                  <option value="COMPLETED">مكتملة</option>
                </select>
                <button
                  type="button"
                  onClick={() => openEditTrip(activeTrip)}
                  className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-200 hover:bg-neutral-700"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  تعديل
                </button>
                <button
                  type="button"
                  onClick={() => void openDeleteTrip(activeTrip)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-800 bg-rose-950/60 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-900/60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="إجمالي الاشتراكات المسجلة"
                value={formatCurrency(financials.totalFees)}
                hint={
                  activeExpectedTotal > 0
                    ? `المستهدف: ${formatCurrency(activeExpectedTotal)} | المحصّل: ${formatCurrency(financials.totalCollected)}`
                    : `المحصّل: ${formatCurrency(financials.totalCollected)}`
                }
                tone="sky"
              />
              <StatCard
                label="متبقي على الأعضاء"
                value={formatCurrency(financials.totalRemaining)}
                hint={
                  activeExpectedTotal > financials.totalCollected
                    ? `متبقي من المستهدف: ${formatCurrency(activeExpectedTotal - financials.totalCollected)}`
                    : undefined
                }
                tone={financials.totalRemaining > 0 ? 'amber' : 'slate'}
              />
              <StatCard
                label="تكلفة المعدات + المصروفات"
                value={formatCurrency(financials.totalCost)}
                hint={`معدات: ${formatCurrency(financials.gearCost)}`}
                tone="rose"
              />
              <StatCard
                label="صافي ربح / خسارة الرحلة"
                value={formatCurrency(financials.netProfit)}
                tone={financials.netProfit >= 0 ? 'emerald' : 'rose'}
              />
            </div>

            {/* Members Section */}
            <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-neutral-100">
                  أعضاء الرحلة ({activeTrip.members.length}
                  {activeTrip.plannedMembersCount
                    ? ` / ${activeTrip.plannedMembersCount}`
                    : ''}
                  )
                </h4>
                <div className="no-print inline-flex rounded-lg border border-neutral-700 bg-neutral-950 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMemberMode('EXISTING')}
                    className={`rounded-md px-3 py-1 font-bold transition ${
                      memberMode === 'EXISTING'
                        ? 'bg-sky-700 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    عضو/عميل مسجل
                  </button>
                  <button
                    type="button"
                    onClick={() => setMemberMode('NEW')}
                    className={`rounded-md px-3 py-1 font-bold transition ${
                      memberMode === 'NEW'
                        ? 'bg-emerald-700 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    + عضو غير مسجل (ترحيل للحسابات)
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleAddMember}
                className="no-print grid grid-cols-1 gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 sm:grid-cols-12"
              >
                {memberMode === 'EXISTING' ? (
                  <select
                    value={memberForm.accountId || memberCandidates[0]?.id || ''}
                    onChange={(e) =>
                      setMemberForm({ ...memberForm, accountId: e.target.value })
                    }
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 sm:col-span-5"
                  >
                    {memberCandidates.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.phone || m.code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      required
                      type="text"
                      placeholder="اسم العضو الجديد *"
                      value={memberForm.newName}
                      onChange={(e) =>
                        setMemberForm({ ...memberForm, newName: e.target.value })
                      }
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 sm:col-span-3"
                    />
                    <input
                      type="text"
                      placeholder="رقم الهاتف"
                      value={memberForm.newPhone}
                      onChange={(e) =>
                        setMemberForm({ ...memberForm, newPhone: e.target.value })
                      }
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 sm:col-span-2"
                    />
                  </>
                )}

                <input
                  type="number"
                  min={0}
                  placeholder="الاشتراك"
                  title="قيمة الاشتراك"
                  value={memberForm.fee}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, fee: Number(e.target.value) })
                  }
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 sm:col-span-2"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="المدفوع"
                  title="المبلغ المدفوع الآن"
                  value={memberForm.paid}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, paid: Number(e.target.value) })
                  }
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 sm:col-span-2"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 sm:col-span-3"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {memberMode === 'NEW' ? 'تسجيل وإضافة للرحلة' : 'إضافة عضو'}
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-neutral-950 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">العضو</th>
                      <th className="px-3 py-2">الاشتراك</th>
                      <th className="px-3 py-2">المدفوع</th>
                      <th className="px-3 py-2">المتبقي</th>
                      <th className="px-3 py-2 no-print">تحصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {activeTrip.members.map((m) => (
                      <tr key={m.accountId} className="hover:bg-neutral-800/40">
                        <td className="px-3 py-2 font-semibold text-neutral-100">
                          {m.name}
                        </td>
                        <td className="px-3 py-2">{formatCurrency(m.fee)}</td>
                        <td className="px-3 py-2 text-emerald-400">
                          {formatCurrency(m.paid)}
                        </td>
                        <td className="px-3 py-2 font-bold text-rose-400">
                          {formatCurrency(m.remaining)}
                        </td>
                        <td className="px-3 py-2 no-print">
                          {m.remaining > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleCollectRemaining(m.accountId, m.remaining)
                              }
                              className="rounded bg-sky-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-600"
                            >
                              تحصيل كامل
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-400">خالص</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {activeTrip.members.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-neutral-500">
                          لم يتم تسجيل أعضاء في هذه الرحلة بعد.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Gear Section */}
            <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h4 className="font-bold text-neutral-100">
                المعدات والطعوم المصروفة من المخزن
              </h4>

              <form
                onSubmit={handleIssueGear}
                className="no-print grid grid-cols-1 gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 sm:grid-cols-5"
              >
                <select
                  value={gearForm.itemId || items[0]?.id || ''}
                  onChange={(e) => setGearForm({ ...gearForm, itemId: e.target.value })}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 sm:col-span-2"
                >
                  {items.map((it) => {
                    const q =
                      stocks.find(
                        (s) =>
                          s.warehouseId === gearForm.warehouseId &&
                          s.itemId === it.id
                      )?.quantity ?? 0;
                    return (
                      <option key={it.id} value={it.id}>
                        {it.name} (متاح: {q})
                      </option>
                    );
                  })}
                </select>
                <select
                  value={gearForm.warehouseId}
                  onChange={(e) =>
                    setGearForm({ ...gearForm, warehouseId: e.target.value })
                  }
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={gearForm.qty}
                  onChange={(e) =>
                    setGearForm({ ...gearForm, qty: Number(e.target.value) })
                  }
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
                >
                  <PackageMinus className="h-3.5 w-3.5" />
                  صرف للرحلة
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-neutral-950 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">الصنف</th>
                      <th className="px-3 py-2">المخزن</th>
                      <th className="px-3 py-2">المصروف</th>
                      <th className="px-3 py-2">المرتجع</th>
                      <th className="px-3 py-2">المستهلك</th>
                      <th className="px-3 py-2">التكلفة</th>
                      <th className="px-3 py-2 no-print">إرجاع للمخزن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {activeTrip.gearUsed.map((g) => {
                      const consumed = g.qtyIssued - g.qtyReturned;
                      const key = `${g.itemId}_${g.warehouseId}`;
                      return (
                        <tr key={key} className="hover:bg-neutral-800/40">
                          <td className="px-3 py-2 font-semibold text-neutral-100">
                            {g.name}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-400">
                            {getWarehouseName(g.warehouseId)}
                          </td>
                          <td className="px-3 py-2">{g.qtyIssued}</td>
                          <td className="px-3 py-2 text-emerald-400">{g.qtyReturned}</td>
                          <td className="px-3 py-2 font-bold">{consumed}</td>
                          <td className="px-3 py-2">
                            {formatCurrency(consumed * g.unitCost)}
                          </td>
                          <td className="px-3 py-2 no-print">
                            {consumed > 0 ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={consumed}
                                  value={returnInputs[key] ?? consumed}
                                  onChange={(e) =>
                                    setReturnInputs((prev) => ({
                                      ...prev,
                                      [key]: Number(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-center text-xs text-neutral-100"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleReturnGear(
                                      g.itemId,
                                      g.warehouseId,
                                      consumed
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                                >
                                  <PackagePlus className="h-3 w-3" />
                                  إرجاع
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-neutral-500">مرتجع بالكامل</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expenses Section */}
            <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h4 className="font-bold text-neutral-100">
                مصروفات وتكاليف الرحلة (تُخصم من الخزينة)
              </h4>

              <form
                onSubmit={handleAddExpense}
                className="no-print grid grid-cols-1 gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 sm:grid-cols-4"
              >
                <input
                  required
                  placeholder="بيان المصروف (إيجار مركب، وقود، ثلج...)"
                  value={expForm.title}
                  onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 sm:col-span-2"
                />
                <input
                  required
                  type="number"
                  min={1}
                  step="any"
                  placeholder="المبلغ"
                  value={expForm.amount || ''}
                  onChange={(e) =>
                    setExpForm({ ...expForm, amount: Number(e.target.value) })
                  }
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100"
                />
                <div className="flex gap-1">
                  <select
                    value={expForm.treasuryId}
                    onChange={(e) =>
                      setExpForm({ ...expForm, treasuryId: e.target.value })
                    }
                    className="w-28 rounded-lg border border-neutral-700 bg-neutral-900 px-1.5 py-1.5 text-xs text-neutral-100"
                  >
                    {treasuries.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    خصم
                  </button>
                </div>
              </form>

              <div className="space-y-1.5">
                {activeTrip.expenses.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center justify-between rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm"
                  >
                    <span className="text-neutral-200">{ex.title}</span>
                    <span className="font-bold text-rose-400">
                      {formatCurrency(ex.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Trip Modal */}
      {editingTrip && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <form
            onSubmit={handleSaveEditTrip}
            className="w-full max-w-xl space-y-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white">تعديل تفاصيل الرحلة</h3>
              <button
                type="button"
                onClick={() => setEditingTrip(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-neutral-400">عنوان الرحلة</label>
                <input
                  required
                  value={editingTrip.title}
                  onChange={(e) =>
                    setEditingTrip({ ...editingTrip, title: e.target.value })
                  }
                  className={`w-full ${inputCls}`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">الوجهة البحرية</label>
                <input
                  required
                  value={editingTrip.destination}
                  onChange={(e) =>
                    setEditingTrip({ ...editingTrip, destination: e.target.value })
                  }
                  className={`w-full ${inputCls}`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">اسم المركب</label>
                <input
                  required
                  value={editingTrip.boatName}
                  onChange={(e) =>
                    setEditingTrip({ ...editingTrip, boatName: e.target.value })
                  }
                  className={`w-full ${inputCls}`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">تاريخ البدء</label>
                <input
                  type="date"
                  value={editingTrip.startDate}
                  onChange={(e) =>
                    setEditingTrip({ ...editingTrip, startDate: e.target.value })
                  }
                  className={`w-full ${inputCls}`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">الحالة</label>
                <select
                  value={editingTrip.status}
                  onChange={(e) =>
                    setEditingTrip({
                      ...editingTrip,
                      status: e.target.value as FishingTrip['status'],
                    })
                  }
                  className={`w-full ${inputCls}`}
                >
                  <option value="PLANNED">مخططة</option>
                  <option value="ACTIVE">جارية حالياً</option>
                  <option value="COMPLETED">مكتملة</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">سعر العضو</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={editingTrip.pricePerMember}
                  onChange={(e) => {
                    const price = Number(e.target.value) || 0;
                    setEditingTrip((prev) =>
                      prev
                        ? {
                            ...prev,
                            pricePerMember: price,
                            expectedTotal: prev.manualTotal
                              ? prev.expectedTotal
                              : price * prev.plannedMembersCount,
                          }
                        : null
                    );
                  }}
                  className={`w-full ${inputCls}`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">عدد الأعضاء المتوقع</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={editingTrip.plannedMembersCount}
                  onChange={(e) => {
                    const count = Math.max(0, Math.round(Number(e.target.value) || 0));
                    setEditingTrip((prev) =>
                      prev
                        ? {
                            ...prev,
                            plannedMembersCount: count,
                            expectedTotal: prev.manualTotal
                              ? prev.expectedTotal
                              : prev.pricePerMember * count,
                          }
                        : null
                    );
                  }}
                  className={`w-full ${inputCls}`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-neutral-400">
                  إجمالي الرحلة المتوقع
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={editingTrip.expectedTotal}
                  onChange={(e) =>
                    setEditingTrip({
                      ...editingTrip,
                      expectedTotal: Number(e.target.value) || 0,
                      manualTotal: true,
                    })
                  }
                  className={`w-full font-bold text-emerald-300 ${inputCls}`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-800 pt-3">
              <button
                type="button"
                onClick={() => setEditingTrip(null)}
                className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-bold text-white hover:bg-sky-500"
              >
                حفظ التعديلات
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Trip Confirmation Modal */}
      {deleteDialog && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-rose-800/70 bg-neutral-900 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-rose-300">
              تأكيد حذف رحلة: {deleteDialog.trip.title}
            </h3>
            <div className="space-y-1.5 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300">
              <div>• سندات الخزينة المرتبطة: {deleteDialog.vouchersCount}</div>
              <div>• الفواتير المرتبطة: {deleteDialog.invoicesCount}</div>
              <div>• وحدات معدات لم تُرتجع للمخزن: {deleteDialog.unreturnedGearUnits}</div>
              <div>• أعضاء لديهم أرصدة متبقية: {deleteDialog.membersWithDebt}</div>
            </div>

            <label className="flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-200 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteDialog.rollbackMovements}
                onChange={(e) =>
                  setDeleteDialog({
                    ...deleteDialog,
                    rollbackMovements: e.target.checked,
                  })
                }
                className="mt-0.5 h-4 w-4 rounded border-neutral-600"
              />
              <span>
                <strong>عكس الحركات المرتبطة تلقائياً:</strong> إرجاع المعدات غير المرتجعة
                للمخزن، عكس مديونيات الأعضاء، وحذف سندات القبض والصرف الخاصة بالرحلة.
                (عند إلغاء التحديد سيتم فك الارتباط فقط مع الحفاظ على أرصدة الخزينة).
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteTrip()}
                className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white hover:bg-rose-500"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
