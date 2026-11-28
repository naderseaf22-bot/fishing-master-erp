import {
  Account,
  FishingTrip,
  Invoice,
  InvoiceLineItem,
  Item,
  StockAdjustmentLog,
  SyncQueueItem,
  Treasury,
  TreasuryVoucher,
  WarehouseStock,
  db,
  getTreasuryCatalog,
  lookupTreasuryName,
  lookupWarehouseName,
} from './db';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function getWarehouseName(id?: string): string {
  return lookupWarehouseName(id);
}

export function getTreasuryName(id?: string): string {
  return lookupTreasuryName(id);
}

async function enqueueSync(
  entity: SyncQueueItem['entity'],
  action: SyncQueueItem['action'],
  payload: unknown
) {
  await db.syncQueue.add({
    entity,
    action,
    payload,
    createdAt: nowIso(),
  });
}

async function adjustWarehouseStock(
  warehouseId: string,
  itemId: string,
  delta: number,
  requireAvailable = false
): Promise<number> {
  const stockId = `${warehouseId}_${itemId}`;
  const existing = await db.stocks.get(stockId);
  const currentQty = existing?.quantity ?? 0;
  const nextQty = round2(currentQty + delta);

  if (requireAvailable && nextQty < 0) {
    const item = await db.items.get(itemId);
    throw new Error(
      `الرصيد غير كافٍ في ${getWarehouseName(warehouseId)} للصنف "${item?.name ?? itemId}" (المتاح: ${currentQty})`
    );
  }

  await db.stocks.put({
    id: stockId,
    warehouseId,
    itemId,
    quantity: nextQty,
  });

  return nextQty;
}

export function computeTreasuryBalances(
  vouchers: TreasuryVoucher[],
  treasuries?: Array<Pick<Treasury, 'id'> & { openingBalance?: number }>
): Record<string, number> & { total: number } {
  const source = treasuries && treasuries.length > 0 ? treasuries : getTreasuryCatalog();
  const balances: Record<string, number> = {};
  for (const t of source) {
    balances[t.id] = round2(t.openingBalance ?? 0);
  }

  for (const v of vouchers) {
    if (v.type === 'RECEIPT') {
      balances[v.treasuryId] = round2((balances[v.treasuryId] ?? 0) + v.amount);
    } else if (v.type === 'PAYMENT') {
      balances[v.treasuryId] = round2((balances[v.treasuryId] ?? 0) - v.amount);
    } else if (v.type === 'TRANSFER') {
      balances[v.treasuryId] = round2((balances[v.treasuryId] ?? 0) - v.amount);
      if (v.targetTreasuryId) {
        balances[v.targetTreasuryId] = round2(
          (balances[v.targetTreasuryId] ?? 0) + v.amount
        );
      }
    }
  }

  const total = round2(
    Object.values(balances).reduce((acc, val) => acc + val, 0)
  );
  return { ...balances, total };
}

export interface CreateInvoiceInput {
  type: Invoice['type'];
  date?: string;
  accountId?: string;
  warehouseId: string;
  treasuryId: string;
  tripId?: string;
  paymentMethod: Invoice['paymentMethod'];
  items: Array<{
    itemId: string;
    qty: number;
    price: number;
    discount?: number;
  }>;
  discount?: number;
  paidAmount: number;
  notes?: string;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  if (input.items.length === 0) {
    throw new Error('يجب إضافة صنف واحد على الأقل للفاتورة.');
  }

  return db.transaction(
    'rw',
    [db.items, db.stocks, db.accounts, db.invoices, db.vouchers, db.syncQueue],
    async () => {
      const date = input.date ?? nowIso();
      const isOutflow =
        input.type === 'SALE' || input.type === 'PURCHASE_RETURN';
      const isSaleSide =
        input.type === 'SALE' || input.type === 'SALE_RETURN';

      const lineItems: InvoiceLineItem[] = [];
      let subtotal = 0;

      for (const raw of input.items) {
        if (raw.qty <= 0) {
          throw new Error('الكمية يجب أن تكون أكبر من صفر.');
        }

        const item = await db.items.get(raw.itemId);
        if (!item) {
          throw new Error(`الصنف غير موجود: ${raw.itemId}`);
        }

        const lineDiscount = round2(raw.discount ?? 0);
        const lineTotal = round2(raw.qty * raw.price - lineDiscount);
        if (lineTotal < 0) {
          throw new Error(`خصم الصنف "${item.name}" أكبر من قيمته.`);
        }

        const costAtTime = isSaleSide
          ? item.avgCost
          : round2(lineTotal / raw.qty);

        // Update weighted average cost on PURCHASE before adding stock
        if (input.type === 'PURCHASE') {
          const allItemStocks = await db.stocks
            .where('itemId')
            .equals(item.id)
            .toArray();
          const prevQty = Math.max(
            0,
            allItemStocks.reduce((sum, s) => sum + s.quantity, 0)
          );
          const nextAvg =
            prevQty + raw.qty > 0
              ? (prevQty * item.avgCost + lineTotal) / (prevQty + raw.qty)
              : costAtTime;

          await db.items.update(item.id, {
            avgCost: round2(nextAvg),
            lastPurchasePrice: round2(raw.price),
          });
        }

        const stockDelta = isOutflow ? -raw.qty : raw.qty;
        await adjustWarehouseStock(
          input.warehouseId,
          item.id,
          stockDelta,
          isOutflow
        );

        subtotal = round2(subtotal + lineTotal);
        lineItems.push({
          itemId: item.id,
          name: item.name,
          qty: raw.qty,
          price: round2(raw.price),
          costAtTime: round2(costAtTime),
          discount: lineDiscount,
          total: lineTotal,
        });
      }

      const invoiceDiscount = round2(input.discount ?? 0);
      const netTotal = round2(Math.max(0, subtotal - invoiceDiscount));
      const paidAmount = round2(Math.min(netTotal, Math.max(0, input.paidAmount)));
      const remainingAmount = round2(netTotal - paidAmount);

      if (remainingAmount > 0 && !input.accountId) {
        throw new Error('الفاتورة الآجلة أو المسددة جزئياً تتطلب اختيار عميل أو مورد.');
      }

      const prefixMap: Record<Invoice['type'], string> = {
        SALE: 'SAL',
        SALE_RETURN: 'SRT',
        PURCHASE: 'PUR',
        PURCHASE_RETURN: 'PRT',
      };
      const existingCount = await db.invoices.count();
      const invoiceNo = `${prefixMap[input.type]}-${String(existingCount + 1).padStart(4, '0')}`;

      const invoice: Invoice = {
        id: createId('INV'),
        invoiceNo,
        type: input.type,
        date,
        accountId: input.accountId,
        warehouseId: input.warehouseId,
        treasuryId: input.treasuryId,
        tripId: input.tripId,
        paymentMethod: input.paymentMethod,
        items: lineItems,
        subtotal,
        discount: invoiceDiscount,
        netTotal,
        paidAmount,
        remainingAmount,
        notes: input.notes,
        synced: false,
      };

      await db.invoices.add(invoice);

      // Update account balance with remaining credit/debit
      if (input.accountId && remainingAmount !== 0) {
        const account = await db.accounts.get(input.accountId);
        if (!account) {
          throw new Error('الحساب المحدد غير موجود.');
        }

        let balanceDelta = 0;
        if (input.type === 'SALE') balanceDelta = remainingAmount;
        else if (input.type === 'SALE_RETURN') balanceDelta = -remainingAmount;
        else if (input.type === 'PURCHASE') balanceDelta = -remainingAmount;
        else if (input.type === 'PURCHASE_RETURN') balanceDelta = remainingAmount;

        await db.accounts.update(account.id, {
          balance: round2(account.balance + balanceDelta),
        });
      }

      // Generate treasury voucher for the paid portion
      if (paidAmount > 0) {
        const voucherType: TreasuryVoucher['type'] =
          input.type === 'SALE' || input.type === 'PURCHASE_RETURN'
            ? 'RECEIPT'
            : 'PAYMENT';
        const vCount = await db.vouchers.count();
        const voucher: TreasuryVoucher = {
          id: createId('VCH'),
          voucherNo: `${voucherType === 'RECEIPT' ? 'RCV' : 'PAY'}-${String(vCount + 1).padStart(4, '0')}`,
          type: voucherType,
          date,
          treasuryId: input.treasuryId,
          accountId: input.accountId,
          tripId: input.tripId,
          amount: paidAmount,
          notes: `سداد فاتورة ${invoiceNo}`,
          synced: false,
        };
        await db.vouchers.add(voucher);
        await enqueueSync('VOUCHER', 'CREATE', voucher);
      }

      await enqueueSync('INVOICE', 'CREATE', invoice);
      return invoice;
    }
  );
}

export interface CreateVoucherInput {
  type: TreasuryVoucher['type'];
  date?: string;
  treasuryId: string;
  targetTreasuryId?: string;
  accountId?: string;
  tripId?: string;
  expenseCategory?: string;
  amount: number;
  notes: string;
}

export async function createVoucher(
  input: CreateVoucherInput
): Promise<TreasuryVoucher> {
  if (input.amount <= 0) {
    throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
  }
  if (input.type === 'TRANSFER') {
    if (!input.targetTreasuryId || input.targetTreasuryId === input.treasuryId) {
      throw new Error('يرجى اختيار خزينة محوّل إليها مختلفة.');
    }
  }

  return db.transaction(
    'rw',
    [db.vouchers, db.accounts, db.syncQueue],
    async () => {
      const count = await db.vouchers.count();
      const prefix =
        input.type === 'RECEIPT'
          ? 'RCV'
          : input.type === 'PAYMENT'
          ? 'PAY'
          : 'TRF';
      const voucher: TreasuryVoucher = {
        id: createId('VCH'),
        voucherNo: `${prefix}-${String(count + 1).padStart(4, '0')}`,
        type: input.type,
        date: input.date ?? nowIso(),
        treasuryId: input.treasuryId,
        targetTreasuryId: input.targetTreasuryId,
        accountId: input.accountId,
        tripId: input.tripId,
        expenseCategory: input.expenseCategory,
        amount: round2(input.amount),
        notes: input.notes,
        synced: false,
      };

      await db.vouchers.add(voucher);

      if (input.accountId && input.type !== 'TRANSFER') {
        const account = await db.accounts.get(input.accountId);
        if (account) {
          const delta =
            input.type === 'RECEIPT' ? -voucher.amount : voucher.amount;
          await db.accounts.update(account.id, {
            balance: round2(account.balance + delta),
          });
        }
      }

      await enqueueSync('VOUCHER', 'CREATE', voucher);
      return voucher;
    }
  );
}

export async function generateNextItemCodes(): Promise<{
  code: string;
  barcode: string;
}> {
  const all = await db.items.toArray();
  const codeSet = new Set(all.map((i) => i.code.trim()));
  const barcodeSet = new Set(all.map((i) => i.barcode.trim()));

  let maxNum = 100;
  for (const it of all) {
    const parsed = Number.parseInt(it.code, 10);
    if (Number.isFinite(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }

  let nextNum = maxNum + 1;
  while (codeSet.has(String(nextNum))) {
    nextNum += 1;
  }
  const code = String(nextNum);

  let barcodeNum = 900 + nextNum;
  let barcode = `622${String(barcodeNum).padStart(4, '0')}`;
  while (barcodeSet.has(barcode)) {
    barcodeNum += 1;
    barcode = `622${String(barcodeNum).padStart(4, '0')}`;
  }

  return { code, barcode };
}

export async function saveItem(
  itemData: Omit<Item, 'id'> & { id?: string },
  initialQtyMain = 0,
  initialQtySub = 0
): Promise<Item> {
  return db.transaction('rw', [db.items, db.stocks, db.syncQueue], async () => {
    const isNew = !itemData.id;
    const item: Item = {
      ...itemData,
      id: itemData.id ?? createId('IT'),
    };
    await db.items.put(item);

    if (isNew) {
      const stocks: WarehouseStock[] = [
        {
          id: `MAIN_WH_${item.id}`,
          warehouseId: 'MAIN_WH',
          itemId: item.id,
          quantity: initialQtyMain,
        },
        {
          id: `SUB_WH_${item.id}`,
          warehouseId: 'SUB_WH',
          itemId: item.id,
          quantity: initialQtySub,
        },
      ];
      await db.stocks.bulkPut(stocks);
    }

    await enqueueSync('ITEM', isNew ? 'CREATE' : 'UPDATE', item);
    return item;
  });
}

export async function saveAccount(
  accountData: Omit<Account, 'id'> & { id?: string }
): Promise<Account> {
  return db.transaction('rw', [db.accounts, db.syncQueue], async () => {
    const isNew = !accountData.id;
    const account: Account = {
      ...accountData,
      id: accountData.id ?? createId('ACC'),
    };
    await db.accounts.put(account);
    await enqueueSync('ACCOUNT', isNew ? 'CREATE' : 'UPDATE', account);
    return account;
  });
}

export async function transferStock(params: {
  fromWarehouseId: string;
  toWarehouseId: string;
  itemId: string;
  qty: number;
  notes?: string;
}): Promise<StockAdjustmentLog> {
  if (params.fromWarehouseId === params.toWarehouseId) {
    throw new Error('يجب أن يكون المخزن المحول إليه مختلفاً عن المخزن المصدر.');
  }
  if (params.qty <= 0) {
    throw new Error('الكمية المحولة يجب أن تكون أكبر من صفر.');
  }

  return db.transaction(
    'rw',
    [db.items, db.stocks, db.stockLogs, db.syncQueue],
    async () => {
      const item = await db.items.get(params.itemId);
      if (!item) throw new Error('الصنف غير موجود.');

      await adjustWarehouseStock(
        params.fromWarehouseId,
        params.itemId,
        -params.qty,
        true
      );
      await adjustWarehouseStock(
        params.toWarehouseId,
        params.itemId,
        params.qty,
        false
      );

      const log: StockAdjustmentLog = {
        id: createId('STK'),
        date: nowIso(),
        type: 'TRANSFER',
        fromWarehouseId: params.fromWarehouseId,
        toWarehouseId: params.toWarehouseId,
        itemId: item.id,
        itemName: item.name,
        qtyDiff: params.qty,
        costImpact: round2(params.qty * item.avgCost),
        notes:
          params.notes?.trim() ||
          `تحويل من ${getWarehouseName(params.fromWarehouseId)} إلى ${getWarehouseName(params.toWarehouseId)}`,
      };

      await db.stockLogs.add(log);
      await enqueueSync('STOCK_MOVE', 'CREATE', log);
      return log;
    }
  );
}

export async function settleStockCount(params: {
  warehouseId: string;
  itemId: string;
  actualQty: number;
  notes?: string;
}): Promise<StockAdjustmentLog> {
  if (params.actualQty < 0) {
    throw new Error('الكمية الفعلية لا يمكن أن تكون سالبة.');
  }

  return db.transaction(
    'rw',
    [db.items, db.stocks, db.stockLogs, db.syncQueue],
    async () => {
      const item = await db.items.get(params.itemId);
      if (!item) throw new Error('الصنف غير موجود.');

      const stockId = `${params.warehouseId}_${params.itemId}`;
      const existing = await db.stocks.get(stockId);
      const currentQty = existing?.quantity ?? 0;
      const qtyDiff = round2(params.actualQty - currentQty);

      await db.stocks.put({
        id: stockId,
        warehouseId: params.warehouseId,
        itemId: params.itemId,
        quantity: params.actualQty,
      });

      const log: StockAdjustmentLog = {
        id: createId('ADJ'),
        date: nowIso(),
        type: 'COUNT_SETTLEMENT',
        fromWarehouseId: params.warehouseId,
        itemId: item.id,
        itemName: item.name,
        qtyDiff,
        costImpact: round2(qtyDiff * item.avgCost),
        notes:
          params.notes?.trim() ||
          `تسوية جردية (${getWarehouseName(params.warehouseId)}): دفتري ${currentQty} -> فعلي ${params.actualQty}`,
      };

      await db.stockLogs.add(log);
      await enqueueSync('STOCK_MOVE', 'CREATE', log);
      return log;
    }
  );
}

export async function createTrip(input: {
  title: string;
  destination: string;
  boatName: string;
  startDate: string;
  status?: FishingTrip['status'];
  pricePerMember?: number;
  plannedMembersCount?: number;
  expectedTotal?: number;
}): Promise<FishingTrip> {
  return db.transaction('rw', [db.trips, db.syncQueue], async () => {
    const pricePerMember = round2(input.pricePerMember ?? 0);
    const plannedMembersCount = Math.max(0, Math.round(input.plannedMembersCount ?? 0));
    const expectedTotal = round2(
      input.expectedTotal ?? pricePerMember * plannedMembersCount
    );

    const trip: FishingTrip = {
      id: createId('TRP'),
      title: input.title,
      destination: input.destination,
      boatName: input.boatName,
      startDate: input.startDate,
      status: input.status ?? 'PLANNED',
      pricePerMember,
      plannedMembersCount,
      expectedTotal,
      members: [],
      gearUsed: [],
      expenses: [],
      synced: false,
    };
    await db.trips.add(trip);
    await enqueueSync('TRIP', 'CREATE', trip);
    return trip;
  });
}

export async function updateTripDetails(
  tripId: string,
  patch: {
    title: string;
    destination: string;
    boatName: string;
    startDate: string;
    status: FishingTrip['status'];
    pricePerMember?: number;
    plannedMembersCount?: number;
    expectedTotal?: number;
  }
): Promise<FishingTrip> {
  return db.transaction('rw', [db.trips, db.syncQueue], async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error('الرحلة غير موجودة.');
    const pricePerMember = round2(patch.pricePerMember ?? trip.pricePerMember ?? 0);
    const plannedMembersCount = Math.max(
      0,
      Math.round(patch.plannedMembersCount ?? trip.plannedMembersCount ?? 0)
    );
    const expectedTotal = round2(
      patch.expectedTotal ?? pricePerMember * plannedMembersCount
    );
    const updated: FishingTrip = {
      ...trip,
      title: patch.title.trim(),
      destination: patch.destination.trim(),
      boatName: patch.boatName.trim(),
      startDate: patch.startDate,
      status: patch.status,
      endDate:
        patch.status === 'COMPLETED'
          ? trip.endDate ?? nowIso().slice(0, 10)
          : trip.endDate,
      pricePerMember,
      plannedMembersCount,
      expectedTotal,
      synced: false,
    };
    await db.trips.put(updated);
    await enqueueSync('TRIP', 'UPDATE', updated);
    return updated;
  });
}

export async function getTripLinkedSummary(tripId: string) {
  const [trip, vouchers, invoices] = await Promise.all([
    db.trips.get(tripId),
    db.vouchers.where('tripId').equals(tripId).toArray(),
    db.invoices.filter((i) => i.tripId === tripId).toArray(),
  ]);
  const unreturnedGearUnits =
    trip?.gearUsed.reduce((s, g) => s + Math.max(0, g.qtyIssued - g.qtyReturned), 0) ??
    0;
  const membersWithDebt =
    trip?.members.filter((m) => m.remaining !== 0).length ?? 0;

  return {
    vouchersCount: vouchers.length,
    invoicesCount: invoices.length,
    unreturnedGearUnits,
    membersWithDebt,
  };
}

export async function deleteTrip(
  tripId: string,
  options: { rollbackMovements: boolean }
): Promise<void> {
  await db.transaction(
    'rw',
    [db.trips, db.vouchers, db.accounts, db.stocks, db.stockLogs, db.invoices, db.syncQueue],
    async () => {
      const trip = await db.trips.get(tripId);
      if (!trip) throw new Error('الرحلة غير موجودة.');

      const linkedVouchers = await db.vouchers.where('tripId').equals(tripId).toArray();
      const linkedInvoices = await db.invoices
        .filter((inv) => inv.tripId === tripId)
        .toArray();

      if (options.rollbackMovements) {
        // 1. Return unreturned gear back to warehouse stock
        for (const g of trip.gearUsed) {
          const unreturned = round2(g.qtyIssued - g.qtyReturned);
          if (unreturned > 0) {
            await adjustWarehouseStock(g.warehouseId, g.itemId, unreturned, false);
            await db.stockLogs.add({
              id: createId('STK'),
              date: nowIso(),
              type: 'TRANSFER',
              toWarehouseId: g.warehouseId,
              itemId: g.itemId,
              itemName: g.name,
              qtyDiff: unreturned,
              costImpact: round2(unreturned * g.unitCost),
              notes: `إرجاع تلقائي للمخزن بعد حذف رحلة: ${trip.title}`,
            });
          }
        }

        // 2. Reverse unpaid member balances added by this trip
        for (const m of trip.members) {
          if (m.remaining !== 0) {
            const acc = await db.accounts.get(m.accountId);
            if (acc) {
              await db.accounts.update(acc.id, {
                balance: round2(acc.balance - m.remaining),
              });
            }
          }
        }

        // 3. Remove treasury vouchers belonging to this trip
        if (linkedVouchers.length > 0) {
          await db.vouchers.bulkDelete(linkedVouchers.map((v) => v.id));
        }
      } else {
        // Unlink vouchers cleanly while preserving treasury balances
        for (const v of linkedVouchers) {
          await db.vouchers.update(v.id, {
            tripId: undefined,
            notes: `${v.notes} (رحلة محذوفة: ${trip.title})`,
          });
        }
      }

      for (const inv of linkedInvoices) {
        await db.invoices.update(inv.id, { tripId: undefined });
      }

      await db.trips.delete(tripId);
    }
  );
}

export async function updateTripStatus(
  tripId: string,
  status: FishingTrip['status']
): Promise<void> {
  await db.transaction('rw', [db.trips, db.syncQueue], async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error('الرحلة غير موجودة.');
    const updated: FishingTrip = {
      ...trip,
      status,
      endDate: status === 'COMPLETED' ? nowIso().slice(0, 10) : trip.endDate,
      synced: false,
    };
    await db.trips.put(updated);
    await enqueueSync('TRIP', 'UPDATE', updated);
  });
}

export async function addTripMember(params: {
  tripId: string;
  accountId?: string;
  newMember?: {
    name: string;
    phone?: string;
    type?: 'TRIP_MEMBER' | 'CUSTOMER';
  };
  fee: number;
  paid: number;
  treasuryId?: string;
}): Promise<void> {
  if (params.fee < 0 || params.paid < 0) {
    throw new Error('قيم الاشتراك والمدفوع يجب ألا تكون سالبة.');
  }

  await db.transaction(
    'rw',
    [db.trips, db.accounts, db.vouchers, db.syncQueue],
    async () => {
      const trip = await db.trips.get(params.tripId);
      if (!trip) throw new Error('الرحلة غير موجودة.');

      let account: Account | undefined;

      if (params.newMember) {
        const cleanName = params.newMember.name.trim();
        if (!cleanName) {
          throw new Error('يرجى إدخال اسم العضو الجديد.');
        }
        const allAccounts = await db.accounts.toArray();
        const code = `M-${String(allAccounts.length + 1).padStart(2, '0')}`;
        account = {
          id: createId('ACC'),
          code,
          name: cleanName,
          type: params.newMember.type ?? 'TRIP_MEMBER',
          phone: params.newMember.phone?.trim() ?? '',
          balance: 0,
          creditLimit: 5000,
        };
        await db.accounts.add(account);
        await enqueueSync('ACCOUNT', 'CREATE', account);
      } else if (params.accountId) {
        account = await db.accounts.get(params.accountId);
      }

      if (!account) throw new Error('حساب العضو غير موجود.');

      if (trip.members.some((m) => m.accountId === account!.id)) {
        throw new Error('هذا العضو مسجل بالفعل في الرحلة.');
      }

      const fee = round2(params.fee);
      const paid = round2(params.paid);
      const remaining = round2(fee - paid);

      const updated: FishingTrip = {
        ...trip,
        members: [
          ...trip.members,
          { accountId: account.id, name: account.name, fee, paid, remaining },
        ],
        synced: false,
      };
      await db.trips.put(updated);

      if (remaining !== 0) {
        await db.accounts.update(account.id, {
          balance: round2(account.balance + remaining),
        });
      }

      if (paid > 0) {
        const count = await db.vouchers.count();
        const voucher: TreasuryVoucher = {
          id: createId('VCH'),
          voucherNo: `RCV-${String(count + 1).padStart(4, '0')}`,
          type: 'RECEIPT',
          date: nowIso(),
          treasuryId: params.treasuryId ?? 'MAIN_TR',
          accountId: account.id,
          tripId: trip.id,
          amount: paid,
          notes: `اشتراك رحلة: ${trip.title} - ${account.name}`,
          synced: false,
        };
        await db.vouchers.add(voucher);
        await enqueueSync('VOUCHER', 'CREATE', voucher);
      }

      await enqueueSync('TRIP', 'UPDATE', updated);
    }
  );
}

export async function recordTripMemberPayment(params: {
  tripId: string;
  accountId: string;
  amount: number;
  treasuryId?: string;
}): Promise<void> {
  if (params.amount <= 0) throw new Error('قيمة السداد يجب أن تكون أكبر من صفر.');

  await db.transaction(
    'rw',
    [db.trips, db.accounts, db.vouchers, db.syncQueue],
    async () => {
      const trip = await db.trips.get(params.tripId);
      if (!trip) throw new Error('الرحلة غير موجودة.');

      const member = trip.members.find((m) => m.accountId === params.accountId);
      if (!member) throw new Error('العضو غير مسجل بهذه الرحلة.');

      const amount = round2(params.amount);
      const updatedMembers = trip.members.map((m) =>
        m.accountId === params.accountId
          ? {
              ...m,
              paid: round2(m.paid + amount),
              remaining: round2(m.remaining - amount),
            }
          : m
      );

      const updated: FishingTrip = { ...trip, members: updatedMembers, synced: false };
      await db.trips.put(updated);

      const account = await db.accounts.get(params.accountId);
      if (account) {
        await db.accounts.update(account.id, {
          balance: round2(account.balance - amount),
        });
      }

      const count = await db.vouchers.count();
      const voucher: TreasuryVoucher = {
        id: createId('VCH'),
        voucherNo: `RCV-${String(count + 1).padStart(4, '0')}`,
        type: 'RECEIPT',
        date: nowIso(),
        treasuryId: params.treasuryId ?? 'MAIN_TR',
        accountId: params.accountId,
        tripId: trip.id,
        amount,
        notes: `تحصيل متبقي اشتراك رحلة: ${trip.title} - ${member.name}`,
        synced: false,
      };
      await db.vouchers.add(voucher);
      await enqueueSync('VOUCHER', 'CREATE', voucher);
      await enqueueSync('TRIP', 'UPDATE', updated);
    }
  );
}

export async function issueTripGear(params: {
  tripId: string;
  itemId: string;
  warehouseId: string;
  qty: number;
}): Promise<void> {
  if (params.qty <= 0) throw new Error('الكمية المصروفة يجب أن تكون أكبر من صفر.');

  await db.transaction(
    'rw',
    [db.trips, db.items, db.stocks, db.stockLogs, db.syncQueue],
    async () => {
      const trip = await db.trips.get(params.tripId);
      if (!trip) throw new Error('الرحلة غير موجودة.');
      const item = await db.items.get(params.itemId);
      if (!item) throw new Error('الصنف غير موجود.');

      await adjustWarehouseStock(params.warehouseId, item.id, -params.qty, true);

      const existingIdx = trip.gearUsed.findIndex(
        (g) => g.itemId === item.id && g.warehouseId === params.warehouseId
      );
      const nextGear = [...trip.gearUsed];
      if (existingIdx >= 0) {
        nextGear[existingIdx] = {
          ...nextGear[existingIdx],
          qtyIssued: round2(nextGear[existingIdx].qtyIssued + params.qty),
        };
      } else {
        nextGear.push({
          itemId: item.id,
          name: item.name,
          warehouseId: params.warehouseId,
          qtyIssued: params.qty,
          qtyReturned: 0,
          unitCost: item.avgCost,
        });
      }

      const updated: FishingTrip = { ...trip, gearUsed: nextGear, synced: false };
      await db.trips.put(updated);

      const log: StockAdjustmentLog = {
        id: createId('STK'),
        date: nowIso(),
        type: 'TRANSFER',
        fromWarehouseId: params.warehouseId,
        itemId: item.id,
        itemName: item.name,
        qtyDiff: -params.qty,
        costImpact: round2(-params.qty * item.avgCost),
        notes: `صرف معدات/طعوم لرحلة: ${trip.title}`,
      };
      await db.stockLogs.add(log);
      await enqueueSync('STOCK_MOVE', 'CREATE', log);
      await enqueueSync('TRIP', 'UPDATE', updated);
    }
  );
}

export async function returnTripGear(params: {
  tripId: string;
  itemId: string;
  warehouseId: string;
  returnQty: number;
}): Promise<void> {
  if (params.returnQty <= 0) throw new Error('كمية الإرجاع يجب أن تكون أكبر من صفر.');

  await db.transaction(
    'rw',
    [db.trips, db.stocks, db.stockLogs, db.syncQueue],
    async () => {
      const trip = await db.trips.get(params.tripId);
      if (!trip) throw new Error('الرحلة غير موجودة.');

      const idx = trip.gearUsed.findIndex(
        (g) => g.itemId === params.itemId && g.warehouseId === params.warehouseId
      );
      if (idx < 0) throw new Error('هذا الصنف غير مصروف من هذا المخزن للرحلة.');

      const entry = trip.gearUsed[idx];
      const maxReturn = round2(entry.qtyIssued - entry.qtyReturned);
      if (params.returnQty > maxReturn) {
        throw new Error(`أقصى كمية يمكن إرجاعها هي ${maxReturn}.`);
      }

      await adjustWarehouseStock(
        params.warehouseId,
        params.itemId,
        params.returnQty,
        false
      );

      const nextGear = [...trip.gearUsed];
      nextGear[idx] = {
        ...entry,
        qtyReturned: round2(entry.qtyReturned + params.returnQty),
      };

      const updated: FishingTrip = { ...trip, gearUsed: nextGear, synced: false };
      await db.trips.put(updated);

      const log: StockAdjustmentLog = {
        id: createId('STK'),
        date: nowIso(),
        type: 'TRANSFER',
        toWarehouseId: params.warehouseId,
        itemId: entry.itemId,
        itemName: entry.name,
        qtyDiff: params.returnQty,
        costImpact: round2(params.returnQty * entry.unitCost),
        notes: `مرتجع معدات من رحلة: ${trip.title}`,
      };
      await db.stockLogs.add(log);
      await enqueueSync('STOCK_MOVE', 'CREATE', log);
      await enqueueSync('TRIP', 'UPDATE', updated);
    }
  );
}

export async function addTripExpense(params: {
  tripId: string;
  title: string;
  amount: number;
  treasuryId?: string;
}): Promise<void> {
  if (params.amount <= 0) throw new Error('قيمة المصروف يجب أن تكون أكبر من صفر.');

  await db.transaction(
    'rw',
    [db.trips, db.vouchers, db.syncQueue],
    async () => {
      const trip = await db.trips.get(params.tripId);
      if (!trip) throw new Error('الرحلة غير موجودة.');

      const date = nowIso();
      const count = await db.vouchers.count();
      const voucher: TreasuryVoucher = {
        id: createId('VCH'),
        voucherNo: `PAY-${String(count + 1).padStart(4, '0')}`,
        type: 'PAYMENT',
        date,
        treasuryId: params.treasuryId ?? 'MAIN_TR',
        tripId: trip.id,
        expenseCategory: 'مصروفات رحلات الصيد',
        amount: round2(params.amount),
        notes: `مصروف رحلة (${trip.title}): ${params.title}`,
        synced: false,
      };
      await db.vouchers.add(voucher);

      const updated: FishingTrip = {
        ...trip,
        expenses: [
          ...trip.expenses,
          {
            id: createId('EXP'),
            title: params.title,
            amount: round2(params.amount),
            voucherId: voucher.id,
            date,
          },
        ],
        synced: false,
      };
      await db.trips.put(updated);

      await enqueueSync('VOUCHER', 'CREATE', voucher);
      await enqueueSync('TRIP', 'UPDATE', updated);
    }
  );
}

export function computeTripFinancials(trip: FishingTrip) {
  const totalFees = round2(trip.members.reduce((s, m) => s + m.fee, 0));
  const totalCollected = round2(trip.members.reduce((s, m) => s + m.paid, 0));
  const totalRemaining = round2(trip.members.reduce((s, m) => s + m.remaining, 0));
  const gearCost = round2(
    trip.gearUsed.reduce(
      (s, g) => s + (g.qtyIssued - g.qtyReturned) * g.unitCost,
      0
    )
  );
  const cashExpenses = round2(trip.expenses.reduce((s, e) => s + e.amount, 0));
  const totalCost = round2(gearCost + cashExpenses);
  const netProfit = round2(totalFees - totalCost);
  const cashNet = round2(totalCollected - totalCost);

  return {
    totalFees,
    totalCollected,
    totalRemaining,
    gearCost,
    cashExpenses,
    totalCost,
    netProfit,
    cashNet,
  };
}

export async function runSync(): Promise<{ syncedCount: number; syncedAt: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('لا يوجد اتصال بالإنترنت حالياً. ستتم المزامنة تلقائياً عند العودة أونلاين.');
  }

  return db.transaction(
    'rw',
    [db.syncQueue, db.invoices, db.vouchers, db.trips],
    async () => {
      const queue = await db.syncQueue.toArray();
      if (queue.length === 0) {
        return { syncedCount: 0, syncedAt: nowIso() };
      }

      const unsyncedInvoices = await db.invoices
        .filter((inv) => !inv.synced)
        .toArray();
      for (const inv of unsyncedInvoices) {
        await db.invoices.update(inv.id, { synced: true });
      }

      const unsyncedVouchers = await db.vouchers
        .filter((v) => !v.synced)
        .toArray();
      for (const v of unsyncedVouchers) {
        await db.vouchers.update(v.id, { synced: true });
      }

      const unsyncedTrips = await db.trips
        .filter((t) => !t.synced)
        .toArray();
      for (const t of unsyncedTrips) {
        await db.trips.update(t.id, { synced: true });
      }

      await db.syncQueue.clear();
      return { syncedCount: queue.length, syncedAt: nowIso() };
    }
  );
}
