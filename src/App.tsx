import React, { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Anchor,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Edit3,
  FileText,
  Home,
  List,
  Package,
  PackagePlus,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  Vault,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Account, CategoryDef, Item, Treasury, WarehouseDef, db, seedInitialData, syncTreasuryCatalog, syncWarehouseCatalog } from './db';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { runSync } from './erpEngine';
import { PosInvoiceScreen } from './components/PosInvoiceScreen';
import {
  DailyMovementScreen,
  InvoicesListScreen,
} from './components/InvoicesAndDailyScreen';
import {
  GoodsOverviewScreen,
  ItemEntryScreen,
  ItemsListScreen,
  StockCountAndSettlementScreen,
  StockTransferScreen,
} from './components/InventoryScreens';
import {
  AccountEntryScreen,
  AccountsListScreen,
  TreasuryScreen,
  VoucherFormScreen,
} from './components/AccountsAndTreasuryScreens';
import { TripsScreen } from './components/TripsScreen';
import { ReportTab, ReportsScreen } from './components/ReportsScreen';
import { FacebookMarketingScreen } from './components/FacebookMarketingScreen';
import { processDueCampaigns } from './fbMarketingEngine';

type ScreenId =
  | 'home'
  | 'pos-sale'
  | 'purchase'
  | 'invoices'
  | 'sale-return'
  | 'purchase-return'
  | 'daily'
  | 'items'
  | 'item-entry'
  | 'goods'
  | 'stock-count'
  | 'stock-transfer'
  | 'stock-settlement'
  | 'accounts'
  | 'account-entry'
  | 'suppliers'
  | 'treasury'
  | 'receipt'
  | 'payment'
  | 'trips'
  | 'sales-analysis'
  | 'reports'
  | 'fb-marketing'
  | 'definitions';

interface TileDef {
  id: ScreenId;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  reportTab?: ReportTab;
}

const GROUPS: Array<{ title: string; tiles: TileDef[] }> = [
  {
    title: 'المبيعات والمشتريات والحركة',
    tiles: [
      { id: 'pos-sale', label: 'بيع (POS)', sub: 'كاشير سريع', icon: ShoppingCart, accent: 'bg-sky-600' },
      { id: 'purchase', label: 'شراء', sub: 'تحديث متوسط التكلفة', icon: ShoppingBag, accent: 'bg-indigo-600' },
      { id: 'invoices', label: 'الفواتير', sub: 'سجل وطباعة الفواتير', icon: FileText, accent: 'bg-slate-600' },
      { id: 'sale-return', label: 'مرتجع بيع', sub: 'رد أصناف من عميل', icon: RotateCcw, accent: 'bg-amber-600' },
      { id: 'purchase-return', label: 'مرتجع شراء', sub: 'رد أصناف لمورد', icon: RotateCcw, accent: 'bg-rose-600' },
      { id: 'daily', label: 'الحركة اليومية', sub: 'ملخص فواتير وسندات اليوم', icon: CalendarClock, accent: 'bg-teal-600' },
    ],
  },
  {
    title: 'الأصناف والمخازن والجرد',
    tiles: [
      { id: 'items', label: 'الأصناف', sub: 'كتالوج أدوات الصيد', icon: Package, accent: 'bg-emerald-600' },
      { id: 'item-entry', label: 'إدخال الأصناف', sub: 'تعريف صنف وأسعاره', icon: PackagePlus, accent: 'bg-green-700' },
      { id: 'goods', label: 'البضاعة', sub: 'أرصدة المخازن والتقييم', icon: Boxes, accent: 'bg-cyan-700' },
      { id: 'stock-count', label: 'جرد مخزني', sub: 'مطابقة الدفتري بالفعلي', icon: ClipboardList, accent: 'bg-sky-700' },
      { id: 'stock-transfer', label: 'تحويل لمخزن', sub: 'بين الرئيسي والرحلات', icon: ArrowLeftRight, accent: 'bg-violet-600' },
      { id: 'stock-settlement', label: 'تسوية جردية', sub: 'اعتماد فروقات الجرد', icon: ClipboardCheck, accent: 'bg-amber-700' },
    ],
  },
  {
    title: 'الحسابات والخزينة والرحلات والتقارير',
    tiles: [
      { id: 'accounts', label: 'الحسابات', sub: 'عملاء وأعضاء ومصروفات', icon: Users, accent: 'bg-slate-700' },
      { id: 'account-entry', label: 'إدخال الحسابات', sub: 'إضافة وتعديل حساب', icon: UserPlus, accent: 'bg-blue-700' },
      { id: 'suppliers', label: 'حسابات المورد', sub: 'متابعة وسداد الموردين', icon: Truck, accent: 'bg-orange-600' },
      { id: 'treasury', label: 'الخزينة', sub: 'الأرصدة والتحويلات', icon: Vault, accent: 'bg-emerald-700' },
      { id: 'receipt', label: 'قبض', sub: 'سند قبض نقدية', icon: ArrowDownCircle, accent: 'bg-green-600' },
      { id: 'payment', label: 'صرف', sub: 'سند صرف ومصروفات', icon: ArrowUpCircle, accent: 'bg-rose-700' },
      { id: 'trips', label: 'الرحلات', sub: 'إدارة رحلات الصيد والأرباح', icon: Anchor, accent: 'bg-cyan-600' },
      { id: 'sales-analysis', label: 'تحليل المبيعات', sub: 'الربحية وحركة البيع', icon: TrendingUp, accent: 'bg-purple-600', reportTab: 'sales-analysis' },
      { id: 'reports', label: 'التقارير', sub: 'تقارير رئيسية وتفصيلية', icon: BarChart3, accent: 'bg-sky-800', reportTab: 'daily' },
      { id: 'fb-marketing', label: 'حملات فيسبوك والـ AI', sub: 'النشر المجدول + مساعد الرد', icon: Bot, accent: 'bg-blue-600' },
    ],
  },
  {
    title: 'الإعدادات والتعريفات',
    tiles: [
      { id: 'definitions', label: 'التعريفات', sub: 'إدارة الأصناف والحسابات والخزائن', icon: Settings, accent: 'bg-neutral-600' },
    ],
  },
];

/* ─── Dark input class ─── */
const darkInput =
  'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none';

/* ─── Back Button Component ─── */
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-print inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-2.5 text-sm font-extrabold text-neutral-950 shadow-sm transition hover:bg-white"
    >
      <ArrowRight className="h-4 w-4" />
      <span>رجوع</span>
    </button>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/definitions" element={<DefinitionsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HomeScreen – the main dashboard
   ═══════════════════════════════════════════════════════════════ */
function HomeScreen() {
  const [screen, setScreen] = useState<ScreenId>('home');
  const [screenHistory, setScreenHistory] = useState<ScreenId[]>([]);
  const [reportInitialTab, setReportInitialTab] = useState<ReportTab>('daily');
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [voucherPreselectAccountId, setVoucherPreselectAccountId] = useState<string>('');

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncing, setSyncing] = useState(false);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const pendingCount = useLiveQuery(() => db.syncQueue.count(), []) ?? 0;

  const notify = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    seedInitialData()
      .then(() => setReady(true))
      .catch((err) => { console.error(err); setReady(true); });
  }, []);

  const handleSync = useCallback(
    async (silent = false) => {
      setSyncing(true);
      try {
        const res = await runSync();
        if (res.syncedCount > 0) notify(`تمت مزامنة ${res.syncedCount} عملية بنجاح.`);
        else if (!silent) notify('جميع البيانات متزامنة بالفعل.');
      } catch (err) {
        if (!silent) notify(err instanceof Error ? err.message : 'تعذرت المزامنة.', 'error');
      } finally { setSyncing(false); }
    },
    [notify]
  );

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); void handleSync(true); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [handleSync]);

  useEffect(() => {
    if (!ready) return;
    const checkDue = () => {
      void processDueCampaigns().then((res) => {
        if (res.processedCount > 0) notify(`تم تنفيذ ${res.processedCount} خطوة حملة فيسبوك مستحقة تلقائياً.`);
      });
    };
    checkDue();
    const timer = window.setInterval(checkDue, 60_000);
    return () => window.clearInterval(timer);
  }, [ready, notify]);

  const goTo = (nextScreen: ScreenId) => {
    setScreenHistory((prev) => [...prev, screen]);
    setScreen(nextScreen);
  };

  const goBack = () => {
    if (screenHistory.length > 0) {
      const prev = screenHistory[screenHistory.length - 1];
      setScreenHistory((h) => h.slice(0, -1));
      setScreen(prev);
    } else {
      setScreen('home');
    }
  };

  const navigateTile = (tile: TileDef) => {
    if (tile.id === 'item-entry') setEditingItem(null);
    if (tile.id === 'account-entry') setEditingAccount(null);
    if (tile.id === 'receipt' || tile.id === 'payment') setVoucherPreselectAccountId('');
    if (tile.reportTab) setReportInitialTab(tile.reportTab);
    goTo(tile.id);
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col">
      {/* Top Bar */}
      <header className="no-print sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900 shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {screen !== 'home' && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-800 px-3 py-2 text-sm font-bold transition hover:bg-neutral-700"
              >
                <ArrowRight className="h-4 w-4" />
                <span>رجوع</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => { setScreenHistory([]); setScreen('home'); }}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-800 px-3 py-2 text-sm font-bold transition hover:bg-neutral-700"
            >
              <Home className="h-4 w-4" />
              <span>الرئيسية</span>
            </button>
            <div className="flex items-center gap-2">
              <Anchor className="h-5 w-5 text-amber-400" />
              <div>
                <h1 className="text-sm font-extrabold tracking-wide sm:text-base text-white">Fishing Master ERP</h1>
                <p className="hidden text-[11px] text-neutral-400 sm:block">إدارة أدوات الصيد والرحلات البحرية • Offline-First</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${isOnline ? 'bg-emerald-900/50 text-emerald-300 ring-1 ring-emerald-700' : 'bg-amber-900/50 text-amber-300 ring-1 ring-amber-700'}`}>
              {isOnline ? (<><Wifi className="h-3.5 w-3.5" /><span>أونلاين</span></>) : (<><WifiOff className="h-3.5 w-3.5" /><span>أوفلاين (محلي)</span></>)}
            </div>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSync(false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-800 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-neutral-700 transition hover:bg-neutral-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>مزامنة</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${pendingCount > 0 ? 'bg-amber-500 text-neutral-900' : 'bg-neutral-700 text-neutral-300'}`}>{pendingCount}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="no-print fixed bottom-5 left-5 z-50 max-w-sm">
          <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg ${toast.type === 'error' ? 'bg-rose-700' : 'bg-emerald-700'}`}>
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        {ready && screen !== 'home' && screen !== 'definitions' && (
          <div className="mb-4">
            <BackButton onClick={goBack} />
          </div>
        )}
        {!ready ? (
          <div className="py-20 text-center text-neutral-400">جارٍ تهيئة قاعدة البيانات المحلية...</div>
        ) : screen === 'home' ? (
          <div className="space-y-5">
            {GROUPS.map((grp) => (
              <section key={grp.title} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
                <h2 className="mb-4 text-sm font-extrabold text-neutral-300 sm:text-base">{grp.title}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {grp.tiles.map((tile) => {
                    const Icon = tile.icon;
                    return (
                      <button key={tile.id} type="button" onClick={() => navigateTile(tile)} className="group flex flex-col items-start justify-between rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-right shadow-xs transition hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-md">
                        <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-white ${tile.accent} transition group-hover:scale-105`}><Icon className="h-5 w-5" /></div>
                        <div>
                          <div className="text-sm font-bold text-neutral-100">{tile.label}</div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">{tile.sub}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : screen === 'definitions' ? (
          <DefinitionsScreen onBack={goBack} onNotify={notify} />
        ) : screen === 'pos-sale' ? (
          <PosInvoiceScreen mode="SALE" onNotify={notify} />
        ) : screen === 'purchase' ? (
          <PosInvoiceScreen mode="PURCHASE" onNotify={notify} />
        ) : screen === 'sale-return' ? (
          <PosInvoiceScreen mode="SALE_RETURN" onNotify={notify} />
        ) : screen === 'purchase-return' ? (
          <PosInvoiceScreen mode="PURCHASE_RETURN" onNotify={notify} />
        ) : screen === 'invoices' ? (
          <InvoicesListScreen />
        ) : screen === 'daily' ? (
          <DailyMovementScreen />
        ) : screen === 'items' ? (
          <ItemsListScreen
            onEditItem={(it) => { setEditingItem(it); goTo('item-entry'); }}
            onNewItem={() => { setEditingItem(null); goTo('item-entry'); }}
          />
        ) : screen === 'item-entry' ? (
          <ItemEntryScreen
            key={editingItem?.id ?? 'new-item'}
            editingItem={editingItem}
            onDone={() => { setEditingItem(null); goBack(); }}
            onNotify={notify}
          />
        ) : screen === 'goods' ? (
          <GoodsOverviewScreen onGoToPurchase={() => goTo('purchase')} />
        ) : screen === 'stock-count' ? (
          <StockCountAndSettlementScreen mode="COUNT" onNotify={notify} />
        ) : screen === 'stock-transfer' ? (
          <StockTransferScreen onNotify={notify} />
        ) : screen === 'stock-settlement' ? (
          <StockCountAndSettlementScreen mode="SETTLEMENT" onNotify={notify} />
        ) : screen === 'accounts' ? (
          <AccountsListScreen mode="ALL" onNewAccount={() => { setEditingAccount(null); goTo('account-entry'); }} onEditAccount={(acc) => { setEditingAccount(acc); goTo('account-entry'); }} onQuickVoucher={(type, accountId) => { setVoucherPreselectAccountId(accountId); goTo(type === 'RECEIPT' ? 'receipt' : 'payment'); }} />
        ) : screen === 'account-entry' ? (
          <AccountEntryScreen editingAccount={editingAccount} onDone={() => { setEditingAccount(null); goBack(); }} onNotify={notify} />
        ) : screen === 'suppliers' ? (
          <AccountsListScreen mode="SUPPLIER" onNewAccount={() => { setEditingAccount(null); goTo('account-entry'); }} onEditAccount={(acc) => { setEditingAccount(acc); goTo('account-entry'); }} onQuickVoucher={(type, accountId) => { setVoucherPreselectAccountId(accountId); goTo(type === 'RECEIPT' ? 'receipt' : 'payment'); }} />
        ) : screen === 'treasury' ? (
          <TreasuryScreen onNotify={notify} />
        ) : screen === 'receipt' ? (
          <VoucherFormScreen mode="RECEIPT" preselectedAccountId={voucherPreselectAccountId} onNotify={notify} />
        ) : screen === 'payment' ? (
          <VoucherFormScreen mode="PAYMENT" preselectedAccountId={voucherPreselectAccountId} onNotify={notify} />
        ) : screen === 'trips' ? (
          <TripsScreen onNotify={notify} />
        ) : screen === 'sales-analysis' ? (
          <ReportsScreen key="sales-analysis" initialTab="sales-analysis" />
        ) : screen === 'reports' ? (
          <ReportsScreen key={reportInitialTab} initialTab={reportInitialTab} />
        ) : screen === 'fb-marketing' ? (
          <FacebookMarketingScreen onNotify={notify} />
        ) : null}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DefinitionsPage – standalone route at /definitions
   ═══════════════════════════════════════════════════════════════ */
function DefinitionsPage() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const notify = useCallback((text: string, type: 'success' | 'error' = 'success') => setToast({ text, type }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen bg-black text-neutral-100">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900 shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 rounded-xl bg-neutral-800 px-3 py-2 text-sm font-bold text-neutral-200 transition hover:bg-neutral-700">
            <ArrowRight className="h-4 w-4" /><span>رجوع للرئيسية</span>
          </button>
          <Settings className="h-5 w-5 text-amber-400" />
          <h1 className="text-sm font-extrabold sm:text-base text-white">التعريفات</h1>
        </div>
      </header>
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 max-w-sm">
          <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg ${toast.type === 'error' ? 'bg-rose-700' : 'bg-emerald-700'}`}>
            <CheckCircle2 className="h-4 w-4 shrink-0" /><span>{toast.text}</span>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <DefinitionsScreen onBack={() => navigate('/')} onNotify={notify} />
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DefinitionsScreen – comprehensive CRUD for all entity types
   ═══════════════════════════════════════════════════════════════ */
type DefEntity = 'items' | 'accounts' | 'treasuries' | 'categories' | 'warehouses';

interface DefTab {
  key: DefEntity;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DEF_TABS: DefTab[] = [
  { key: 'items', label: 'الأصناف', icon: Package },
  { key: 'accounts', label: 'الحسابات', icon: Users },
  { key: 'treasuries', label: 'الخزائن', icon: Vault },
  { key: 'categories', label: 'التصنيفات', icon: List },
  { key: 'warehouses', label: 'المخازن', icon: Boxes },
];

function DefinitionsScreen({ onBack, onNotify }: { onBack: () => void; onNotify: (msg: string, type?: 'success' | 'error') => void }) {
  const [tab, setTab] = useState<DefEntity>('items');
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /* ─── Live data ─── */
  const allItems = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const allTreasuries = useLiveQuery(() => db.treasuries.toArray(), []) ?? [];

  /* Derived categories from items */
  const categories = Array.from(new Set(allItems.map((i) => i.category).filter(Boolean)));
  /* Static warehouses (from constant) */
  const warehouses = [
    { id: 'MAIN_WH', name: 'المخزن الرئيسي' },
    { id: 'SUB_WH', name: 'مخزن الفرع / الرحلات' },
  ];

  const q = search.trim().toLowerCase();

  const getRows = (): Array<{ id: string; name: string; detail?: string }> => {
    switch (tab) {
      case 'items':
        return allItems
          .filter((i) => !q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q) || i.barcode.toLowerCase().includes(q))
          .map((i) => ({ id: i.id, name: i.name, detail: `${i.code} | ${i.category || '—'} | سعر بيع: ${i.salePrice}` }));
      case 'accounts':
        return allAccounts
          .filter((a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q))
          .map((a) => ({ id: a.id, name: a.name, detail: `${a.code} | ${a.type} | هاتف: ${a.phone || '—'}` }));
      case 'treasuries':
        return allTreasuries
          .filter((t) => !q || t.name.toLowerCase().includes(q))
          .map((t) => ({ id: t.id, name: t.name, detail: `رصيد افتتاحي: ${t.openingBalance} | ${t.isActive ? 'نشطة' : 'غير نشطة'}` }));
      case 'categories':
        return categories
          .filter((c) => !q || c.toLowerCase().includes(q))
          .map((c, i) => ({ id: `cat-${i}`, name: c, detail: `${allItems.filter((it) => it.category === c).length} صنف` }));
      case 'warehouses':
        return warehouses
          .filter((w) => !q || w.name.toLowerCase().includes(q))
          .map((w) => ({ id: w.id, name: w.name }));
      default:
        return [];
    }
  };

  const rows = getRows();

  /* ─── Add handlers ─── */
  const handleAdd = () => {
    setEditingId(null);
    setShowAddForm(true);
  };

  /* ─── Delete handler ─── */
  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      if (tab === 'items') await db.items.delete(id);
      else if (tab === 'accounts') await db.accounts.delete(id);
      else if (tab === 'treasuries') await db.treasuries.delete(id);
      onNotify('تم الحذف بنجاح.');
    } catch { onNotify('فشل الحذف!', 'error'); }
  };

  /* ─── Edit handler ─── */
  const handleEdit = (id: string) => {
    setEditingId(id);
    setShowAddForm(true);
  };

  return (
    <div className="space-y-4">
      {/* Tab Buttons */}
      <div className="flex flex-wrap gap-2">
        {DEF_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSearch(''); setShowAddForm(false); setEditingId(null); }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${isActive ? 'bg-sky-700 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Search + Add */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${darkInput} pr-10`}
          />
        </div>
        {(tab === 'items' || tab === 'accounts' || tab === 'treasuries') && (
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-600"
          >
            <PlusCircle className="h-4 w-4" />
            إضافة جديد
          </button>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (tab === 'items' || tab === 'accounts' || tab === 'treasuries') && (
        <AddEditForm
          entity={tab}
          editingId={editingId}
          allItems={allItems}
          allAccounts={allAccounts}
          allTreasuries={allTreasuries}
          onClose={() => { setShowAddForm(false); setEditingId(null); }}
          onNotify={onNotify}
        />
      )}

      {/* Data Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-neutral-700 bg-neutral-800/80">
              <th className="px-4 py-3 font-bold text-neutral-300">الاسم</th>
              <th className="px-4 py-3 font-bold text-neutral-300">التفاصيل</th>
              {(tab === 'items' || tab === 'accounts' || tab === 'treasuries') && (
                <th className="px-4 py-3 font-bold text-neutral-300 w-32">إجراءات</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-neutral-500">لا توجد بيانات</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-neutral-800 transition hover:bg-neutral-800/50">
                <td className="px-4 py-3 font-semibold text-neutral-100">{row.name}</td>
                <td className="px-4 py-3 text-neutral-400 text-xs">{row.detail || '—'}</td>
                {(tab === 'items' || tab === 'accounts' || tab === 'treasuries') && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(row.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-600">
                        <Edit3 className="h-3 w-3" /> تعديل
                      </button>
                      <button onClick={() => handleDelete(row.id)} className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-600">
                        <Trash2 className="h-3 w-3" /> حذف
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-neutral-500">إجمالي النتائج: {rows.length}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AddEditForm – inline form for adding/editing items, accounts,
   and treasuries with full Dexie persistence
   ═══════════════════════════════════════════════════════════════ */
function AddEditForm({
  entity,
  editingId,
  allItems,
  allAccounts,
  allTreasuries,
  onClose,
  onNotify,
}: {
  entity: 'items' | 'accounts' | 'treasuries';
  editingId: string | null;
  allItems: Item[];
  allAccounts: Account[];
  allTreasuries: Treasury[];
  onClose: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  /* Item fields */
  const existingItem = editingId ? allItems.find((i) => i.id === editingId) : null;
  const existingAccount = editingId ? allAccounts.find((a) => a.id === editingId) : null;
  const existingTreasury = editingId ? allTreasuries.find((t) => t.id === editingId) : null;

  const [name, setName] = useState(existingItem?.name ?? existingAccount?.name ?? existingTreasury?.name ?? '');
  const [category, setCategory] = useState(existingItem?.category ?? '');
  const [brand, setBrand] = useState(existingItem?.brand ?? '');
  const [unit, setUnit] = useState(existingItem?.unit ?? '');
  const [salePrice, setSalePrice] = useState(existingItem?.salePrice?.toString() ?? '0');
  const [purchasePrice, setPurchasePrice] = useState(existingItem?.lastPurchasePrice?.toString() ?? '0');
  const [minStock, setMinStock] = useState(existingItem?.minStock?.toString() ?? '0');
  /* Account fields */
  const [accType, setAccType] = useState<Account['type']>(existingAccount?.type ?? 'CUSTOMER');
  const [phone, setPhone] = useState(existingAccount?.phone ?? '');
  /* Treasury fields */
  const [openingBalance, setOpeningBalance] = useState(existingTreasury?.openingBalance?.toString() ?? '0');
  const [isActive, setIsActive] = useState(existingTreasury?.isActive ?? true);

  const isEdit = !!editingId;

  const handleSave = async () => {
    if (!name.trim()) { onNotify('يرجى إدخال الاسم!', 'error'); return; }
    try {
      if (entity === 'items') {
        const id = isEdit ? editingId! : crypto.randomUUID();
        const code = existingItem?.code ?? id.slice(0, 8).toUpperCase();
        const barcode = existingItem?.barcode ?? id.slice(0, 8).toUpperCase();
        const data: Item = {
          id,
          code,
          barcode,
          name: name.trim(),
          category: category.trim(),
          brand: brand.trim(),
          specs: '',
          unit: unit.trim(),
          avgCost: Number(purchasePrice) || 0,
          lastPurchasePrice: Number(purchasePrice) || 0,
          salePrice: Number(salePrice) || 0,
          minStock: Number(minStock) || 0,
        };
        await db.items.put(data);
      } else if (entity === 'accounts') {
        const id = isEdit ? editingId! : crypto.randomUUID();
        const code = existingAccount?.code ?? id.slice(0, 6).toUpperCase();
        const data: Account = {
          id,
          code,
          name: name.trim(),
          type: accType,
          phone: phone.trim(),
          balance: existingAccount?.balance ?? 0,
        };
        await db.accounts.put(data);
      } else if (entity === 'treasuries') {
        const id = isEdit ? editingId! : `TR-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
        const data: Treasury = {
          id,
          name: name.trim(),
          openingBalance: Number(openingBalance) || 0,
          isActive,
        };
        await db.treasuries.put(data);
      }
      onNotify(isEdit ? 'تم التعديل بنجاح ✓' : 'تمت الإضافة بنجاح ✓');
      onClose();
    } catch (err) {
      onNotify('حدث خطأ أثناء الحفظ!', 'error');
      console.error(err);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">
          {isEdit ? 'تعديل' : 'إضافة'} {entity === 'items' ? 'صنف' : entity === 'accounts' ? 'حساب' : 'خزينة'}
        </h3>
        <button onClick={onClose} className="rounded-lg bg-neutral-800 p-2 text-neutral-400 hover:bg-neutral-700 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Common: Name */}
      <div>
        <label className="mb-1 block text-xs font-bold text-neutral-400">الاسم *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={darkInput} placeholder="أدخل الاسم" />
      </div>

      {/* Item-specific */}
      {entity === 'items' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><label className="mb-1 block text-xs font-bold text-neutral-400">التصنيف</label><input value={category} onChange={(e) => setCategory(e.target.value)} className={darkInput} placeholder="مثال: خيوط" /></div>
          <div><label className="mb-1 block text-xs font-bold text-neutral-400">الماركة</label><input value={brand} onChange={(e) => setBrand(e.target.value)} className={darkInput} placeholder="مثال: Shimano" /></div>
          <div><label className="mb-1 block text-xs font-bold text-neutral-400">الوحدة</label><input value={unit} onChange={(e) => setUnit(e.target.value)} className={darkInput} placeholder="قطعة / بكرة" /></div>
          <div><label className="mb-1 block text-xs font-bold text-neutral-400">سعر البيع</label><input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className={darkInput} /></div>
          <div><label className="mb-1 block text-xs font-bold text-neutral-400">سعر الشراء</label><input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className={darkInput} /></div>
          <div><label className="mb-1 block text-xs font-bold text-neutral-400">الحد الأدنى</label><input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={darkInput} /></div>
        </div>
      )}

      {/* Account-specific */}
      {entity === 'accounts' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-neutral-400">النوع</label>
            <select value={accType} onChange={(e) => setAccType(e.target.value as Account['type'])} className={darkInput}>
              <option value="CUSTOMER">عميل</option>
              <option value="SUPPLIER">مورد</option>
              <option value="TRIP_MEMBER">عضو رحلة</option>
              <option value="EXPENSE">مصروفات</option>
              <option value="REVENUE">إيرادات</option>
            </select>
          </div>
          <div><label className="mb-1 block text-xs font-bold text-neutral-400">الهاتف</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className={darkInput} placeholder="رقم الهاتف" /></div>
        </div>
      )}

      {/* Treasury-specific */}
      {entity === 'treasuries' && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-bold text-neutral-400">الرصيد الافتتاحي</label><input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className={darkInput} /></div>
          <div>
            <label className="mb-1 block text-xs font-bold text-neutral-400">الحالة</label>
            <select value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')} className={darkInput}>
              <option value="active">نشطة</option>
              <option value="inactive">غير نشطة</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          {isEdit ? 'حفظ التعديلات' : 'إضافة'}
        </button>
        <button onClick={onClose} className="rounded-xl bg-neutral-800 px-5 py-2.5 text-sm font-bold text-neutral-300 hover:bg-neutral-700">
          إلغاء
        </button>
      </div>
    </div>
  );
}
