import { FacebookCampaign, FacebookLog, Item, db } from './db';
import { createId, nowIso } from './erpEngine';

const SETTINGS_STORAGE_KEY = 'fishing_master_fb_settings_v1';

export interface FacebookSettings {
  pageId: string;
  pageToken: string;
  cloudWebhookUrl?: string;
  cloudCronEnabled?: boolean;
}

export function getFacebookSettings(): FacebookSettings {
  if (typeof window === 'undefined') {
    return { pageId: '', pageToken: '', cloudWebhookUrl: '', cloudCronEnabled: false };
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { pageId: '', pageToken: '', cloudWebhookUrl: '', cloudCronEnabled: false };
    }
    const parsed = JSON.parse(raw) as Partial<FacebookSettings>;
    return {
      pageId: parsed.pageId ?? '',
      pageToken: parsed.pageToken ?? '',
      cloudWebhookUrl: parsed.cloudWebhookUrl ?? '',
      cloudCronEnabled: Boolean(parsed.cloudCronEnabled),
    };
  } catch {
    return { pageId: '', pageToken: '', cloudWebhookUrl: '', cloudCronEnabled: false };
  }
}

export function saveFacebookSettings(settings: FacebookSettings): FacebookSettings {
  const clean: FacebookSettings = {
    pageId: settings.pageId.trim(),
    pageToken: settings.pageToken.trim(),
    cloudWebhookUrl: settings.cloudWebhookUrl?.trim() ?? '',
    cloudCronEnabled: Boolean(settings.cloudCronEnabled),
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(clean));
  }
  return clean;
}

export function formatItemPostCaption(item: Item): string {
  const lines = [
    `🎣 ${item.name}`,
    item.brand ? `🏷️ الماركة: ${item.brand} | التصنيف: ${item.category}` : `📦 التصنيف: ${item.category}`,
    item.specs ? `⚙️ المواصفات: ${item.specs}` : '',
    item.description ? `📝 ${item.description}` : '',
    `💰 السعر: ${item.salePrice.toLocaleString('ar-EG')} ج.م / ${item.unit}`,
    `🔖 كود الصنف: ${item.code}`,
    `📩 للطلب أو الاستفسار راسلنا الآن على الصفحة!`,
  ].filter(Boolean);
  return lines.join('\n');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function shareItemToFacebook(
  itemId: string,
  options?: { campaignId?: string; logType?: FacebookLog['type'] }
): Promise<FacebookLog> {
  const item = await db.items.get(itemId);
  if (!item) {
    throw new Error(`الصنف غير موجود: ${itemId}`);
  }

  const settings = getFacebookSettings();
  const caption = formatItemPostCaption(item);
  const logType = options?.logType ?? 'POST';

  // If credentials are missing or offline, record a clear local simulation/offline log
  if (!settings.pageId || !settings.pageToken) {
    const simLog: FacebookLog = {
      id: createId('FBL'),
      date: nowIso(),
      type: logType,
      campaignId: options?.campaignId,
      itemId: item.id,
      itemName: item.name,
      status: 'SIMULATED',
      message: `معاينة نشر محلية (بدون Page Token): ${item.name} — ${item.salePrice} ج.م/${item.unit}`,
    };
    await db.fbLogs.add(simLog);
    return simLog;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineLog: FacebookLog = {
      id: createId('FBL'),
      date: nowIso(),
      type: logType,
      campaignId: options?.campaignId,
      itemId: item.id,
      itemName: item.name,
      status: 'FAILED',
      message: `تعذر النشر الفعلي لعدم توفر الإنترنت (أوفلاين): ${item.name}`,
    };
    await db.fbLogs.add(offlineLog);
    throw new Error(offlineLog.message);
  }

  try {
    let response: Response;
    const baseUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(settings.pageId)}`;

    if (item.imageUrl && /^https?:\/\//i.test(item.imageUrl)) {
      const body = new URLSearchParams({
        url: item.imageUrl,
        caption,
        access_token: settings.pageToken,
      });
      response = await fetch(`${baseUrl}/photos`, { method: 'POST', body });
    } else if (item.imageUrl && item.imageUrl.startsWith('data:image/')) {
      const form = new FormData();
      form.append('source', dataUrlToBlob(item.imageUrl), `${item.code}.png`);
      form.append('caption', caption);
      form.append('access_token', settings.pageToken);
      response = await fetch(`${baseUrl}/photos`, { method: 'POST', body: form });
    } else {
      const body = new URLSearchParams({
        message: caption,
        access_token: settings.pageToken,
      });
      response = await fetch(`${baseUrl}/feed`, { method: 'POST', body });
    }

    const json = (await response.json()) as {
      id?: string;
      post_id?: string;
      error?: { message?: string };
    };

    if (!response.ok || json.error) {
      const errMsg = json.error?.message || `HTTP ${response.status}`;
      const failLog: FacebookLog = {
        id: createId('FBL'),
        date: nowIso(),
        type: logType,
        campaignId: options?.campaignId,
        itemId: item.id,
        itemName: item.name,
        status: 'FAILED',
        message: `فشل النشر على فيسبوك: ${errMsg}`,
      };
      await db.fbLogs.add(failLog);
      throw new Error(failLog.message);
    }

    const okLog: FacebookLog = {
      id: createId('FBL'),
      date: nowIso(),
      type: logType,
      campaignId: options?.campaignId,
      itemId: item.id,
      itemName: item.name,
      status: 'PUBLISHED',
      externalPostId: json.post_id ?? json.id,
      message: `تم النشر بنجاح على صفحة فيسبوك: ${item.name}`,
    };
    await db.fbLogs.add(okLog);
    return okLog;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('فشل النشر')) {
      throw err;
    }
    const errText = err instanceof Error ? err.message : 'خطأ في الاتصال بواجهة Meta';
    const failLog: FacebookLog = {
      id: createId('FBL'),
      date: nowIso(),
      type: logType,
      campaignId: options?.campaignId,
      itemId: item.id,
      itemName: item.name,
      status: 'FAILED',
      message: `تعذر الاتصال بـ Graph API: ${errText}`,
    };
    await db.fbLogs.add(failLog);
    throw new Error(failLog.message);
  }
}

export async function createFacebookCampaign(input: {
  name: string;
  intervalHours: number;
  repeatLoop: boolean;
  itemIds: string[];
  isActive?: boolean;
}): Promise<FacebookCampaign> {
  if (!input.name.trim()) throw new Error('يرجى إدخال اسم الحملة.');
  if (input.itemIds.length === 0) throw new Error('اختر صنفاً واحداً على الأقل في الحملة.');

  const campaign: FacebookCampaign = {
    id: createId('FBC'),
    name: input.name.trim(),
    intervalHours: Math.max(0.1, Number(input.intervalHours) || 2),
    repeatLoop: input.repeatLoop,
    isActive: input.isActive ?? true,
    currentIndex: 0,
    itemIds: input.itemIds,
  };

  await db.transaction('rw', [db.fbCampaigns, db.syncQueue], async () => {
    await db.fbCampaigns.add(campaign);
    await db.syncQueue.add({
      entity: 'FB_CAMPAIGN',
      action: 'CREATE',
      payload: campaign,
      createdAt: nowIso(),
    });
  });

  return campaign;
}

export async function updateFacebookCampaign(
  id: string,
  patch: Partial<FacebookCampaign>
): Promise<void> {
  await db.transaction('rw', [db.fbCampaigns, db.syncQueue], async () => {
    const existing = await db.fbCampaigns.get(id);
    if (!existing) throw new Error('الحملة غير موجودة.');
    const updated: FacebookCampaign = { ...existing, ...patch };
    await db.fbCampaigns.put(updated);
    await db.syncQueue.add({
      entity: 'FB_CAMPAIGN',
      action: 'UPDATE',
      payload: updated,
      createdAt: nowIso(),
    });
  });
}

export async function deleteFacebookCampaign(id: string): Promise<void> {
  await db.fbCampaigns.delete(id);
}

export async function runCampaignStep(
  campaignId: string
): Promise<{ log: FacebookLog; campaign: FacebookCampaign }> {
  const campaign = await db.fbCampaigns.get(campaignId);
  if (!campaign) throw new Error('الحملة غير موجودة.');
  if (campaign.itemIds.length === 0) {
    throw new Error('الحملة لا تحتوي على أصناف.');
  }

  const safeIdx =
    campaign.currentIndex >= 0 && campaign.currentIndex < campaign.itemIds.length
      ? campaign.currentIndex
      : 0;
  const targetItemId = campaign.itemIds[safeIdx];

  const log = await shareItemToFacebook(targetItemId, {
    campaignId: campaign.id,
    logType: 'CAMPAIGN_STEP',
  });

  let nextIndex = safeIdx + 1;
  let nextActive = campaign.isActive;
  if (nextIndex >= campaign.itemIds.length) {
    if (campaign.repeatLoop) {
      nextIndex = 0;
    } else {
      nextIndex = campaign.itemIds.length;
      nextActive = false;
    }
  }

  const updated: FacebookCampaign = {
    ...campaign,
    currentIndex: nextIndex,
    isActive: nextActive,
    lastPostedAt: nowIso(),
  };

  await db.fbCampaigns.put(updated);
  return { log, campaign: updated };
}

export async function processDueCampaigns(): Promise<{
  processedCount: number;
  logs: FacebookLog[];
}> {
  const campaigns = await db.fbCampaigns.toArray();
  const nowMs = Date.now();
  const logs: FacebookLog[] = [];

  for (const camp of campaigns) {
    if (!camp.isActive || camp.itemIds.length === 0) continue;
    const intervalMs = Math.max(0.1, camp.intervalHours) * 3600 * 1000;
    const lastMs = camp.lastPostedAt ? Date.parse(camp.lastPostedAt) : 0;
    const isDue = !camp.lastPostedAt || Number.isNaN(lastMs) || nowMs - lastMs >= intervalMs;

    if (!isDue) continue;
    try {
      const res = await runCampaignStep(camp.id);
      logs.push(res.log);
    } catch {
      // Errors are already logged in db.fbLogs by shareItemToFacebook
    }
  }

  return { processedCount: logs.length, logs };
}

function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'بكام',
  'بكم',
  'سعر',
  'كم',
  'كام',
  'عندكم',
  'متوفر',
  'موجود',
  'عايز',
  'اريد',
  'تفاصيل',
  'مواصفات',
  'عن',
  'في',
  'من',
  'لو',
  'سمحت',
  'ممكن',
  'ايه',
  'ما',
  'هو',
  'هي',
]);

export interface AiAgentResult {
  reply: string;
  matchedItems: Array<{ item: Item; stockQty: number; score: number }>;
}

export async function askFishingAiAgent(
  question: string
): Promise<AiAgentResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      reply: 'اكتب سؤالك عن أي صنف من أدوات الصيد وسأرد عليك بالسعر والمواصفات والتفاصيل المتاحة.',
      matchedItems: [],
    };
  }

  const [items, stocks] = await Promise.all([
    db.items.toArray(),
    db.stocks.toArray(),
  ]);

  const stockByItem = new Map<string, number>();
  for (const s of stocks) {
    stockByItem.set(s.itemId, (stockByItem.get(s.itemId) ?? 0) + s.quantity);
  }

  const normalizedQ = normalizeArabic(trimmed);
  const rawTokens = normalizedQ
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  const tokens = rawTokens.map((t) => (t.startsWith('ال') && t.length > 3 ? t.slice(2) : t));

  const scored = items
    .map((item) => {
      const hayName = normalizeArabic(item.name);
      const hayMeta = normalizeArabic(
        `${item.category} ${item.brand} ${item.specs} ${item.description ?? ''} ${item.code} ${item.barcode}`
      );
      let score = 0;

      if (normalizedQ.includes(hayName)) score += 12;
      for (const tok of tokens) {
        if (hayName.includes(tok)) score += 5;
        else if (hayMeta.includes(tok)) score += 2;
      }

      return {
        item,
        stockQty: stockByItem.get(item.id) ?? 0,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  let reply: string;
  const topMatches = scored.slice(0, 3);

  if (topMatches.length > 0) {
    const primary = topMatches[0];
    const parts = [
      `أهلاً بك في Fishing Master! 🎣`,
      `بخصوص "${primary.item.name}" (${primary.item.brand || primary.item.category}):`,
      `• السعر: ${primary.item.salePrice.toLocaleString('ar-EG')} ج.م لكل ${primary.item.unit}`,
      primary.item.specs ? `• المواصفات: ${primary.item.specs}` : '',
      primary.item.description ? `• التفاصيل: ${primary.item.description}` : '',
      `• التوفر بالمخزن: ${primary.stockQty > 0 ? `متوفر (${primary.stockQty} ${primary.item.unit})` : 'نفد حالياً — تواصل للحجز'}`,
    ].filter(Boolean);

    if (topMatches.length > 1) {
      const others = topMatches
        .slice(1)
        .map(
          (m) =>
            `- ${m.item.name}: ${m.item.salePrice.toLocaleString('ar-EG')} ج.م / ${m.item.unit}`
        )
        .join('\n');
      parts.push(`كما يتوفر لدينا خيارات قريبة:\n${others}`);
    }
    reply = parts.join('\n');
  } else {
    const catalogPreview = items
      .slice(0, 4)
      .map(
        (it) =>
          `• ${it.name}: ${it.salePrice.toLocaleString('ar-EG')} ج.م / ${it.unit}`
      )
      .join('\n');
    reply = `أهلاً بك في Fishing Master! 🎣 لم أجد صنفاً مطابقاً تماماً لعبارة "${trimmed}"، لكن إليك أبرز الأصناف المتاحة لدينا:\n${catalogPreview}\nأخبرني باسم الصنف أو كوده وسأزودك بالتفاصيل فوراً.`;
  }

  await db.fbLogs.add({
    id: createId('FBL'),
    date: nowIso(),
    type: 'AI_REPLY',
    itemId: topMatches[0]?.item.id,
    itemName: topMatches[0]?.item.name,
    status: 'SIMULATED',
    message: `سؤال: "${trimmed}" ← رد AI: ${reply.slice(0, 140)}...`,
  });

  return { reply, matchedItems: topMatches };
}

export async function buildCloudCronManifest() {
  const [campaigns, items] = await Promise.all([
    db.fbCampaigns.toArray(),
    db.items.toArray(),
  ]);
  const settings = getFacebookSettings();
  return {
    generatedAt: nowIso(),
    providerTarget: 'Cloudflare Worker Cron / Vercel Cron / Node Webhook',
    scheduleRecommendation: '*/15 * * * *',
    facebookPageId: settings.pageId || '<PAGE_ID>',
    hasTokenConfigured: Boolean(settings.pageToken),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      intervalHours: c.intervalHours,
      repeatLoop: c.repeatLoop,
      isActive: c.isActive,
      currentIndex: c.currentIndex,
      lastPostedAt: c.lastPostedAt,
      itemIds: c.itemIds,
    })),
    itemsCatalog: items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      brand: i.brand,
      specs: i.specs,
      description: i.description ?? '',
      salePrice: i.salePrice,
      unit: i.unit,
      imageUrl: i.imageUrl && /^https?:\/\//i.test(i.imageUrl) ? i.imageUrl : undefined,
    })),
  };
}

export async function pushManifestToCloudWebhook(): Promise<string> {
  const settings = getFacebookSettings();
  if (!settings.cloudWebhookUrl) {
    throw new Error('يرجى إدخال رابط Webhook السحابي أولاً.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('لا يمكن الإرسال لـ Webhook أثناء وضع الأوفلاين.');
  }
  const manifest = await buildCloudCronManifest();
  const res = await fetch(settings.cloudWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...manifest, pageToken: settings.pageToken }),
  });
  if (!res.ok) {
    throw new Error(`استجاب Webhook بحالة HTTP ${res.status}`);
  }
  return 'تمت مزامنة جدول الحملات والكتالوج مع Webhook السحابي بنجاح (جاهز للعمل 24/7).';
}
