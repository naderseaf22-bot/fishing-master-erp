import Dexie, { Table } from 'dexie';

export const WAREHOUSES = [
  { id: 'MAIN_WH', name: 'المخزن الرئيسي' },
  { id: 'SUB_WH', name: 'مخزن الفرع / الرحلات' },
] as const;

export const TREASURIES = [
  { id: 'MAIN_TR', name: 'الخزينة الرئيسية' },
  { id: 'BANK_TR', name: 'حساب البنك / الشبكة' },
  { id: 'SUB_TR', name: 'عهدة الرحلات' },
] as const;

export interface Item {
  id: string;
  code: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  specs: string;
  unit: string;
  avgCost: number;
  lastPurchasePrice: number;
  salePrice: number;
  wholesalePrice?: number;
  minStock: number;
  expiryDate?: string;
  imageUrl?: string;
  description?: string;
}

export interface WarehouseStock {
  id: string; // `${warehouseId}_${itemId}`
  warehouseId: string;
  itemId: string;
  quantity: number;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'EXPENSE' | 'REVENUE' | 'TRIP_MEMBER';
  phone: string;
  balance: number; // موجب = مدين (عليه)، سالب = دائن (له)
  creditLimit?: number;
}

export interface InvoiceLineItem {
  itemId: string;
  name: string;
  qty: number;
  price: number;
  costAtTime: number;
  discount: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  type: 'SALE' | 'SALE_RETURN' | 'PURCHASE' | 'PURCHASE_RETURN';
  date: string;
  accountId?: string;
  warehouseId: string;
  treasuryId: string;
  tripId?: string;
  paymentMethod: 'CASH' | 'CARD' | 'CREDIT';
  items: InvoiceLineItem[];
  subtotal: number;
  discount: number;
  netTotal: number;
  paidAmount: number;
  remainingAmount: number;
  notes?: string;
  synced: boolean;
}

export interface TreasuryVoucher {
  id: string;
  voucherNo: string;
  type: 'RECEIPT' | 'PAYMENT' | 'TRANSFER';
  date: string;
  treasuryId: string;
  targetTreasuryId?: string;
  accountId?: string;
  tripId?: string;
  expenseCategory?: string;
  amount: number;
  notes: string;
  synced: boolean;
}

export interface StockAdjustmentLog {
  id: string;
  date: string;
  type: 'TRANSFER' | 'COUNT_SETTLEMENT';
  fromWarehouseId?: string;
  toWarehouseId?: string;
  itemId: string;
  itemName: string;
  qtyDiff: number;
  costImpact: number;
  notes: string;
}

export interface TripMember {
  accountId: string;
  name: string;
  fee: number;
  paid: number;
  remaining: number;
}

export interface TripGearUsage {
  itemId: string;
  name: string;
  warehouseId: string;
  qtyIssued: number;
  qtyReturned: number;
  unitCost: number;
}

export interface TripExpense {
  id: string;
  title: string;
  amount: number;
  voucherId?: string;
  date: string;
}

export interface FishingTrip {
  id: string;
  title: string;
  destination: string;
  boatName: string;
  startDate: string;
  endDate?: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  pricePerMember?: number;
  plannedMembersCount?: number;
  expectedTotal?: number;
  members: TripMember[];
  gearUsed: TripGearUsage[];
  expenses: TripExpense[];
  synced: boolean;
}

export interface SyncQueueItem {
  id?: number;
  entity: 'INVOICE' | 'VOUCHER' | 'STOCK_MOVE' | 'TRIP' | 'ITEM' | 'ACCOUNT' | 'FB_CAMPAIGN';
  action: 'CREATE' | 'UPDATE';
  payload: unknown;
  createdAt: string;
}

export interface FacebookCampaign {
  id: string;
  name: string;
  intervalHours: number;
  repeatLoop: boolean;
  isActive: boolean;
  currentIndex: number;
  lastPostedAt?: string;
  itemIds: string[];
}

export interface Treasury {
  id: string;
  name: string;
  openingBalance: number;
  isActive: boolean;
}

export interface CategoryDef {
  id: string;
  name: string;
}

export interface WarehouseDef {
  id: string;
  name: string;
  isActive: boolean;
}

const treasuryNameCache = new Map<string, string>(TREASURIES.map((t) => [t.id, t.name]));
const warehouseNameCache = new Map<string, string>(WAREHOUSES.map((w) => [w.id, w.name]));

let treasuryCatalog: Treasury[] = TREASURIES.map((t) => ({
  id: t.id,
  name: t.name,
  openingBalance: 0,
  isActive: true,
}));

export function syncTreasuryCatalog(rows: Treasury[]) {
  if (!rows.length) return;
  treasuryCatalog = rows;
  for (const t of rows) treasuryNameCache.set(t.id, t.name);
}

export function syncWarehouseCatalog(rows: WarehouseDef[]) {
  if (!rows.length) return;
  for (const w of rows) warehouseNameCache.set(w.id, w.name);
}

export function getTreasuryCatalog(): Treasury[] {
  return treasuryCatalog;
}

export function lookupTreasuryName(id?: string): string {
  if (!id) return '—';
  return treasuryNameCache.get(id) ?? id;
}

export function lookupWarehouseName(id?: string): string {
  if (!id) return '—';
  return warehouseNameCache.get(id) ?? id;
}

export interface FacebookLog {
  id: string;
  date: string;
  type: 'POST' | 'CAMPAIGN_STEP' | 'AI_REPLY';
  campaignId?: string;
  itemId?: string;
  itemName?: string;
  status: 'PUBLISHED' | 'SIMULATED' | 'FAILED';
  message: string;
  externalPostId?: string;
}

class FishingMasterERP extends Dexie {
  items!: Table<Item>;
  stocks!: Table<WarehouseStock>;
  accounts!: Table<Account>;
  invoices!: Table<Invoice>;
  vouchers!: Table<TreasuryVoucher>;
  stockLogs!: Table<StockAdjustmentLog>;
  trips!: Table<FishingTrip>;
  syncQueue!: Table<SyncQueueItem>;
  fbCampaigns!: Table<FacebookCampaign>;
  fbLogs!: Table<FacebookLog>;
  treasuries!: Table<Treasury>;
  categories!: Table<CategoryDef>;
  warehouses!: Table<WarehouseDef>;

  constructor() {
    super('FishingMasterERP_Complete_DB');
    this.version(1).stores({
      items: 'id, code, barcode, name, category',
      stocks: 'id, warehouseId, itemId',
      accounts: 'id, code, name, type, phone',
      invoices: 'id, invoiceNo, type, date, accountId',
      vouchers: 'id, voucherNo, type, date, treasuryId, accountId, tripId',
      stockLogs: 'id, date, type, itemId',
      trips: 'id, title, startDate, status',
      syncQueue: '++id, entity, createdAt',
    });
    this.version(2).stores({
      fbCampaigns: 'id, name, isActive, lastPostedAt',
      fbLogs: 'id, date, type, campaignId, itemId',
    });
    this.version(3).stores({
      treasuries: 'id, name, isActive',
    });
    this.version(4).stores({
      categories: 'id, name',
      warehouses: 'id, name, isActive',
    });
  }
}

export const db = new FishingMasterERP();

function isoDaysOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function ensureCatalog() {
  if ((await db.treasuries.count()) === 0) {
    await db.treasuries.bulkPut(
      TREASURIES.map((t) => ({
        id: t.id,
        name: t.name,
        openingBalance: 0,
        isActive: true,
      }))
    );
  }

  if ((await db.warehouses.count()) === 0) {
    await db.warehouses.bulkPut(
      WAREHOUSES.map((w) => ({
        id: w.id,
        name: w.name,
        isActive: true,
      }))
    );
  }

  if ((await db.categories.count()) === 0) {
    const items = await db.items.toArray();
    const names = Array.from(new Set(items.map((it) => it.category.trim()).filter(Boolean)));
    const fallback = ['خيوط', 'ماكينات', 'قصبات', 'سنار', 'طعوم'];
    const source = names.length > 0 ? names : fallback;
    await db.categories.bulkPut(
      source.map((name) => ({
        id: `CAT-${name.replace(/\s+/g, '-').slice(0, 24)}`,
        name,
      }))
    );
  }

  syncTreasuryCatalog(await db.treasuries.toArray());
  syncWarehouseCatalog(await db.warehouses.toArray());
}

export async function seedInitialData() {
  const count = await db.items.count();
  if (count > 0) {
    await ensureCatalog();
    return;
  }

  const today = isoDaysOffset(0);
  const yesterday = isoDaysOffset(-1);

  const initialItems: Item[] = [
    {
      id: 'IT-1',
      code: '101',
      barcode: '6221001',
      name: 'خيط ضفيرة سوفيكس 120 متر',
      category: 'خيوط',
      brand: 'Sufix',
      specs: '0.30mm / 25kg',
      unit: 'بكرة',
      avgCost: 90,
      lastPurchasePrice: 95,
      salePrice: 140,
      wholesalePrice: 120,
      minStock: 10,
      description: 'خيط ضفيرة 8 جدلات عالي التحمل ومقاوم للاحتكاك في المياه المالحة، مثالي للجيجينج والكاستنج.',
    },
    {
      id: 'IT-2',
      code: '102',
      barcode: '6221002',
      name: 'مكنة صيد بحري مقاس 6000',
      category: 'ماكينات',
      brand: 'Shimano',
      specs: '6000 Spinning',
      unit: 'قطعة',
      avgCost: 650,
      lastPurchasePrice: 670,
      salePrice: 920,
      wholesalePrice: 830,
      minStock: 4,
      description: 'ماكينة سبيننج بحرية مقاومة للملوحة بسعة سحب عالية وتروس دقيقة للصيد الثقيل من الشاطئ أو المركب.',
    },
    {
      id: 'IT-3',
      code: '103',
      barcode: '6221003',
      name: 'قصبة كربون 3.6 متر',
      category: 'قصبات',
      brand: 'Daiwa',
      specs: '3.6m / Heavy',
      unit: 'قطعة',
      avgCost: 420,
      lastPurchasePrice: 420,
      salePrice: 630,
      wholesalePrice: 560,
      minStock: 5,
      description: 'قصبة كربون خفيفة الوزن وعالية المرونة مع حلقات سيراميك مانعة للتشابك للرمي البعيد.',
    },
    {
      id: 'IT-4',
      code: '104',
      barcode: '6221004',
      name: 'طقم سنار ياباني مقاس 8',
      category: 'سنار',
      brand: 'Owner',
      specs: 'Size 8 / 20pcs',
      unit: 'علبة',
      avgCost: 35,
      lastPurchasePrice: 35,
      salePrice: 60,
      wholesalePrice: 50,
      minStock: 15,
      description: 'سنار ياباني حاد جداً مطلي ضد الصدأ بزاوية تعليق سريعة لأسماك الشعور والمرجان والدنيس.',
    },
    {
      id: 'IT-5',
      code: '105',
      barcode: '6221005',
      name: 'طُعم صناعي جيجينج 80 جرام',
      category: 'طعوم',
      brand: 'Rapala',
      specs: '80g / Glow',
      unit: 'قطعة',
      avgCost: 55,
      lastPurchasePrice: 60,
      salePrice: 95,
      wholesalePrice: 80,
      minStock: 12,
      description: 'طعم جيجينج مضيء في الأعماق (Glow) بحركة اهتزاز طبيعية لجذب الأسماك المفترسة.',
    },
    {
      id: 'IT-6',
      code: '106',
      barcode: '6221006',
      name: 'طعم حبار مجمد ممتاز 500 جم',
      category: 'طعوم',
      brand: 'RedSea Bait',
      specs: '500g / Fresh Frozen',
      unit: 'عبوة',
      avgCost: 45,
      lastPurchasePrice: 45,
      salePrice: 75,
      wholesalePrice: 65,
      minStock: 10,
      expiryDate: isoDaysOffset(14),
      description: 'حبار طازج مجمد بتفريغ هواء جاهز للتسقيط والجر البحري طوال الرحلة.',
    },
  ];

  const initialAccounts: Account[] = [
    { id: 'ACC-1', code: 'C-01', name: 'كابتن محمود البحري', type: 'CUSTOMER', phone: '01000000001', balance: 450, creditLimit: 5000 },
    { id: 'ACC-2', code: 'M-01', name: 'أحمد صياد النيل', type: 'TRIP_MEMBER', phone: '01000000002', balance: 300, creditLimit: 3000 },
    { id: 'ACC-3', code: 'S-01', name: 'شركة المعدات البحرية الدولية', type: 'SUPPLIER', phone: '01000000003', balance: -2400, creditLimit: 0 },
    { id: 'ACC-4', code: 'S-02', name: 'مؤسسة الطعوم والخيوط', type: 'SUPPLIER', phone: '01000000004', balance: 0, creditLimit: 0 },
    { id: 'ACC-5', code: 'M-02', name: 'خالد القبطان', type: 'TRIP_MEMBER', phone: '01000000005', balance: 0, creditLimit: 3000 },
    { id: 'ACC-6', code: 'E-01', name: 'مصروفات تشغيل وإيجار مراكب', type: 'EXPENSE', phone: '', balance: 0 },
  ];

  const initialVouchers: TreasuryVoucher[] = [
    {
      id: 'VCH-SEED-1',
      voucherNo: 'RCV-0001',
      type: 'RECEIPT',
      date: `${yesterday}T09:00:00`,
      treasuryId: 'MAIN_TR',
      amount: 25000,
      notes: 'رصيد افتتاحي للخزينة الرئيسية',
      synced: true,
    },
    {
      id: 'VCH-SEED-2',
      voucherNo: 'RCV-0002',
      type: 'RECEIPT',
      date: `${today}T10:30:00`,
      treasuryId: 'MAIN_TR',
      accountId: 'ACC-2',
      tripId: 'TRP-SEED-1',
      amount: 1200,
      notes: 'دفعة اشتراك رحلة العين السخنة - أحمد صياد النيل',
      synced: true,
    },
    {
      id: 'VCH-SEED-3',
      voucherNo: 'PAY-0001',
      type: 'PAYMENT',
      date: `${today}T11:00:00`,
      treasuryId: 'MAIN_TR',
      tripId: 'TRP-SEED-1',
      expenseCategory: 'إيجار مركب ووقود',
      amount: 1800,
      notes: 'عربون حجز مركب الصياد الذهبي + ثلج',
      synced: true,
    },
  ];

  const initialInvoices: Invoice[] = [
    {
      id: 'INV-SEED-1',
      invoiceNo: 'SAL-0001',
      type: 'SALE',
      date: `${today}T11:30:00`,
      accountId: 'ACC-1',
      warehouseId: 'MAIN_WH',
      treasuryId: 'MAIN_TR',
      paymentMethod: 'CASH',
      items: [
        { itemId: 'IT-2', name: 'مكنة صيد بحري مقاس 6000', qty: 1, price: 920, costAtTime: 650, discount: 0, total: 920 },
        { itemId: 'IT-1', name: 'خيط ضفيرة سوفيكس 120 متر', qty: 2, price: 140, costAtTime: 90, discount: 0, total: 280 },
      ],
      subtotal: 1200,
      discount: 0,
      netTotal: 1200,
      paidAmount: 1200,
      remainingAmount: 0,
      synced: true,
    },
  ];

  const initialTrips: FishingTrip[] = [
    {
      id: 'TRP-SEED-1',
      title: 'رحلة الجيجينج والتسقيط - العين السخنة',
      destination: 'العين السخنة - منطقة الجلالة',
      boatName: 'مركب الصياد الذهبي',
      startDate: today,
      status: 'ACTIVE',
      pricePerMember: 1500,
      plannedMembersCount: 2,
      expectedTotal: 3000,
      members: [
        { accountId: 'ACC-2', name: 'أحمد صياد النيل', fee: 1500, paid: 1200, remaining: 300 },
        { accountId: 'ACC-5', name: 'خالد القبطان', fee: 1500, paid: 1500, remaining: 0 },
      ],
      gearUsed: [
        { itemId: 'IT-5', name: 'طُعم صناعي جيجينج 80 جرام', warehouseId: 'SUB_WH', qtyIssued: 6, qtyReturned: 2, unitCost: 55 },
        { itemId: 'IT-6', name: 'طعم حبار مجمد ممتاز 500 جم', warehouseId: 'SUB_WH', qtyIssued: 4, qtyReturned: 0, unitCost: 45 },
      ],
      expenses: [
        { id: 'EXP-SEED-1', title: 'عربون حجز مركب الصياد الذهبي + ثلج', amount: 1800, voucherId: 'VCH-SEED-3', date: `${today}T11:00:00` },
      ],
      synced: true,
    },
  ];

  await db.transaction(
    'rw',
    [db.items, db.stocks, db.accounts, db.vouchers, db.invoices, db.trips, db.treasuries],
    async () => {
      await db.items.bulkPut(initialItems);

      const stockRows: WarehouseStock[] = initialItems.flatMap((it) => [
        { id: `MAIN_WH_${it.id}`, warehouseId: 'MAIN_WH', itemId: it.id, quantity: 25 },
        { id: `SUB_WH_${it.id}`, warehouseId: 'SUB_WH', itemId: it.id, quantity: 8 },
      ]);
      await db.stocks.bulkPut(stockRows);
      await db.accounts.bulkPut(initialAccounts);
      await db.vouchers.bulkPut(initialVouchers);
      await db.invoices.bulkPut(initialInvoices);
      await db.trips.bulkPut(initialTrips);

      // Seed default treasuries into the new table
      const defaultTreasuries: Treasury[] = TREASURIES.map((t) => ({
        id: t.id,
        name: t.name,
        openingBalance: 0,
        isActive: true,
      }));
      await db.treasuries.bulkPut(defaultTreasuries);
    }
  );

  await ensureCatalog();
}
