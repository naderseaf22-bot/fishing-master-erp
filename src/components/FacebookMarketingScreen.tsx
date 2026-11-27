import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  Pause,
  Play,
  Plus,
  Send,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { FacebookCampaign, db } from '../db';
import {
  AiAgentResult,
  askFishingAiAgent,
  buildCloudCronManifest,
  createFacebookCampaign,
  deleteFacebookCampaign,
  formatItemPostCaption,
  getFacebookSettings,
  pushManifestToCloudWebhook,
  runCampaignStep,
  saveFacebookSettings,
  shareItemToFacebook,
  updateFacebookCampaign,
} from '../fbMarketingEngine';
import { formatCurrency, formatDateTime } from '../utils/format';
import { SectionHeader, StatCard } from './UiPrimitives';

const darkInput =
  'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none';

export function FacebookMarketingScreen({
  onNotify,
}: {
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const campaigns = useLiveQuery(() => db.fbCampaigns.toArray(), []) ?? [];
  const logs =
    useLiveQuery(() => db.fbLogs.orderBy('date').reverse().toArray(), []) ?? [];

  const itemMap = useMemo(
    () => new Map(items.map((it) => [it.id, it])),
    [items]
  );

  // Page settings state
  const [settings, setSettings] = useState(() => getFacebookSettings());
  const [showToken, setShowToken] = useState(false);

  // Campaign builder state
  const [campName, setCampName] = useState('حملة أدوات الصيد اليومية');
  const [intervalHours, setIntervalHours] = useState<number>(2);
  const [repeatLoop, setRepeatLoop] = useState(true);
  const [orderedItemIds, setOrderedItemIds] = useState<string[]>([]);
  const [quickShareItemId, setQuickShareItemId] = useState('');

  // AI Agent test state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResult, setAiResult] = useState<AiAgentResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Cloud manifest preview
  const [cloudJson, setCloudJson] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isConnected = Boolean(settings.pageId && settings.pageToken);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveFacebookSettings(settings);
    setSettings(saved);
    onNotify(
      saved.pageId && saved.pageToken
        ? 'تم حفظ بيانات ربط صفحة فيسبوك بنجاح.'
        : 'تم حفظ الإعدادات (وضع المحاكاة المحلية نشط لعدم وجود Token).'
    );
  };

  const toggleItemInCampaign = (id: string) => {
    setOrderedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    setOrderedItemIds((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const selectFirstTenItems = () => {
    setOrderedItemIds(items.slice(0, 10).map((it) => it.id));
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createFacebookCampaign({
        name: campName,
        intervalHours,
        repeatLoop,
        itemIds: orderedItemIds,
      });
      setOrderedItemIds([]);
      onNotify('تم إنشاء الحملة المرتبة وتفعيلها بنجاح.');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر إنشاء الحملة.',
        'error'
      );
    }
  };

  const handleRunStepNow = async (camp: FacebookCampaign) => {
    setBusyId(camp.id);
    try {
      const { log } = await runCampaignStep(camp.id);
      onNotify(
        log.status === 'PUBLISHED'
          ? `تم نشر "${log.itemName}" على فيسبوك!`
          : `تم تنفيذ خطوة الحملة (معاينة محلية): "${log.itemName}"`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر نشر الصنف التالي.',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickShare = async () => {
    const id = quickShareItemId || items[0]?.id;
    if (!id) return;
    setBusyId('quick');
    try {
      const log = await shareItemToFacebook(id);
      onNotify(
        log.status === 'PUBLISHED'
          ? `تم نشر "${log.itemName}" فوراً على فيسبوك.`
          : `تم إنشاء معاينة منشور محلية للصنف "${log.itemName}".`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر النشر.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleAskAi = async (q?: string) => {
    const text = (q ?? aiQuestion).trim();
    if (!text) return;
    if (q) setAiQuestion(q);
    setAiLoading(true);
    try {
      const res = await askFishingAiAgent(text);
      setAiResult(res);
    } finally {
      setAiLoading(false);
    }
  };

  const handleExportCloudManifest = async () => {
    const manifest = await buildCloudCronManifest();
    setCloudJson(JSON.stringify(manifest, null, 2));
  };

  const handlePushWebhook = async () => {
    try {
      const msg = await pushManifestToCloudWebhook();
      onNotify(msg);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'تعذر الإرسال إلى Webhook.',
        'error'
      );
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="حملات فيسبوك الآلية ومساعد الذكاء الاصطناعي (AI Agent)"
        subtitle="جدولة منشورات الأصناف بالترتيب، النشر المباشر لصفحة فيسبوك، والرد الذكي بالأسعار والمواصفات الفعلية"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="حالة ربط الصفحة"
          value={isConnected ? 'متصل بـ Meta API' : 'وضع المعاينة المحلية'}
          tone={isConnected ? 'emerald' : 'amber'}
        />
        <StatCard
          label="الحملات النشطة"
          value={`${campaigns.filter((c) => c.isActive).length} / ${campaigns.length}`}
          tone="sky"
        />
        <StatCard
          label="الأصناف الجاهزة للنشر"
          value={`${items.length} صنف`}
          tone="slate"
        />
        <StatCard
          label="إجمالي سجل النشر والردود"
          value={`${logs.length}`}
          tone="emerald"
        />
      </div>

      {/* Section 1: Facebook Page Credentials & Quick Post */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <form
          onSubmit={handleSaveSettings}
          className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs lg:col-span-7"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-neutral-100">
              1. ربط صفحة فيسبوك (Meta Graph API)
            </h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isConnected
                  ? 'bg-emerald-950 text-emerald-300'
                  : 'bg-amber-950 text-amber-300'
              }`}
            >
              {isConnected ? 'بيانات الربط محفوظة' : 'بدون توكن (محاكاة آمنة)'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">
                معرّف الصفحة (Page ID)
              </label>
              <input
                type="text"
                value={settings.pageId}
                onChange={(e) =>
                  setSettings({ ...settings, pageId: e.target.value })
                }
                placeholder="مثال: 1092837465123"
                className={`${darkInput} font-mono`}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">
                Page Access Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={settings.pageToken}
                  onChange={(e) =>
                    setSettings({ ...settings, pageToken: e.target.value })
                  }
                  placeholder="EAAG..."
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 py-2 pr-3 pl-9 text-sm font-mono text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute left-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-neutral-400">
              يُحفظ التوكن محلياً في المتصفح فقط. في غيابه يتم تسجيل النشر كمعاينة محلية للتجربة.
            </p>
            <button
              type="submit"
              className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-600"
            >
              حفظ إعدادات الصفحة
            </button>
          </div>
        </form>

        {/* Quick Single Item Post */}
        <div className="flex flex-col justify-between space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs lg:col-span-5">
          <div>
            <h3 className="font-bold text-neutral-100">نشر صنف فوري</h3>
            <p className="mt-0.5 text-xs text-neutral-400">
              اختر أي صنف لمعاينة نصه التسويقي ونشره فوراً على الصفحة
            </p>
            <select
              value={quickShareItemId || items[0]?.id || ''}
              onChange={(e) => setQuickShareItemId(e.target.value)}
              className={`mt-3 ${darkInput}`}
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} — {formatCurrency(it.salePrice)}
                </option>
              ))}
            </select>

            {(itemMap.get(quickShareItemId || items[0]?.id || '') ?? null) && (
              <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-300">
                {formatItemPostCaption(
                  itemMap.get(quickShareItemId || items[0]?.id || '')!
                )}
              </pre>
            )}
          </div>

          <button
            type="button"
            disabled={busyId === 'quick' || items.length === 0}
            onClick={() => void handleQuickShare()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Share2 className="h-4 w-4" />
            {busyId === 'quick' ? 'جارٍ النشر...' : 'نشر الصنف الآن على فيسبوك'}
          </button>
        </div>
      </div>

      {/* Section 2: Ordered Campaign Builder + Active Campaigns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <form
          onSubmit={handleCreateCampaign}
          className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs lg:col-span-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-neutral-100">
              2. إنشاء حملة مجدولة ومرتبة
            </h3>
            <button
              type="button"
              onClick={selectFirstTenItems}
              className="rounded-lg border border-sky-800 bg-sky-950 px-2.5 py-1 text-xs font-bold text-sky-300 hover:bg-sky-900"
            >
              تحديد أول {Math.min(10, items.length)} أصناف تلقائياً
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-neutral-400">
                اسم الحملة
              </label>
              <input
                required
                value={campName}
                onChange={(e) => setCampName(e.target.value)}
                className={darkInput}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-400">
                النشر كل (ساعة)
              </label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={intervalHours}
                onChange={(e) => setIntervalHours(Number(e.target.value) || 2)}
                className={darkInput}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <input
              type="checkbox"
              checked={repeatLoop}
              onChange={(e) => setRepeatLoop(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700"
            />
            <span>إعادة الدورة تلقائياً من الصنف الأول بعد انتهاء القائمة</span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2.5">
              <div className="mb-2 text-xs font-bold text-neutral-400">
                اختر الأصناف لإضافتها:
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {items.map((it) => {
                  const chosen = orderedItemIds.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleItemInCampaign(it.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right text-xs transition ${
                        chosen
                          ? 'bg-sky-900/70 font-bold text-sky-200'
                          : 'text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <span className="truncate">{it.name}</span>
                      {chosen && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-2.5">
              <div className="mb-2 text-xs font-bold text-neutral-400">
                ترتيب النشر ({orderedItemIds.length} صنف):
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {orderedItemIds.map((id, idx) => {
                  const it = itemMap.get(id);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-1 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs"
                    >
                      <span className="truncate font-semibold text-neutral-200">
                        {idx + 1}. {it?.name ?? id}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveItem(idx, -1)}
                          className="rounded p-0.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                          title="تحريك لأعلى"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(idx, 1)}
                          className="rounded p-0.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                          title="تحريك لأسفل"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {orderedItemIds.length === 0 && (
                  <p className="py-8 text-center text-xs text-neutral-500">
                    اختر أصنافاً من القائمة المجاورة
                  </p>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            حفظ وبدء الحملة المرتبة
          </button>
        </form>

        {/* Active Campaigns List */}
        <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs lg:col-span-6">
          <h3 className="font-bold text-neutral-100">
            الحملات المجدولة ({campaigns.length})
          </h3>
          <div className="max-h-[390px] space-y-3 overflow-y-auto">
            {campaigns.map((camp) => {
              const nextIdx =
                camp.currentIndex < camp.itemIds.length ? camp.currentIndex : 0;
              const nextItem = itemMap.get(camp.itemIds[nextIdx]);
              return (
                <div
                  key={camp.id}
                  className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-neutral-100">{camp.name}</div>
                      <div className="text-xs text-neutral-400">
                        كل {camp.intervalHours} ساعة •{' '}
                        {camp.repeatLoop ? 'تكرار تلقائي' : 'دورة واحدة'} • آخر نشر:{' '}
                        {camp.lastPostedAt ? formatDateTime(camp.lastPostedAt) : 'لم يبدأ بعد'}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        camp.isActive
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {camp.isActive ? 'نشطة' : 'متوقفة'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs">
                    <span>
                      التقدم:{' '}
                      <strong>
                        {Math.min(camp.currentIndex, camp.itemIds.length)} /{' '}
                        {camp.itemIds.length}
                      </strong>
                    </span>
                    <span className="font-semibold text-sky-400">
                      التالي: {nextItem?.name ?? '—'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === camp.id}
                      onClick={() => void handleRunStepNow(camp)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {busyId === camp.id
                        ? 'جارٍ التنفيذ...'
                        : 'نشر الصنف التالي الآن'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateFacebookCampaign(camp.id, {
                          isActive: !camp.isActive,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
                    >
                      {camp.isActive ? (
                        <>
                          <Pause className="h-3.5 w-3.5" />
                          إيقاف
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          تفعيل
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteFacebookCampaign(camp.id)}
                      className="rounded-lg border border-rose-800 bg-rose-950/60 px-2.5 py-1.5 text-rose-300 hover:bg-rose-900/60"
                      title="حذف الحملة"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {campaigns.length === 0 && (
              <p className="py-10 text-center text-sm text-neutral-500">
                لا توجد حملات مضافة بعد. أنشئ حملتك المرتبة من النموذج المقابل.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: AI Agent Tester & Cloud 24/7 Cron Readiness */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* AI Agent Box */}
        <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs lg:col-span-6">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-400" />
            <h3 className="font-bold text-neutral-100">
              3. اختبار مساعد المبيعات الذكي (AI Agent)
            </h3>
          </div>
          <p className="text-xs text-neutral-400">
            يبحث مباشرة في قاعدة بيانات الأصناف والمخازن ويرد بالأسعار والمواصفات والتفاصيل الفعلية.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {[
              'بكام خيط ضفيرة سوفيكس؟',
              'عندكم مكنة شيمانو 6000؟',
              'تفاصيل قصبة الكربون وسعرها',
              'طعم حبار مجمد متوفر؟',
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => void handleAskAi(sample)}
                className="inline-flex items-center gap-1 rounded-full border border-purple-800 bg-purple-950/60 px-2.5 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-900/60"
              >
                <Sparkles className="h-3 w-3" />
                {sample}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAskAi();
                }
              }}
              placeholder="اكتب سؤال العميل (مثال: بكام مكنة الصيد البحري؟)..."
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
            />
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => void handleAskAi()}
              className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {aiLoading ? '...' : 'اسأل AI'}
            </button>
          </div>

          {aiResult && (
            <div className="space-y-2 rounded-xl border border-purple-800/70 bg-purple-950/30 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300">رد المساعد المقترح:</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(aiResult.reply);
                    onNotify('تم نسخ رد الـ AI إلى الحافظة.');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-purple-300 hover:underline"
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ الرد
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-200">
                {aiResult.reply}
              </pre>
            </div>
          )}
        </div>

        {/* Cloud Cron / Webhook 24/7 */}
        <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs lg:col-span-6">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-sky-400" />
            <h3 className="font-bold text-neutral-100">
              4. التشغيل السحابي 24/7 (Cron / Webhook)
            </h3>
          </div>
          <p className="text-xs text-neutral-400">
            أثناء فتح التطبيق، يفحص المؤقت الداخلي الحملات المستحقة تلقائياً. وللتشغيل 24/7 حتى عند إغلاق المتصفح، اربط Webhook سحابي (Cloudflare Worker / Vercel Cron):
          </p>

          <div className="flex flex-wrap gap-2">
            <input
              type="url"
              value={settings.cloudWebhookUrl ?? ''}
              onChange={(e) =>
                setSettings({ ...settings, cloudWebhookUrl: e.target.value })
              }
              placeholder="https://your-worker.workers.dev/fb-cron-sync"
              className="flex-1 min-w-[200px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-mono text-neutral-100"
            />
            <button
              type="button"
              onClick={() => {
                saveFacebookSettings(settings);
                void handlePushWebhook();
              }}
              className="rounded-xl bg-sky-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-600"
            >
              إرسال للـ Webhook
            </button>
            <button
              type="button"
              onClick={() => void handleExportCloudManifest()}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3.5 py-2 text-xs font-bold text-neutral-200 hover:bg-neutral-700"
            >
              عرض JSON للـ Cron
            </button>
          </div>

          {cloudJson && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-400">
                  هيكل بيانات Cron السحابي:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(cloudJson);
                    onNotify('تم نسخ JSON السحابي.');
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-sky-400"
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ JSON
                </button>
              </div>
              <pre
                className="max-h-40 overflow-auto rounded-xl border border-neutral-800 bg-black p-3 font-mono text-[11px] text-emerald-300"
                dir="ltr"
              >
                {cloudJson}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Logs */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xs">
        <h3 className="mb-3 font-bold text-neutral-100">
          سجل منشورات فيسبوك وردود الـ AI ({logs.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-neutral-950 text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2">التاريخ</th>
                <th className="px-3 py-2">النوع</th>
                <th className="px-3 py-2">الحالة</th>
                <th className="px-3 py-2">الصنف</th>
                <th className="px-3 py-2">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {logs.slice(0, 25).map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 text-xs text-neutral-400">
                    {formatDateTime(l.date)}
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold">
                    {l.type === 'CAMPAIGN_STEP'
                      ? 'حملة مجدولة'
                      : l.type === 'POST'
                      ? 'نشر فوري'
                      : 'رد AI'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        l.status === 'PUBLISHED'
                          ? 'bg-emerald-950 text-emerald-300'
                          : l.status === 'FAILED'
                          ? 'bg-rose-950 text-rose-300'
                          : 'bg-sky-950 text-sky-300'
                      }`}
                    >
                      {l.status === 'PUBLISHED'
                        ? 'منشور'
                        : l.status === 'FAILED'
                        ? 'فشل'
                        : 'محاكاة/محلي'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-neutral-200">
                    {l.itemName ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{l.message}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-neutral-500">
                    لا توجد عمليات نشر أو ردود AI مسجلة حتى الآن.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
