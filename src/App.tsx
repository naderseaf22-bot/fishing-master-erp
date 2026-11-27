import React, { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Anchor,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  BarChart3,
  Bot,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Home,
  Package,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  Vault,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Account, Item, db, seedInitialData } from './db';
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
  | 'fb-marketing';

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
];

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('home');
  const [reportInitialTab, setReportInitialTab] = useState<ReportTab>('daily');
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [voucherPreselectAccountId, setVoucherPreselectAccountId] = useState<string>('');

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncing, setSyncing] = useState(false);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const pendingCount = useLiveQuery(() => db.syncQueue.count(), []) ?? 0;

  const notify = useCallback(
    (text: string, type: 'success' | 'error' = 'success') => {
      setToast({ text, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Seed initial data once on boot
  useEffect(() => {
    seedInitialData()
      .then(() => setReady(true))
      .catch((err) => {
        console.error(err);
        setReady(true);
      });
  }, []);

  const handleSync = useCallback(
    async (silent = false) => {
      setSyncing(true);
      try {
        const res = await runSync();
        if (res.syncedCount > 0) {
          notify(`تمت مزامنة ${res.syncedCount} عملية بنجاح.`);
        } else if (!silent) {
          notify('جميع البيانات متزامنة بالفعل.');
        }
      } catch (err) {
        if (!silent) {
          notify(
            err instanceof Error ? err.message : 'تعذرت المزامنة.',
            'error'
          );
        }
      } finally {
        setSyncing(false);
      }
    },
    [notify]
  );

  // Track connectivity and auto-sync when reconnecting
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void handleSync(true);
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [handleSync]);

  // Periodic background scheduler for due Facebook campaigns while app is open
  useEffect(() => {
    if (!ready) return;
    const checkDue = () => {
      void processDueCampaigns().then((res) => {
        if (res.processedCount > 0) {
          notify(`تم تنفيذ ${res.processedCount} خطوة حملة فيسبوك مستحقة تلقائياً.`);
        }
      });
    };
    checkDue();
    const timer = window.setInterval(checkDue, 60_000);
    return () => window.clearInterval(timer);
  }, [ready, notify]);

  const navigateTile = (tile: TileDef) => {
    if (tile.id === 'item-entry') setEditingItem(null);
    if (tile.id === 'account-entry') setEditingAccount(null);
    if (tile.id === 'receipt' || tile.id === 'payment') {
      setVoucherPreselectAccountId('');
    }
    if (tile.reportTab) {
      setReportInitialTab(tile.reportTab);
    }
    setScreen(tile.id);
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col">
      {/* Top Bar */}
      <header className="no-print sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900 shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setScreen('home')}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-800 px-3 py-2 text-sm font-bold transition hover:bg-neutral-700"
            >
              <Home className="h-4 w-4" />
              <span>الرئيسية</span>
            </button>
            <div className="flex items-center gap-2">
              <Anchor className="h-5 w-5 text-amber-400" />
              <div>
                <h1 className="text-sm font-extrabold tracking-wide sm:text-base text-white">
                  Fishing Master ERP
                </h1>
                <p className="hidden text-[11px] text-neutral-400 sm:block">
                  إدارة أدوات الصيد والرحلات البحرية • Offline-First
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Online/Offline Indicator */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
                isOnline
                  ? 'bg-emerald-900/50 text-emerald-300 ring-1 ring-emerald-700'
                  : 'bg-amber-900/50 text-amber-300 ring-1 ring-amber-700'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  <span>أونلاين</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span>أوفلاين (محلي)</span>
                </>
              )}
            </div>

            {/* Sync Queue Button */}
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSync(false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-800 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-neutral-700 transition hover:bg-neutral-700 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`}
              />
              <span>مزامنة</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  pendingCount > 0
                    ? 'bg-amber-500 text-neutral-900'
                    : 'bg-neutral-700 text-neutral-300'
                }`}
              >
                {pendingCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div className="no-print fixed bottom-5 left-5 z-50 max-w-sm">
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg ${
              toast.type === 'error' ? 'bg-rose-700' : 'bg-emerald-700'
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        {!ready ? (
          <div className="py-20 text-center text-neutral-400">
            جارٍ تهيئة قاعدة البيانات المحلية...
          </div>
        ) : screen === 'home' ? (
          <div className="space-y-5">
            {GROUPS.map((grp) => (
              <section
                key={grp.title}
                className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5"
              >
                <h2 className="mb-4 text-sm font-extrabold text-neutral-300 sm:text-base">
                  {grp.title}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {grp.tiles.map((tile) => {
                    const Icon = tile.icon;
                    return (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => navigateTile(tile)}
                        className="group flex flex-col items-start justify-between rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-right shadow-xs transition hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-md"
                      >
                        <div
                          className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-white ${tile.accent} transition group-hover:scale-105`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-neutral-100">
                            {tile.label}
                          </div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">
                            {tile.sub}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
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
            onEditItem={(it) => {
              setEditingItem(it);
              setScreen('item-entry');
            }}
            onNewItem={() => {
              setEditingItem(null);
              setScreen('item-entry');
            }}
          />
        ) : screen === 'item-entry' ? (
          <ItemEntryScreen
            key={editingItem?.id ?? 'new-item'}
            editingItem={editingItem}
            onDone={() => {
              setEditingItem(null);
              setScreen('items');
            }}
            onNotify={notify}
          />
        ) : screen === 'goods' ? (
          <GoodsOverviewScreen onGoToPurchase={() => setScreen('purchase')} />
        ) : screen === 'stock-count' ? (
          <StockCountAndSettlementScreen mode="COUNT" onNotify={notify} />
        ) : screen === 'stock-transfer' ? (
          <StockTransferScreen onNotify={notify} />
        ) : screen === 'stock-settlement' ? (
          <StockCountAndSettlementScreen mode="SETTLEMENT" onNotify={notify} />
        ) : screen === 'accounts' ? (
          <AccountsListScreen
            mode="ALL"
            onNewAccount={() => {
              setEditingAccount(null);
              setScreen('account-entry');
            }}
            onEditAccount={(acc) => {
              setEditingAccount(acc);
              setScreen('account-entry');
            }}
            onQuickVoucher={(type, accountId) => {
              setVoucherPreselectAccountId(accountId);
              setScreen(type === 'RECEIPT' ? 'receipt' : 'payment');
            }}
          />
        ) : screen === 'account-entry' ? (
          <AccountEntryScreen
            editingAccount={editingAccount}
            onDone={() => {
              setEditingAccount(null);
              setScreen('accounts');
            }}
            onNotify={notify}
          />
        ) : screen === 'suppliers' ? (
          <AccountsListScreen
            mode="SUPPLIER"
            onNewAccount={() => {
              setEditingAccount(null);
              setScreen('account-entry');
            }}
            onEditAccount={(acc) => {
              setEditingAccount(acc);
              setScreen('account-entry');
            }}
            onQuickVoucher={(type, accountId) => {
              setVoucherPreselectAccountId(accountId);
              setScreen(type === 'RECEIPT' ? 'receipt' : 'payment');
            }}
          />
        ) : screen === 'treasury' ? (
          <TreasuryScreen onNotify={notify} />
        ) : screen === 'receipt' ? (
          <VoucherFormScreen
            mode="RECEIPT"
            preselectedAccountId={voucherPreselectAccountId}
            onNotify={notify}
          />
        ) : screen === 'payment' ? (
          <VoucherFormScreen
            mode="PAYMENT"
            preselectedAccountId={voucherPreselectAccountId}
            onNotify={notify}
          />
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
