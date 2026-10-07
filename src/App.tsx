import React, { useState, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Clock,
  Globe,
  RefreshCw,
  Play,
  Pause,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Flame,
  Zap,
  Copy,
  Check,
  Activity,
  Calendar,
  Layers,
  FileText,
  ShieldCheck,
  Cpu,
  CheckSquare,
  Compass,
  Sliders,
  Timer,
  Hash,
  Image as ImageIcon,
  VolumeX,
  AlertTriangle,
  Moon,
  Sun,
  ShieldAlert,
  MessageSquare,
  Bookmark
} from 'lucide-react';

interface DashboardData {
  botStatus: string;
  channelStatus: string;
  channelUsername: string;
  aiStatus: string;
  activeAiProvider: string;
  activeAiModel: string;
  totalPublished: number;
  activeSources: number;
  totalDiscovered: number;
  schedule: any;
  recentPosts: any[];
}

interface TelegramStatusData {
  connected: boolean;
  bot?: { id: number; firstName: string; username: string };
  channel?: { id: number; title: string; username: string; type: string; memberCount: number };
  error?: string | null;
}

interface PostItem {
  id: string;
  title: string;
  hook: string;
  persianContent: string;
  hashtags: string;
  sourceUrl: string;
  imageUrl?: string;
  status: 'draft' | 'published' | 'failed';
  qualityScore: number;
  breakdownJson?: string;
  publishedAt?: string;
  createdAt: string;
}

interface SourceItem {
  id: string;
  name: string;
  url: string;
  rssUrl: string;
  category: string;
  priority: number;
  enabled: number | boolean;
  lastCheckedAt?: string;
}

interface LogItem {
  id: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  timestamp: string;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  postData?: {
    title: string;
    hook: string;
    persianContent: string;
    hashtags: string[];
    category: string;
  } | null;
  publishedMessageId?: number | null;
  createdAt: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chatbot' | 'scheduler' | 'posts' | 'sources' | 'settings' | 'logs'>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusData | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // AI Chatbot States
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatAutoPublish, setChatAutoPublish] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [publishingChatPostId, setPublishingChatPostId] = useState<string | null>(null);
  const [savingChatDraftId, setSavingChatDraftId] = useState<string | null>(null);
  const [copiedChatPostId, setCopiedChatPostId] = useState<string | null>(null);

  // Theme state: Dark mode is default (Pure Black + Crimson Red + Crisp White)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chididam_theme');
      if (saved) return saved === 'dark';
    }
    return true;
  });

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('chididam_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Scheduler Form State
  const [schedForm, setSchedForm] = useState({
    scheduleMode: 'interval',
    intervalUnit: 'minutes',
    intervalValue: 60,
    specificTimes: ['09:00', '13:00', '18:00', '22:00'],
    randomDelayMinutes: 5,
    approvalMode: 'auto',
    isAutoActive: true,
    quietHoursStart: '00:00',
    quietHoursEnd: '08:00',
    dailyLimit: 15,
    timezone: 'Asia/Tehran',
    activeDays: ['0', '1', '2', '3', '4', '5', '6']
  });
  const [savingSched, setSavingSched] = useState(false);

  // AI & Bot Settings Form State
  const [aiSettingsForm, setAiSettingsForm] = useState({
    botToken: '',
    channelUsername: '@ChiDidamTest',
    activeAiProvider: 'groq',
    groqApiKey: '',
    groqModel: 'openai/gpt-oss-120b',
    geminiApiKey: '',
    openaiApiKey: '',
    openaiModel: 'gpt-4o-mini',
    openaiBaseUrl: '',
    customPromptInstructions: '',
    aiPersona: 'witty_geek',
    toneOfVoice: 'هیجان‌انگیز، جذاب و خودمانی',
    minQualityScore: '7.5',
    channelHashtags: '#چی_دیدم #هوش_مصنوعی #تکنولوژی',
    enableCardGeneration: 'false'
  });
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; message: string; latencyMs: number; sample?: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [checkingTg, setCheckingTg] = useState(false);

  // Source modal & test
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', url: '', rssUrl: '', category: 'ابزارهای جدید AI', priority: 4 });
  const [feedTesting, setFeedTesting] = useState(false);
  const [feedTestResult, setFeedTestResult] = useState<any | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  // Posts filter & clipboard
  const [postFilter, setPostFilter] = useState<'all' | 'published' | 'draft' | 'failed'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Safe fetch helper that reads text first and safely parses JSON without throwing SyntaxError
  async function safeFetchJson<T = any>(
    url: string,
    options?: RequestInit
  ): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options?.headers || {})
        }
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        return {
          ok: false,
          status: res.status,
          error: text.startsWith('<!doctype') || text.startsWith('<html')
            ? `پاسخ سرور صفحه HTML بود (کد ${res.status}). در حال بارگذاری مجدد...`
            : `داده نامعتبر از سرور دریافت شد (کد ${res.status}).`
        };
      }
      return {
        ok: res.ok,
        status: res.status,
        data,
        error: !res.ok ? (data?.error || data?.message || `خطای سرور (${res.status})`) : undefined
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        error: err?.message === 'Failed to fetch'
          ? 'ارتباط با سرور برقرار نشد. سرور ممکن است در حال راه‌اندازی باشد.'
          : (err?.message || 'خطای ارتباط با سرور')
      };
    }
  }

  const showNotification = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const fetchDashboard = async () => {
    const res = await safeFetchJson<DashboardData>('/api/dashboard');
    if (res.ok && res.data) {
      setDashboard(res.data);
    }
  };

  const fetchTelegramStatus = async (isManual = false) => {
    setCheckingTg(true);
    try {
      const res = await safeFetchJson<TelegramStatusData>('/api/telegram/status');
      if (res.ok && res.data) {
        setTelegramStatus(res.data);
        if (isManual) {
          if (res.data.connected) {
            showNotification(`اتصال تلگرام تأیید شد: ${res.data.channel?.title || 'چی دیدم'} (@${res.data.bot?.username})`, 'success');
          } else {
            showNotification(`خطا در ارتباط با کانال تلگرام: ${res.data.error || 'دسترسی ادمین وجود ندارد'}`, 'error');
          }
        }
      }
    } catch (err: any) {
      if (isManual) showNotification('خطا در استعلام وضعیت تلگرام: ' + err.message, 'error');
    } finally {
      setCheckingTg(false);
    }
  };

  const fetchPosts = async () => {
    const res = await safeFetchJson<{ posts: PostItem[] }>(`/api/posts?status=${postFilter}`);
    if (res.ok && res.data?.posts) {
      setPosts(res.data.posts);
    }
  };

  const fetchSources = async () => {
    const res = await safeFetchJson<{ sources: SourceItem[] }>('/api/sources');
    if (res.ok && res.data?.sources) {
      setSources(res.data.sources);
    }
  };

  const fetchLogs = async () => {
    const res = await safeFetchJson<{ logs: LogItem[] }>('/api/logs');
    if (res.ok && res.data?.logs) {
      setLogs(res.data.logs);
    }
  };

  const fetchSettings = async () => {
    const res = await safeFetchJson<{ settings: Record<string, string> }>('/api/settings');
    if (res.ok && res.data && res.data.settings) {
      const serverSettings = res.data.settings;
      setSettings(serverSettings);
      setAiSettingsForm((prev) => ({ ...prev, ...serverSettings }));
    }
  };

  const fetchScheduler = async () => {
    const res = await safeFetchJson<{ schedule: any }>('/api/scheduler');
    if (res.ok && res.data?.schedule) {
      const s = res.data.schedule;
      let activeDays = ['0', '1', '2', '3', '4', '5', '6'];
      let specificTimes = ['09:00', '13:00', '18:00', '22:00'];
      if (s.activeDaysJson) {
        try { activeDays = JSON.parse(s.activeDaysJson); } catch {}
      }
      if (s.specificTimesJson) {
        try { specificTimes = JSON.parse(s.specificTimesJson); } catch {}
      }
      setSchedForm({
        scheduleMode: s.scheduleMode || 'interval',
        intervalUnit: s.intervalUnit || 'minutes',
        intervalValue: Number(s.intervalValue || s.intervalMinutes || 60),
        specificTimes,
        randomDelayMinutes: Number(s.randomDelayMinutes || 0),
        approvalMode: s.approvalMode || 'auto',
        isAutoActive: s.isAutoActive === 1 || s.isAutoActive === true,
        quietHoursStart: s.quietHoursStart || '00:00',
        quietHoursEnd: s.quietHoursEnd || '08:00',
        dailyLimit: Number(s.dailyLimit || 15),
        timezone: s.timezone || 'Asia/Tehran',
        activeDays
      });
    }
  };

  const fetchChatMessages = async () => {
    const res = await safeFetchJson<{ messages: ChatMessageItem[] }>('/api/chat/messages');
    if (res.ok && res.data?.messages) {
      setChatMessages(res.data.messages);
    }
  };

  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = (presetText !== undefined ? presetText : chatInput).trim();
    if (!textToSend || chatLoading) return;

    const userTempId = 'temp-' + Date.now();
    const optimisticUserMsg: ChatMessageItem = {
      id: userTempId,
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString()
    };

    setChatMessages((prev) => [...prev, optimisticUserMsg]);
    if (!presetText) setChatInput('');
    setChatLoading(true);

    try {
      const res = await safeFetchJson<{
        success: boolean;
        reply: string;
        postData?: any;
        shouldPublishNow?: boolean;
        publishedMessageId?: number;
        autoPublishedPostId?: string;
      }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          autoPublish: chatAutoPublish
        })
      });

      if (res.ok && res.data) {
        const assistantMsg: ChatMessageItem = {
          id: 'msg-' + Date.now(),
          role: 'assistant',
          content: res.data.reply,
          postData: res.data.postData || null,
          publishedMessageId: res.data.publishedMessageId || null,
          createdAt: new Date().toISOString()
        };
        setChatMessages((prev) => [...prev, assistantMsg]);

        if (res.data.publishedMessageId) {
          showNotification(`پست با موفقیت در کانال منتشر شد! (شناسه: ${res.data.publishedMessageId}) 🚀`, 'success');
          fetchPosts();
          fetchDashboard();
        }
      } else {
        showNotification(res.error || 'خطا در ارتباط با هوش مصنوعی', 'error');
      }
    } catch (err: any) {
      showNotification('خطا: ' + err.message, 'error');
    } finally {
      setChatLoading(false);
    }
  };

  const handlePublishInstantFromChat = async (post: any, msgId: string) => {
    setPublishingChatPostId(msgId);
    showNotification('در حال ارسال مستقیم پست به کانال تلگرام...', 'info');
    try {
      const res = await safeFetchJson<{ success: boolean; messageId: number; postId: string }>('/api/chat/publish-instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post, chatMessageId: msgId })
      });

      if (res.ok && res.data?.success) {
        showNotification(`پست با موفقیت در کانال تلگرام منتشر شد! 🚀 (شناسه: ${res.data.messageId})`, 'success');
        setChatMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, publishedMessageId: res.data?.messageId } : m))
        );
        fetchPosts();
        fetchDashboard();
      } else {
        showNotification(res.error || 'خطا در ارسال پست به کانال', 'error');
      }
    } catch (err: any) {
      showNotification('خطا: ' + err.message, 'error');
    } finally {
      setPublishingChatPostId(null);
    }
  };

  const handleSaveDraftFromChat = async (post: any, msgId: string) => {
    setSavingChatDraftId(msgId);
    try {
      const res = await safeFetchJson<{ success: boolean; postId: string }>('/api/chat/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post })
      });
      if (res.ok && res.data?.success) {
        showNotification('پست با موفقیت در پیش‌نویس‌ها ذخیره شد 💾', 'success');
        fetchPosts();
      } else {
        showNotification(res.error || 'خطا در ذخیره پیش‌نویس', 'error');
      }
    } catch (err: any) {
      showNotification('خطا: ' + err.message, 'error');
    } finally {
      setSavingChatDraftId(null);
    }
  };

  const handleClearChat = async () => {
    if (window.confirm('آیا مطمئن هستید که می‌خواهید تمام تاریخچه چت پاک شود؟')) {
      await safeFetchJson('/api/chat/messages', { method: 'DELETE' });
      setChatMessages([]);
      showNotification('تاریخچه گفتگو پاک شد', 'info');
    }
  };

  const handleCopyChatPost = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedChatPostId(id);
    showNotification('متن پست در کلیپ‌بورد کپی شد 📋', 'success');
    setTimeout(() => setCopiedChatPostId(null), 2500);
  };

  useEffect(() => {
    fetchDashboard();
    fetchTelegramStatus(false);
    fetchPosts();
    fetchSources();
    fetchLogs();
    fetchSettings();
    fetchScheduler();
    fetchChatMessages();

    const interval = setInterval(() => {
      fetchDashboard();
      if (activeTab === 'logs') fetchLogs();
    }, 15000);

    return () => clearInterval(interval);
  }, [activeTab, postFilter]);

  // Actions
  const handleTriggerCycle = async () => {
    setLoading(true);
    showNotification('در حال رصد منابع، سنجش وایرالیتی و تولید محتوا با هوش مصنوعی...', 'info');
    try {
      const res = await safeFetchJson<any>('/api/scheduler/trigger', { method: 'POST' });
      if (res.ok && res.data?.success) {
        showNotification(res.data.message || 'پست جدید با موفقیت کشف و تولید شد!', 'success');
        fetchDashboard();
        fetchPosts();
      } else {
        showNotification(res.error || res.data?.message || 'خطا در اجرای چرخه انتشار', 'error');
      }
    } catch (err: any) {
      showNotification('خطای شبکه: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoMode = async (mode: 'auto' | 'manual' | 'pause') => {
    let nextAuto = schedForm.isAutoActive;
    let nextApproval = schedForm.approvalMode;
    if (mode === 'pause') {
      nextAuto = false;
    } else if (mode === 'auto') {
      nextAuto = true;
      nextApproval = 'auto';
    } else if (mode === 'manual') {
      nextAuto = true;
      nextApproval = 'manual';
    }

    const payload = {
      ...schedForm,
      isAutoActive: nextAuto,
      approvalMode: nextApproval
    };

    setSchedForm(payload);
    const res = await safeFetchJson('/api/scheduler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showNotification(
        mode === 'pause'
          ? 'ارسال خودکار متوقف شد ⏸'
          : mode === 'auto'
          ? 'حالت انتشار مستقیم و خودکار فعال شد 🟢'
          : 'حالت تولید پیش‌نویس (تأیید دستی ادمین) فعال شد 📝',
        'success'
      );
      fetchDashboard();
    } else {
      showNotification('خطا در ذخیره وضعیت زمان‌بندی', 'error');
    }
  };

  const handleSaveScheduler = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSched(true);
    try {
      const res = await safeFetchJson<any>('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedForm)
      });
      if (res.ok) {
        showNotification('تنظیمات زمان‌بندی پیشرفته با موفقیت ذخیره شد ✅', 'success');
        fetchDashboard();
      } else {
        showNotification(res.error || 'خطا در ذخیره زمان‌بندی', 'error');
      }
    } catch (err: any) {
      showNotification('خطای شبکه: ' + err.message, 'error');
    } finally {
      setSavingSched(false);
    }
  };

  const handleTestAiConnection = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    let apiKey = '';
    let model = '';
    let baseUrl = '';

    if (aiSettingsForm.activeAiProvider === 'groq') {
      apiKey = aiSettingsForm.groqApiKey;
      model = aiSettingsForm.groqModel;
    } else if (aiSettingsForm.activeAiProvider === 'gemini') {
      apiKey = aiSettingsForm.geminiApiKey;
    } else if (aiSettingsForm.activeAiProvider === 'openai') {
      apiKey = aiSettingsForm.openaiApiKey;
      model = aiSettingsForm.openaiModel;
      baseUrl = aiSettingsForm.openaiBaseUrl;
    } else if (aiSettingsForm.activeAiProvider === 'custom') {
      apiKey = aiSettingsForm.openaiApiKey;
      model = aiSettingsForm.openaiModel;
      baseUrl = aiSettingsForm.openaiBaseUrl;
    }

    try {
      const res = await safeFetchJson<any>('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiSettingsForm.activeAiProvider,
          apiKey,
          model,
          baseUrl
        })
      });

      if (res.ok && res.data) {
        setAiTestResult({
          success: res.data.success,
          message: res.data.message,
          latencyMs: res.data.latencyMs,
          sample: res.data.sampleResponse
        });
      } else {
        setAiTestResult({
          success: false,
          message: res.error || 'پاسخی از مدل هوش مصنوعی دریافت نشد.',
          latencyMs: 0
        });
      }
    } catch (err: any) {
      setAiTestResult({ success: false, message: 'خطای ارتباط: ' + err.message, latencyMs: 0 });
    } finally {
      setTestingAi(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await safeFetchJson<any>('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiSettingsForm)
      });
      if (res.ok) {
        showNotification('تنظیمات هوش مصنوعی و ربات تلگرام ذخیره شد ✅', 'success');
        fetchDashboard();
        fetchTelegramStatus(false);
      } else {
        showNotification(res.error || 'خطا در ذخیره تنظیمات', 'error');
      }
    } catch (err: any) {
      showNotification('خطای شبکه: ' + err.message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestFeedUrl = async () => {
    if (!newSource.rssUrl) {
      showNotification('لطفاً آدرس فید RSS را وارد کنید.', 'error');
      return;
    }
    setFeedTesting(true);
    setFeedTestResult(null);
    try {
      const res = await safeFetchJson<any>('/api/sources/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rssUrl: newSource.rssUrl })
      });
      if (res.ok && res.data) {
        setFeedTestResult(res.data);
        if (res.data.success && !newSource.name && res.data.feedTitle) {
          setNewSource((prev) => ({ ...prev, name: res.data.feedTitle }));
        }
      } else {
        setFeedTestResult({ success: false, error: res.error || 'فید نامعتبر است' });
      }
    } catch (err: any) {
      setFeedTestResult({ success: false, error: err.message });
    } finally {
      setFeedTesting(false);
    }
  };

  const handleToggleSource = async (id: string) => {
    const res = await safeFetchJson(`/api/sources/${id}/toggle`, { method: 'POST' });
    if (res.ok) {
      fetchSources();
      fetchDashboard();
    }
  };

  const handleAddCustomSource = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await safeFetchJson<any>('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSource)
    });
    if (res.ok) {
      showNotification('منبع اختصاصی با موفقیت اضافه شد ✅', 'success');
      setShowAddSource(false);
      setNewSource({ name: '', url: '', rssUrl: '', category: 'ابزارهای جدید AI', priority: 4 });
      setFeedTestResult(null);
      fetchSources();
      fetchDashboard();
    } else {
      showNotification(res.error || 'خطا در ثبت منبع', 'error');
    }
  };

  const handleAddPresetSource = async (preset: { name: string; url: string; rssUrl: string; category: string; priority: number }) => {
    const res = await safeFetchJson<any>('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preset)
    });
    if (res.ok) {
      showNotification(`منبع «${preset.name}» به لیست اضافه شد ✅`, 'success');
      fetchSources();
      fetchDashboard();
    } else {
      showNotification(res.error || 'این منبع از قبل وجود دارد.', 'info');
    }
  };

  const handleDeleteSource = async (id: string, name: string) => {
    if (confirm(`آیا از حذف منبع «${name}» اطمینان دارید؟`)) {
      const res = await safeFetchJson(`/api/sources/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('منبع حذف شد', 'info');
        fetchSources();
        fetchDashboard();
      }
    }
  };

  const handlePublishPostNow = async (id: string) => {
    setLoading(true);
    showNotification('در حال ارسال مستقیم پست به کانال تلگرام...', 'info');
    try {
      const res = await safeFetchJson<any>(`/api/posts/${id}/publish`, { method: 'POST' });
      if (res.ok && res.data?.success) {
        showNotification('پست با موفقیت در کانال منتشر شد! 🚀', 'success');
        fetchPosts();
        fetchDashboard();
      } else {
        showNotification(res.error || res.data?.message || 'خطا در انتشار پست', 'error');
      }
    } catch (err: any) {
      showNotification('خطا: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (id: string) => {
    const res = await safeFetchJson(`/api/posts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showNotification('پست حذف شد', 'info');
      fetchPosts();
      fetchDashboard();
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showNotification('متن پست کپی شد 📋', 'success');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const presetSources = [
    { name: 'زومیت (Zoomit)', url: 'https://www.zoomit.ir', rssUrl: 'https://www.zoomit.ir/feed/', category: 'فناوری و موبایل', priority: 5 },
    { name: 'دیجیاتو (Digiato)', url: 'https://digiato.com', rssUrl: 'https://digiato.com/feed', category: 'تکنولوژی و وب', priority: 5 },
    { name: 'تک‌کرانچ (TechCrunch)', url: 'https://techcrunch.com', rssUrl: 'https://techcrunch.com/feed/', category: 'استارتاپ و هوش مصنوعی', priority: 5 },
    { name: 'د ورج (The Verge)', url: 'https://theverge.com', rssUrl: 'https://www.theverge.com/rss/index.xml', category: 'ترندهای هوش مصنوعی', priority: 5 },
    { name: 'وایرد (Wired AI)', url: 'https://wired.com', rssUrl: 'https://www.wired.com/feed/tag/ai/latest/rss', category: 'هوش مصنوعی پیشرفته', priority: 4 },
    { name: 'موتوربلاگ گوگل (Google AI)', url: 'https://blog.google', rssUrl: 'https://blog.google/technology/ai/rss/', category: 'محصولات گوگل و AI', priority: 5 }
  ];

  const daysMap = [
    { key: '6', label: 'شنبه' },
    { key: '0', label: 'یکشنبه' },
    { key: '1', label: 'دوشنبه' },
    { key: '2', label: 'سه‌شنبه' },
    { key: '3', label: 'چهارشنبه' },
    { key: '4', label: 'پنج‌شنبه' },
    { key: '5', label: 'جمعه' }
  ];

  const personas = [
    { id: 'witty_geek', label: '🔥 گیک شوخ‌طبع و جذاب', desc: 'پرانرژی، کنجکاوی‌برانگیز و رفیقانه، مناسب برای رشد سریع ممبر و تعامل' },
    { id: 'sharp_analyst', label: '⚡ تحلیل‌گر تیزبین و سریع', desc: 'بدون حاشیه، خلاصه، متمرکز بر نکات کلیدی و مغز خبر' },
    { id: 'practical_mentor', label: '🎓 راهنمای کاربردی و ترفند', desc: 'ساده‌فهم و متمرکز بر استفاده عملی ابزار در کار و زندگی روزمره' },
    { id: 'ai_hunter', label: '🤖 شکارچی هوش مصنوعی و پرامپت', desc: 'تأکید ویژه بر قابلیت‌های رایگان، مدل‌های جدید و سرعت انجام کارها' },
    { id: 'elite_journalist', label: '📰 ژورنالیست موثق تکنولوژی', desc: 'رسمیِ مدرن، دقیق، سنجیده و فاقد تیترهای زرد یا اغراق' },
    { id: 'futurist', label: '🚀 استارتاپی و آینده‌پژوه', desc: 'دید بلندمدت، سرمایه‌گذاری خطرپذیر، ترندهای بنیادی نسل بعد' }
  ];

  // Theme helper classes (Red, Black, White Glassmorphism & Neomorphism)
  const theme = {
    bg: isDarkMode ? 'bg-[#060608] text-white' : 'bg-[#f4f4f7] text-zinc-950',
    headerBg: isDarkMode ? 'bg-black/75 border-white/10' : 'bg-white/80 border-black/10',
    card: isDarkMode ? 'neo-glass-dark text-white' : 'neo-glass-light text-zinc-950',
    cardHover: isDarkMode ? 'hover:border-red-500/40 hover:shadow-[0_10px_35px_rgba(220,38,38,0.2)]' : 'hover:border-red-500/50 hover:shadow-lg',
    inset: isDarkMode ? 'neo-inset-dark text-white' : 'neo-inset-light text-zinc-950',
    border: isDarkMode ? 'border-white/10' : 'border-black/10',
    textMuted: isDarkMode ? 'text-zinc-400' : 'text-zinc-600',
    textDim: isDarkMode ? 'text-zinc-500' : 'text-zinc-400',
    badgeRed: isDarkMode ? 'bg-red-950/60 text-red-300 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200',
    badgeWhite: isDarkMode ? 'bg-white/10 text-white border-white/20' : 'bg-black/5 text-black border-black/15',
    activeTab: 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-600/30 font-black',
    inactiveTab: isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-zinc-600 hover:text-black hover:bg-black/5',
    btnPrimary: 'neo-btn-red text-white font-black cursor-pointer active:scale-95 transition-all',
    btnDark: isDarkMode ? 'neo-btn-dark text-white border border-white/10 cursor-pointer active:scale-95' : 'bg-white hover:bg-zinc-100 text-zinc-900 border border-black/15 shadow-sm cursor-pointer active:scale-95',
    input: isDarkMode 
      ? 'bg-black/80 border-white/15 text-white placeholder:text-zinc-600 focus:border-red-500 focus:shadow-[0_0_15px_rgba(239,68,68,0.35)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]' 
      : 'bg-white border-black/15 text-zinc-950 placeholder:text-zinc-400 focus:border-red-600 focus:shadow-[0_0_12px_rgba(220,38,38,0.2)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]'
  };

  return (
    <div dir="rtl" className={`min-h-screen ${theme.bg} font-sans antialiased relative selection:bg-red-600 selection:text-white pb-28 md:pb-12 transition-colors duration-300`}>
      {/* Ambient Lighting Orbs (Crimson Red, Deep Black, Pure White Frosted Glass Environment) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute -top-40 right-[-10%] w-[600px] h-[600px] rounded-full ${isDarkMode ? 'bg-red-600/[0.12]' : 'bg-red-500/[0.08]'} blur-[160px]`}></div>
        <div className={`absolute top-1/3 left-[-15%] w-[650px] h-[650px] rounded-full ${isDarkMode ? 'bg-red-950/[0.22]' : 'bg-red-400/[0.06]'} blur-[180px]`}></div>
        <div className={`absolute -bottom-40 right-1/4 w-[600px] h-[600px] rounded-full ${isDarkMode ? 'bg-white/[0.03]' : 'bg-white/[0.6]'} blur-[150px]`}></div>
        <div className={`absolute inset-0 ${isDarkMode ? 'bg-[radial-gradient(#ffffff_1px,transparent_1px)] opacity-[0.03]' : 'bg-[radial-gradient(#000000_1px,transparent_1px)] opacity-[0.04]'} [background-size:32px_32px]`}></div>
      </div>

      {/* Floating Action Toast Notification */}
      {actionMessage && (
        <div
          dir="rtl"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-2xl border border-white/20 text-xs sm:text-sm font-medium animate-in fade-in duration-200 max-w-[90vw]"
          style={{
            background:
              actionMessage.type === 'success'
                ? 'rgba(220, 38, 38, 0.92)'
                : actionMessage.type === 'error'
                ? 'rgba(185, 28, 28, 0.95)'
                : 'rgba(10, 10, 14, 0.92)',
            color: '#FFFFFF'
          }}
        >
          {actionMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
          {actionMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-white shrink-0" />}
          {actionMessage.type === 'info' && <RefreshCw className="w-4 h-4 text-white animate-spin shrink-0" />}
          <span className="drop-shadow font-sans font-bold">{actionMessage.text}</span>
        </div>
      )}

      {/* Header Bar (Red & Black & White Neomorphic Glass) */}
      <header className={`sticky top-0 z-40 backdrop-blur-2xl ${theme.headerBg} border-b px-4 lg:px-8 py-3.5 transition-all shadow-sm`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 via-red-500 to-white p-0.5 shadow-lg shadow-red-600/30 cursor-pointer flex items-center justify-center shrink-0 active:scale-95 transition-transform"
              onClick={() => setActiveTab('dashboard')}
            >
              <div className={`w-full h-full ${isDarkMode ? 'bg-black' : 'bg-white'} rounded-[14px] flex items-center justify-center`}>
                <span className="text-xl select-none">😳</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`font-black text-base sm:text-lg tracking-tight ${isDarkMode ? 'text-white' : 'text-black'}`}>
                  چی دیدم؟!
                </h1>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-red-600 text-white font-black shadow-sm shadow-red-600/30">
                  ربات هوشمند تلگرام
                </span>
              </div>
              <a
                href={`https://t.me/${(dashboard?.channelUsername || '@ChiDidamTest').replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-[11px] ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'} font-bold font-mono flex items-center gap-1 transition-colors`}
              >
                <span>{dashboard?.channelUsername || '@ChiDidamTest'}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Quick Header Automation Selector */}
          <div className={`hidden sm:flex items-center p-1 rounded-2xl ${theme.inset} border ${theme.border} backdrop-blur-md`}>
            <button
              onClick={() => handleToggleAutoMode('auto')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                schedForm.isAutoActive && schedForm.approvalMode === 'auto'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/40 font-black'
                  : theme.inactiveTab
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>انتشار خودکار</span>
            </button>
            <button
              onClick={() => handleToggleAutoMode('manual')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                schedForm.isAutoActive && schedForm.approvalMode === 'manual'
                  ? 'bg-zinc-800 text-white shadow-md border border-white/20 font-black'
                  : theme.inactiveTab
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>تأیید دستی</span>
            </button>
            <button
              onClick={() => handleToggleAutoMode('pause')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                !schedForm.isAutoActive
                  ? 'bg-black text-red-400 border border-red-500/40 font-black shadow-sm'
                  : theme.inactiveTab
              }`}
            >
              <Pause className="w-3.5 h-3.5" />
              <span>توقف</span>
            </button>
          </div>

          {/* Controls: Dark Mode Toggle + Instant Trigger + Telegram Status */}
          <div className="flex items-center gap-2">
            {/* Dark Mode / Light Mode Toggle */}
            <button
              onClick={toggleTheme}
              title={isDarkMode ? 'تغییر به حالت روشن (Light Mode)' : 'تغییر به حالت تاریک (Dark Mode)'}
              className={`p-2 rounded-xl ${theme.btnDark} text-xs transition-all flex items-center gap-1.5`}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-red-400" />
              ) : (
                <Moon className="w-4 h-4 text-zinc-800" />
              )}
            </button>

            {/* Instant Publish Button */}
            <button
              onClick={handleTriggerCycle}
              disabled={loading}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl ${theme.btnPrimary} text-xs disabled:opacity-50`}
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>انتشار فوری</span>
            </button>

            {/* Telegram Live Status Button */}
            <button
              onClick={() => fetchTelegramStatus(true)}
              disabled={checkingTg}
              title="استعلام زنده دسترسی بات و کانال"
              className={`p-2 rounded-xl ${theme.btnDark} text-xs transition-all`}
            >
              <ShieldCheck className={`w-4 h-4 ${telegramStatus?.connected ? 'text-red-500' : 'text-zinc-500'}`} />
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className={`max-w-7xl mx-auto mt-3 hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar border-t ${theme.border} pt-2`}>
          {[
            { id: 'dashboard', label: 'داشبورد زنده', icon: Activity },
            { id: 'chatbot', label: 'چت‌بات هوش مصنوعی', icon: Sparkles, badge: 'AI', glow: true },
            { id: 'scheduler', label: 'زمان‌بندی حرفه‌ای', icon: Clock },
            { id: 'posts', label: 'پست‌ها و پیش‌نویس‌ها', icon: FileText, badge: posts.length },
            { id: 'sources', label: 'مدیریت منابع', icon: Globe, badge: sources.length },
            { id: 'settings', label: 'هوش مصنوعی و هویت بات', icon: Cpu },
            { id: 'logs', label: 'لاگ‌های سیستم', icon: Layers }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive ? theme.activeTab : theme.inactiveTab
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : ''}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-black/40 text-white' : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 pt-6 relative z-10">
        {/* ======================================================== */}
        {/* 1. DASHBOARD TAB */}
        {/* ======================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Stat Cards (Neomorphic Red & Black Glass) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Bot & Channel Status */}
              <div className={`p-4 rounded-2xl ${theme.card} ${theme.cardHover} transition-all`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs ${theme.textMuted} font-bold`}>وضعیت ربات تلگرام</span>
                  <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-red-950/60 text-red-400' : 'bg-red-100 text-red-600'}`}>
                    <Bot className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-black">{dashboard?.botStatus === 'ONLINE' ? 'آنلاین ✅' : 'آماده'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${telegramStatus?.connected ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                    {telegramStatus?.connected ? 'کانال متصل' : 'بدون اتصال'}
                  </span>
                </div>
                <p className={`text-[11px] ${theme.textDim} mt-2 flex items-center justify-between`}>
                  <span>کانال: {dashboard?.channelUsername || '@ChiDidamTest'}</span>
                  {telegramStatus?.channel?.memberCount ? (
                    <span className="font-mono text-red-500 font-bold">{telegramStatus.channel.memberCount} عضو</span>
                  ) : null}
                </p>
              </div>

              {/* Total Published Posts */}
              <div className={`p-4 rounded-2xl ${theme.card} ${theme.cardHover} transition-all`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs ${theme.textMuted} font-bold`}>پست‌های منتشر شده</span>
                  <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-black'}`}>
                    <Send className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono">{dashboard?.totalPublished || 0}</span>
                  <span className={`text-xs ${theme.textMuted}`}>پست در کانال</span>
                </div>
                <p className={`text-[11px] ${theme.textDim} mt-2`}>
                  کل مطالب کشف شده: <b className={isDarkMode ? 'text-white' : 'text-black'}>{dashboard?.totalDiscovered || 0}</b>
                </p>
              </div>

              {/* Active Sources */}
              <div className={`p-4 rounded-2xl ${theme.card} ${theme.cardHover} transition-all`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs ${theme.textMuted} font-bold`}>منابع پایش شده</span>
                  <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-red-950/60 text-red-400' : 'bg-red-100 text-red-600'}`}>
                    <Globe className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono">{dashboard?.activeSources || sources.length}</span>
                  <span className={`text-xs ${theme.textMuted}`}>منبع فعال</span>
                </div>
                <p className={`text-[11px] ${theme.textDim} mt-2 flex items-center gap-1`}>
                  <Flame className="w-3 h-3 text-red-500" />
                  <span>پایش مداوم RSS و ترندها</span>
                </p>
              </div>

              {/* AI Engine Status */}
              <div className={`p-4 rounded-2xl ${theme.card} ${theme.cardHover} transition-all`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs ${theme.textMuted} font-bold`}>موتور هوش مصنوعی</span>
                  <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-black'}`}>
                    <Cpu className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-black uppercase text-red-500">{dashboard?.activeAiProvider || 'GROQ'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${isDarkMode ? 'bg-white/10 text-white' : 'bg-black/10 text-black'}`}>
                    ONLINE ⚡
                  </span>
                </div>
                <p className={`text-[11px] ${theme.textDim} mt-2 truncate font-mono`} title={dashboard?.activeAiModel}>
                  مدل: {dashboard?.activeAiModel || 'gpt-oss-120b'}
                </p>
              </div>
            </div>

            {/* Quick Automation Command Strip (Neomorphic Glass) */}
            <div className={`p-4 sm:p-5 rounded-2xl ${theme.card} flex flex-col sm:flex-row items-center justify-between gap-4 border`}>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shrink-0 shadow-md shadow-red-600/30">
                  <Flame className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm">وضعیت کارکرد ربات «چی دیدم»</h3>
                  <p className={`text-xs ${theme.textMuted} mt-0.5`}>
                    {schedForm.isAutoActive
                      ? `سیستم در حال حاضر روشن است (حالت ${schedForm.approvalMode === 'auto' ? 'انتشار خودکار' : 'پیش‌نویس و تأیید ادمین'})`
                      : 'سیستم موقتاً متوقف است (هیچ پستی به صورت خودکار ارسال نمی‌شود)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => handleToggleAutoMode(schedForm.isAutoActive ? 'pause' : 'auto')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    schedForm.isAutoActive
                      ? 'bg-zinc-900 hover:bg-zinc-800 text-red-400 border border-red-500/30'
                      : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
                  }`}
                >
                  {schedForm.isAutoActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                  <span>{schedForm.isAutoActive ? 'توقف موقت خودکار' : 'شروع کارکرد خودکار'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('scheduler')}
                  className={`px-4 py-2 rounded-xl ${theme.btnDark} text-xs font-bold flex items-center gap-2`}
                >
                  <Clock className="w-3.5 h-3.5 text-red-500" />
                  <span>تنظیم بازه و ساعات</span>
                </button>
              </div>
            </div>

            {/* AI Chatbot Assistant Quick Launcher */}
            <div className={`p-4 sm:p-5 rounded-3xl ${theme.card} border-2 border-red-500/30 relative overflow-hidden space-y-3`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-red-500 flex items-center justify-center text-white shadow-lg shadow-red-600/40">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm sm:text-base">دستیار چت‌بات هوش مصنوعی کانال تلگرام</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-600 text-white">آنلاین ⚡</span>
                    </div>
                    <p className={`text-xs ${theme.textMuted} mt-0.5`}>
                      مستقیماً هر دستوری بدهید؛ پست تولید می‌کند و با ۱ کلیک یا به صورت خودکار در کانال ارسال می‌کند.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('chatbot')}
                  className={`px-3.5 py-2 rounded-xl ${theme.btnPrimary} text-xs flex items-center gap-1.5 shrink-0`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>ورود به محیط کامل چت‌بات</span>
                </button>
              </div>

              {/* Quick Prompt Suggestions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className={`text-[11px] ${theme.textDim} font-bold flex items-center gap-1`}>
                  <Zap className="w-3 h-3 text-red-500" />
                  <span>دستورات سریع:</span>
                </span>
                {[
                  'یک پست با موضوع آموزش پایتون بنویس و در کانال بفرست',
                  'الان ۳ پست جدید پیدا کن',
                  'امروز چند پست منتشر شده؟',
                  'منابع فعال را نشان بده',
                  'انتشار خودکار را روشن کن'
                ].map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveTab('chatbot');
                      handleSendChatMessage(promptText);
                    }}
                    className={`text-[11px] px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                      isDarkMode
                        ? 'bg-black/60 hover:bg-red-950/40 text-zinc-300 hover:text-white border-white/10 hover:border-red-500/40'
                        : 'bg-white hover:bg-red-50 text-zinc-700 hover:text-red-700 border-black/10 hover:border-red-300 shadow-sm'
                    }`}
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Posts Grid & Telegram Live Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left/Middle: Recent Discovered / Published Feed */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-sm sm:text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    <span>آخرین مطالب کانال «چی دیدم»</span>
                  </h2>
                  <button
                    onClick={() => setActiveTab('posts')}
                    className={`text-xs ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'} font-bold flex items-center gap-1 cursor-pointer`}
                  >
                    <span>مشاهده تمام پست‌ها ({posts.length})</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {posts.length === 0 ? (
                  <div className={`p-12 text-center rounded-2xl ${theme.card} border`}>
                    <p className={`text-sm ${theme.textMuted}`}>هنوز مطلبی در صف یا کانال ثبت نشده است.</p>
                    <button
                      onClick={handleTriggerCycle}
                      disabled={loading}
                      className={`mt-4 px-4 py-2 rounded-xl ${theme.btnPrimary} text-xs inline-flex items-center gap-2`}
                    >
                      <Zap className="w-4 h-4" />
                      <span>کشف و انتشار اولین پست</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {posts.slice(0, 4).map((post) => (
                      <div
                        key={post.id}
                        className={`p-4 rounded-2xl ${theme.card} ${theme.cardHover} border transition-all flex flex-col sm:flex-row gap-4 items-start`}
                      >
                        {post.imageUrl && (
                          <img
                            src={post.imageUrl}
                            alt=""
                            className="w-full sm:w-28 h-28 object-cover rounded-xl bg-zinc-900 border border-white/10 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                post.status === 'published'
                                  ? 'bg-red-600 text-white'
                                  : post.status === 'draft'
                                  ? 'bg-zinc-800 text-zinc-300 border border-white/20'
                                  : 'bg-red-950 text-red-300'
                              }`}
                            >
                              {post.status === 'published' ? 'منتشر شده در کانال' : post.status === 'draft' ? 'پیش‌نویس (نیاز به تأیید)' : 'ناموفق'}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-red-500">
                              امتیاز وایرالیتی: {post.qualityScore || '8.5'}/10
                            </span>
                          </div>

                          <h3 className="font-bold text-sm leading-snug line-clamp-1">{post.title}</h3>
                          <p className={`text-xs ${theme.textMuted} mt-1.5 line-clamp-2 leading-relaxed`}>{post.hook || post.persianContent}</p>

                          <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5">
                            <div className="flex items-center gap-2">
                              {post.status !== 'published' && (
                                <button
                                  onClick={() => handlePublishPostNow(post.id)}
                                  disabled={loading}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-sm shadow-red-600/30"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>انتشار در کانال</span>
                                </button>
                              )}
                              <button
                                onClick={() => handleCopyText(post.persianContent, post.id)}
                                className={`px-2 py-1 rounded-lg ${theme.btnDark} text-[11px] flex items-center gap-1 font-bold`}
                              >
                                {copiedId === post.id ? <Check className="w-3 h-3 text-red-500" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedId === post.id ? 'کپی شد' : 'کپی متن'}</span>
                              </button>
                            </div>

                            <a
                              href={post.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-[10px] ${theme.textDim} hover:text-red-400 flex items-center gap-1 font-mono`}
                            >
                              <span>منبع اصلی</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Telegram Channel Authentic Preview Card */}
              <div className="space-y-4">
                <h2 className="font-black text-sm sm:text-base flex items-center gap-2">
                  <Bot className="w-4 h-4 text-red-500" />
                  <span>پیش‌نمایش زنده در تلگرام</span>
                </h2>

                <div className={`p-4 rounded-3xl ${theme.card} border space-y-3 relative overflow-hidden`}>
                  {/* Mock Telegram Header */}
                  <div className="flex items-center gap-2.5 pb-2 border-b border-white/10">
                    <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center text-white text-base font-black shadow-md shadow-red-600/30">
                      😳
                    </div>
                    <div>
                      <h4 className="font-black text-xs leading-none">چی دیدم؟! 🔥</h4>
                      <p className={`text-[10px] ${theme.textDim} font-mono mt-0.5`}>{dashboard?.channelUsername || '@ChiDidamTest'}</p>
                    </div>
                  </div>

                  {/* Telegram Bubble */}
                  {posts.length > 0 ? (
                    <div className={`p-3.5 rounded-2xl ${isDarkMode ? 'bg-black/90 border border-white/10' : 'bg-white border border-black/10'} shadow-lg text-xs leading-relaxed space-y-2`}>
                      {posts[0].imageUrl && (
                        <img
                          src={posts[0].imageUrl}
                          alt=""
                          className="w-full h-36 object-cover rounded-xl bg-zinc-900 border border-white/10"
                        />
                      )}
                      <p className="font-black text-[13px] text-red-500 leading-snug">{posts[0].title}</p>
                      <p className={`whitespace-pre-line text-[11px] leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        {posts[0].persianContent.slice(0, 260)}...
                      </p>
                      <div className="pt-2 flex items-center justify-between text-[10px] font-mono border-t border-white/5">
                        <span className="text-red-500 font-bold">{dashboard?.channelUsername || '@ChiDidamTest'}</span>
                        <span className={theme.textDim}>14:30 👁 1.2k</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-zinc-500">
                      پستی برای پیش‌نمایش تلگرام در دسترس نیست.
                    </div>
                  )}

                  <div className={`p-2.5 rounded-xl ${theme.inset} text-[11px] ${theme.textMuted} flex items-center gap-2`}>
                    <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                    <span>پست‌ها کاملاً به فرمت تلگرام، راست‌چین و بدون نیاز به دستکاری ارسال می‌شوند.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. AI CHATBOT TAB (Direct AI Conversation & Channel Publisher) */}
        {/* ======================================================== */}
        {activeTab === 'chatbot' && (
          <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-200">
            {/* Chatbot Top Status Bar */}
            <div className={`p-4 sm:p-5 rounded-3xl ${theme.card} border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-600 to-red-500 flex items-center justify-center text-white shadow-xl shadow-red-600/40 shrink-0">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-black text-base sm:text-lg">چت‌بات هوش مصنوعی کانال تلگرام</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-600 text-white animate-pulse">
                      آنلاین 🟢
                    </span>
                  </div>
                  <p className={`text-xs ${theme.textMuted} mt-0.5`}>
                    دستور دهید تا پست آماده تلگرام با هوک، فرمت RTL و هشتگ تولید کند و با ۱ کلیک در کانال منتشر شود.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <div className={`px-3 py-1.5 rounded-xl ${theme.inset} text-[11px] font-mono flex items-center gap-1.5`}>
                  <Cpu className="w-3.5 h-3.5 text-red-500" />
                  <span className="font-bold text-red-500 uppercase">{dashboard?.activeAiProvider || 'GROQ'}</span>
                  <span className={theme.textDim}>({dashboard?.activeAiModel || 'gpt-oss-120b'})</span>
                </div>

                {chatMessages.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    title="پاک کردن تاریخچه پیام‌ها"
                    className={`p-2 rounded-xl ${theme.btnDark} text-xs transition-all text-zinc-400 hover:text-red-400`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Suggestion Pills */}
            <div className={`p-3.5 rounded-2xl ${theme.card} border space-y-2`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${theme.textMuted} font-bold flex items-center gap-1.5`}>
                  <Sparkles className="w-3.5 h-3.5 text-red-500" />
                  <span>پیشنهادهای آماده (کلیک برای ارسال فوری به هوش مصنوعی):</span>
                </span>
                <span className={`text-[11px] ${theme.textDim}`}>کانال هدف: {dashboard?.channelUsername || '@ChiDidamTest'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  'یک پست با موضوع آموزش پایتون بنویس و در کانال بفرست',
                  'الان ۳ پست جدید پیدا کن',
                  'امروز چند پست منتشر شده؟',
                  'منابع فعال را نشان بده',
                  'پست‌های صف را نشان بده',
                  'انتشار خودکار را روشن کن',
                  'انتشار خودکار را خاموش کن',
                  'آخرین خطاها را بررسی کن',
                  'یک پیام خوش‌آمدگویی پرانرژی برای اعضای جدید کانال بنویس',
                  'یک ترفند مخفی تلگرام برای افزایش سرعت دانلود بنویس',
                  'یک پست معرفی ۵ سایت رایگان و جادویی بنویس'
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={chatLoading}
                    onClick={() => handleSendChatMessage(item)}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer disabled:opacity-50 text-right flex items-center gap-1.5 ${
                      isDarkMode
                        ? 'bg-black/60 hover:bg-red-950/40 text-zinc-300 hover:text-white border-white/10 hover:border-red-500/40 shadow-sm'
                        : 'bg-white hover:bg-red-50 text-zinc-800 hover:text-red-700 border-black/10 hover:border-red-300 shadow-sm'
                    }`}
                  >
                    <Zap className="w-3 h-3 text-red-500 shrink-0" />
                    <span>{item}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Stream Area */}
            <div className={`p-4 sm:p-6 rounded-3xl ${theme.card} border min-h-[420px] flex flex-col justify-between space-y-4`}>
              {chatMessages.length === 0 ? (
                <div className="my-auto py-12 text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-red-600/10 border border-red-500/20 text-red-500 mx-auto flex items-center justify-center shadow-lg shadow-red-600/10">
                    <Bot className="w-8 h-8" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="font-black text-base">دستیار هوش مصنوعی آماده دریافت دستور شماست!</h3>
                    <p className={`text-xs ${theme.textMuted} leading-relaxed`}>
                      می‌توانید هر درخواستی مطرح کنید: تولید پست آموزشی، معرفی ابزار، ترفند، بازنویسی مطالب، یا دستور ارسال مستقیم به کانال تلگرام.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    <button
                      onClick={() => handleSendChatMessage('یک پست با موضوع آموزش پایتون بنویس و در کانال بفرست')}
                      className={`px-4 py-2 rounded-xl ${theme.btnPrimary} text-xs flex items-center gap-2`}
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>تست: تولید پست پایتون و ارسال به کانال</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}
                    >
                      {/* Message Bubble Header */}
                      <div className="flex items-center gap-2 text-[11px] px-1 text-zinc-400">
                        {msg.role === 'user' ? (
                          <>
                            <span className="font-bold text-red-400">ادمین کانال</span>
                            <span>•</span>
                            <span>{new Date(msg.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                            <span className="font-black text-red-500 flex items-center gap-1">
                              <Bot className="w-3.5 h-3.5" />
                              <span>دستیار هوش مصنوعی «چی دیدم»</span>
                            </span>
                            <span>•</span>
                            <span>{new Date(msg.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </>
                        )}
                      </div>

                      {/* Text Bubble */}
                      <div
                        className={`p-4 rounded-2xl max-w-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-line shadow-md ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-l from-red-600 to-red-700 text-white font-medium rounded-tr-none shadow-red-600/30'
                            : isDarkMode
                            ? 'bg-[#0f0f15] border border-white/10 text-zinc-100 rounded-tl-none shadow-black/80'
                            : 'bg-white border border-black/10 text-zinc-900 rounded-tl-none shadow-zinc-200'
                        }`}
                      >
                        {msg.content}
                      </div>

                      {/* Post Card & Telegram Live Preview if Post Generated */}
                      {msg.postData && (
                        <div className="w-full max-w-2xl mt-3 p-4 sm:p-5 rounded-3xl bg-[#09090d] border-2 border-red-500/40 text-white shadow-2xl space-y-4">
                          {/* Realistic Telegram Channel Banner */}
                          <div className="flex items-center justify-between pb-3 border-b border-white/10">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-red-600 to-red-500 flex items-center justify-center font-black text-white text-base shadow-md shadow-red-600/40">
                                😳
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="font-black text-xs sm:text-sm">چی دیدم؟! 😳</h4>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-red-500 fill-white" />
                                </div>
                                <p className="text-[10px] text-zinc-400 font-mono">{dashboard?.channelUsername || '@ChiDidamTest'}</p>
                              </div>
                            </div>

                            {/* Status Indicator */}
                            {msg.publishedMessageId ? (
                              <span className="text-[11px] px-3 py-1 rounded-full font-bold bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" />
                                <span>منتشر شده در کانال (شناسه: {msg.publishedMessageId})</span>
                              </span>
                            ) : (
                              <span className="text-[11px] px-3 py-1 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>آماده انتشار یا ذخیره</span>
                              </span>
                            )}
                          </div>

                          {/* Post Title & Category */}
                          <div className="space-y-1">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-950 text-red-400 border border-red-500/30">
                              {msg.postData.category || 'تکنولوژی و وب'}
                            </span>
                            <h3 className="font-black text-sm text-red-400 leading-snug pt-1">
                              {msg.postData.hook || msg.postData.title}
                            </h3>
                          </div>

                          {/* Post Content Box with RTL Styling */}
                          <div className="p-3.5 rounded-2xl bg-black/80 border border-white/10 text-xs sm:text-sm leading-relaxed whitespace-pre-line text-zinc-200 font-normal selection:bg-red-600 select-text font-sans">
                            {msg.postData.persianContent}
                          </div>

                          {/* Hashtags */}
                          {msg.postData.hashtags && msg.postData.hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {msg.postData.hashtags.map((tag, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-300 border border-white/5"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Action Buttons: Instant Publish, Save Draft, Copy */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                            {/* Instant Publish Button */}
                            <button
                              type="button"
                              onClick={() => handlePublishInstantFromChat(msg.postData, msg.id)}
                              disabled={publishingChatPostId === msg.id}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
                                msg.publishedMessageId
                                  ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-white/20'
                                  : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/40'
                              } disabled:opacity-50`}
                            >
                              {publishingChatPostId === msg.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5 fill-white" />
                              )}
                              <span>
                                {publishingChatPostId === msg.id
                                  ? 'در حال ارسال به تلگرام...'
                                  : msg.publishedMessageId
                                  ? '🚀 ارسال مجدد به کانال'
                                  : '🚀 انتشار فوری در کانال تلگرام'}
                              </span>
                            </button>

                            {/* Save to Drafts Button */}
                            <button
                              type="button"
                              onClick={() => handleSaveDraftFromChat(msg.postData, msg.id)}
                              disabled={savingChatDraftId === msg.id}
                              className={`px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white border border-white/15 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50`}
                            >
                              {savingChatDraftId === msg.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Bookmark className="w-3.5 h-3.5 text-zinc-300" />
                              )}
                              <span>ذخیره در پیش‌نویس‌ها</span>
                            </button>

                            {/* Copy Post Text Button */}
                            <button
                              type="button"
                              onClick={() => handleCopyChatPost(msg.postData?.persianContent || '', msg.id)}
                              className={`px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer`}
                            >
                              {copiedChatPostId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                  <span className="text-green-400">کپی شد!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>کپی متن</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Loading Typing Indicator */}
                  {chatLoading && (
                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-black/60 border border-white/10 w-fit text-xs text-zinc-300 animate-pulse">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-bounce"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-bounce [animation-delay:0.4s]"></div>
                      <span className="font-bold text-red-400 pr-1">دستیار در حال تحلیل، تولید و تدوین پست...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Input Area */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                {/* Control Row: Auto-publish Checkbox & Live Hint */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={chatAutoPublish}
                      onChange={(e) => setChatAutoPublish(e.target.checked)}
                      className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                    />
                    <span className={`font-bold flex items-center gap-1 ${chatAutoPublish ? 'text-red-500' : theme.textMuted}`}>
                      <Zap className="w-3.5 h-3.5" />
                      <span>انتشار خودکار در کانال تلگرام (در صورت صدور دستور ارسال)</span>
                    </span>
                  </label>

                  <span className={`text-[11px] ${theme.textDim}`}>
                    کلید Enter برای ارسال • Shift+Enter برای خط جدید
                  </span>
                </div>

                {/* Textarea & Send Button */}
                <div className="flex gap-2 items-end">
                  <textarea
                    rows={2}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChatMessage();
                      }
                    }}
                    placeholder="دستور خود را بنویسید... (مثال: یک پست با موضوع آموزش پایتون بنویس و در کانال بفرست)"
                    className={`flex-1 p-3.5 rounded-2xl text-xs sm:text-sm resize-none focus:outline-none border ${theme.input} leading-relaxed`}
                  />

                  <button
                    type="button"
                    onClick={() => handleSendChatMessage()}
                    disabled={!chatInput.trim() || chatLoading}
                    className={`px-5 py-3.5 rounded-2xl ${theme.btnPrimary} text-xs font-black flex items-center gap-2 shrink-0 disabled:opacity-50`}
                  >
                    {chatLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>ارسال</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. SCHEDULER TAB (Zero-Bug Timing Engine) */}
        {/* ======================================================== */}
        {activeTab === 'scheduler' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-lg sm:text-xl flex items-center gap-2">
                  <Clock className="w-5 h-5 text-red-500" />
                  <span>زمان‌بندی حرفه‌ای و انعطاف‌پذیر ربات</span>
                </h2>
                <p className={`text-xs ${theme.textMuted} mt-1`}>
                  تنظیم دقیق بازه‌های زمانی از ثانیه، دقیقه تا ساعت و روزها، بدون کوچک‌ترین باگ
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${schedForm.isAutoActive ? 'text-red-500' : theme.textDim}`}>
                  {schedForm.isAutoActive ? 'روشن 🟢' : 'خاموش 🔴'}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveScheduler} className="space-y-5">
              {/* Timing Engine Mode */}
              <div className={`p-5 rounded-2xl ${theme.card} border space-y-4`}>
                <h3 className="font-bold text-sm text-red-500 flex items-center gap-2">
                  <Timer className="w-4 h-4" />
                  <span>۱. انتخاب سبک زمان‌بندی انتشار:</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSchedForm((prev) => ({ ...prev, scheduleMode: 'interval' }))}
                    className={`p-4 rounded-xl text-right transition-all cursor-pointer border ${
                      schedForm.scheduleMode === 'interval'
                        ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30'
                        : `${theme.inset} ${theme.border} hover:border-red-500/50`
                    }`}
                  >
                    <div className="font-black text-sm">⏱ بازه زمانی متناوب (Interval)</div>
                    <p className={`text-xs mt-1 ${schedForm.scheduleMode === 'interval' ? 'text-white/90' : theme.textMuted}`}>
                      انتشار پیوسته با فاصله زمانی مشخص (مثلاً هر ۴۵ دقیقه یا هر ۲ ساعت)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSchedForm((prev) => ({ ...prev, scheduleMode: 'specific' }))}
                    className={`p-4 rounded-xl text-right transition-all cursor-pointer border ${
                      schedForm.scheduleMode === 'specific'
                        ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30'
                        : `${theme.inset} ${theme.border} hover:border-red-500/50`
                    }`}
                  >
                    <div className="font-black text-sm">📅 ساعات مشخص در طول روز (Slots)</div>
                    <p className={`text-xs mt-1 ${schedForm.scheduleMode === 'specific' ? 'text-white/90' : theme.textMuted}`}>
                      ارسال در ساعت‌های پیک بازدید تلگرام (مثلاً ساعت ۱۰:۰۰، ۱۴:۰۰، ۲۰:۰۰ و ۲۳:۰۰)
                    </p>
                  </button>
                </div>

                {/* Sub-form: Interval Mode */}
                {schedForm.scheduleMode === 'interval' && (
                  <div className={`p-4 rounded-xl ${theme.inset} space-y-4 border ${theme.border}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>فاصله زمانی هر چرخه:</label>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={schedForm.intervalValue}
                          onChange={(e) => setSchedForm({ ...schedForm, intervalValue: Number(e.target.value) })}
                          className={`w-full px-3 py-2 rounded-xl border text-sm font-bold font-mono ${theme.input}`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>واحد زمان:</label>
                        <select
                          value={schedForm.intervalUnit}
                          onChange={(e) => setSchedForm({ ...schedForm, intervalUnit: e.target.value })}
                          className={`w-full px-3 py-2 rounded-xl border text-sm font-bold ${theme.input}`}
                        >
                          <option value="seconds">ثانیه (Seconds) - جهت تست سریع</option>
                          <option value="minutes">دقیقه (Minutes) - توصیه شده: ۳۰ تا ۹۰ دقیقه</option>
                          <option value="hours">ساعت (Hours) - توصیه شده: ۱ تا ۴ ساعت</option>
                          <option value="days">روز (Days) - روزانه</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>
                        تأخیر تصادفی و طبیعی‌سازی فعالیت ربات (Jitter):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={schedForm.randomDelayMinutes}
                        onChange={(e) => setSchedForm({ ...schedForm, randomDelayMinutes: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-sm font-bold font-mono ${theme.input}`}
                      />
                      <p className={`text-[11px] ${theme.textDim} mt-1`}>
                        برای اینکه کانال شبیه رفتار انسانی باشد، ربات ±{schedForm.randomDelayMinutes} دقیقه تأخیر تصادفی اعمال می‌کند.
                      </p>
                    </div>
                  </div>
                )}

                {/* Sub-form: Specific Slots Mode */}
                {schedForm.scheduleMode === 'specific' && (
                  <div className={`p-4 rounded-xl ${theme.inset} space-y-4 border ${theme.border}`}>
                    <label className={`block text-xs font-bold ${theme.textMuted}`}>
                      ساعت‌های طلایی ارسال در طول شبانه‌روز (ساعت:دقیقه):
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {schedForm.specificTimes.map((t, idx) => (
                        <div key={idx} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${isDarkMode ? 'bg-black' : 'bg-white'} border ${theme.border}`}>
                          <input
                            type="time"
                            value={t}
                            onChange={(e) => {
                              const newTimes = [...schedForm.specificTimes];
                              newTimes[idx] = e.target.value;
                              setSchedForm({ ...schedForm, specificTimes: newTimes });
                            }}
                            className="bg-transparent text-xs font-mono font-bold focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newTimes = schedForm.specificTimes.filter((_, i) => i !== idx);
                              setSchedForm({ ...schedForm, specificTimes: newTimes });
                            }}
                            className="text-red-500 hover:text-red-400 p-0.5 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSchedForm({ ...schedForm, specificTimes: [...schedForm.specificTimes, '12:00'] })}
                        className={`px-3 py-1.5 rounded-xl ${theme.btnDark} text-xs font-bold flex items-center gap-1`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>افزودن ساعت جدید</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Days of Week */}
              <div className={`p-5 rounded-2xl ${theme.card} border space-y-3`}>
                <h3 className="font-bold text-sm text-red-500 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>۲. روزهای فعال هفته:</span>
                </h3>
                <p className={`text-xs ${theme.textMuted}`}>روزهایی که مایلید ربات فعال باشد و پست بگذارد را انتخاب کنید:</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {daysMap.map((d) => {
                    const isSelected = schedForm.activeDays.includes(d.key);
                    return (
                      <button
                        type="button"
                        key={d.key}
                        onClick={() => {
                          const newDays = isSelected
                            ? schedForm.activeDays.filter((k) => k !== d.key)
                            : [...schedForm.activeDays, d.key];
                          setSchedForm({ ...schedForm, activeDays: newDays });
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30'
                            : `${theme.inset} ${theme.border} text-zinc-500`
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quiet Hours & Daily Post Limit */}
              <div className={`p-5 rounded-2xl ${theme.card} border space-y-4`}>
                <h3 className="font-bold text-sm text-red-500 flex items-center gap-2">
                  <VolumeX className="w-4 h-4" />
                  <span>۳. ساعات سکوت و سقف روزانه:</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>شروع سکوت شبانه (بدون ارسال):</label>
                    <input
                      type="time"
                      value={schedForm.quietHoursStart}
                      onChange={(e) => setSchedForm({ ...schedForm, quietHoursStart: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-sm font-bold font-mono ${theme.input}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>پایان سکوت شبانه:</label>
                    <input
                      type="time"
                      value={schedForm.quietHoursEnd}
                      onChange={(e) => setSchedForm({ ...schedForm, quietHoursEnd: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-sm font-bold font-mono ${theme.input}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>حداکثر پست در شبانه‌روز:</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={schedForm.dailyLimit}
                      onChange={(e) => setSchedForm({ ...schedForm, dailyLimit: Number(e.target.value) })}
                      className={`w-full px-3 py-2 rounded-xl border text-sm font-bold font-mono ${theme.input}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>منطقه زمانی (Timezone):</label>
                    <select
                      value={schedForm.timezone || 'Asia/Tehran'}
                      onChange={(e) => setSchedForm({ ...schedForm, timezone: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${theme.input}`}
                    >
                      <option value="Asia/Tehran">تهران (Asia/Tehran +3:30)</option>
                      <option value="UTC">جهانی (UTC)</option>
                      <option value="Europe/London">لندن (Europe/London)</option>
                      <option value="Europe/Berlin">برلین (Europe/Berlin)</option>
                      <option value="Asia/Dubai">دبی (Asia/Dubai +4:00)</option>
                      <option value="America/New_York">نیویورک (America/New_York)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Approval Mode & Main Switch */}
              <div className={`p-5 rounded-2xl ${theme.card} border space-y-4`}>
                <h3 className="font-bold text-sm text-red-500 flex items-center gap-2">
                  <Sliders className="w-4 h-4" />
                  <span>۴. نوع انتشار و فعال‌سازی ربات:</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer ${schedForm.approvalMode === 'auto' ? 'border-red-500 bg-red-600/10' : theme.inset}`}>
                    <input
                      type="radio"
                      name="approvalMode"
                      checked={schedForm.approvalMode === 'auto'}
                      onChange={() => setSchedForm({ ...schedForm, approvalMode: 'auto' })}
                      className="mt-1 accent-red-600"
                    />
                    <div>
                      <div className="font-black text-xs">🚀 انتشار کاملاً خودکار (Full Auto)</div>
                      <p className={`text-[11px] ${theme.textMuted} mt-0.5`}>مطالب با کیفیت بالا فوراً به کانال تلگرام ارسال می‌شوند.</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer ${schedForm.approvalMode === 'manual' ? 'border-red-500 bg-red-600/10' : theme.inset}`}>
                    <input
                      type="radio"
                      name="approvalMode"
                      checked={schedForm.approvalMode === 'manual'}
                      onChange={() => setSchedForm({ ...schedForm, approvalMode: 'manual' })}
                      className="mt-1 accent-red-600"
                    />
                    <div>
                      <div className="font-black text-xs">📝 پیش‌نویس با تأیید دستی ادمین</div>
                      <p className={`text-[11px] ${theme.textMuted} mt-0.5`}>پست آماده می‌شود تا خودتان با یک دکمه آن را به کانال ارسال کنید.</p>
                    </div>
                  </label>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-white/5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={schedForm.isAutoActive}
                      onChange={(e) => setSchedForm({ ...schedForm, isAutoActive: e.target.checked })}
                      className="w-4 h-4 accent-red-600 rounded"
                    />
                    <span className="font-black text-xs">فعال بودن موتور زمان‌بندی خودکار</span>
                  </label>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingSched}
                  className={`px-6 py-2.5 rounded-xl ${theme.btnPrimary} text-xs flex items-center gap-2`}
                >
                  {savingSched ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>ذخیره تنظیمات زمان‌بندی</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. POSTS & DRAFTS TAB */}
        {/* ======================================================== */}
        {activeTab === 'posts' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-black text-lg sm:text-xl flex items-center gap-2">
                  <FileText className="w-5 h-5 text-red-500" />
                  <span>پست‌ها، پیش‌نویس‌ها و تاریخچه کانال</span>
                </h2>
                <p className={`text-xs ${theme.textMuted} mt-1`}>
                  مدیریت تمامی محتواهای بازنویسی‌شده توسط هوش مصنوعی، امتیازهای وایرالیتی و ارسال به تلگرام
                </p>
              </div>

              {/* Filter Tabs */}
              <div className={`flex items-center p-1 rounded-xl ${theme.inset} border ${theme.border}`}>
                {[
                  { id: 'all', label: 'همه' },
                  { id: 'published', label: 'منتشر شده' },
                  { id: 'draft', label: 'پیش‌نویس‌ها' },
                  { id: 'failed', label: 'ناموفق' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setPostFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      postFilter === f.id ? 'bg-red-600 text-white shadow-sm font-black' : theme.inactiveTab
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Posts List */}
            {posts.length === 0 ? (
              <div className={`p-16 text-center rounded-2xl ${theme.card} border space-y-3`}>
                <FileText className="w-12 h-12 text-zinc-600 mx-auto" />
                <h3 className="font-bold text-sm">هیچ پستی با فیلتر انتخابی یافت نشد.</h3>
                <p className={`text-xs ${theme.textMuted}`}>می‌توانید با دکمه زیر همین حالا یک چرخه انتشار جدید را فعال کنید.</p>
                <button
                  onClick={handleTriggerCycle}
                  disabled={loading}
                  className={`mt-2 px-4 py-2 rounded-xl ${theme.btnPrimary} text-xs inline-flex items-center gap-2`}
                >
                  <Zap className="w-4 h-4" />
                  <span>کشف و انتشار یک پست جدید</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className={`p-5 rounded-2xl ${theme.card} ${theme.cardHover} border flex flex-col justify-between transition-all`}
                  >
                    <div className="space-y-3">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                            post.status === 'published'
                              ? 'bg-red-600 text-white'
                              : post.status === 'draft'
                              ? 'bg-zinc-800 text-zinc-200 border border-white/20'
                              : 'bg-red-950 text-red-300'
                          }`}
                        >
                          {post.status === 'published' ? 'منتشر شده در کانال ✅' : post.status === 'draft' ? 'آماده تأیید ادمین 📝' : 'خطا ❌'}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-red-500">
                          امتیاز: {post.qualityScore || '8.5'}/10
                        </span>
                      </div>

                      {/* Image if available */}
                      {post.imageUrl && (
                        <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-48 border border-white/10">
                          <img
                            src={post.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}

                      {/* Title & Body */}
                      <h3 className="font-black text-sm leading-snug">{post.title}</h3>
                      <p className={`text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'} leading-relaxed whitespace-pre-line bg-black/30 p-3 rounded-xl border border-white/5`}>
                        {post.persianContent}
                      </p>

                      {/* Hashtags */}
                      {post.hashtags && (
                        <div className="flex flex-wrap gap-1">
                          {post.hashtags.split(' ').map((tag, idx) => (
                            <span key={idx} className="text-[10px] text-red-400 font-mono font-bold">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {post.status !== 'published' && (
                          <button
                            onClick={() => handlePublishPostNow(post.id)}
                            disabled={loading}
                            className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-red-600/30 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>انتشار در کانال</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleCopyText(post.persianContent, post.id)}
                          className={`px-3 py-1.5 rounded-xl ${theme.btnDark} text-xs font-bold flex items-center gap-1`}
                        >
                          {copiedId === post.id ? <Check className="w-3.5 h-3.5 text-red-500" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedId === post.id ? 'کپی شد' : 'کپی'}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={post.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`p-1.5 rounded-lg ${theme.btnDark} text-zinc-400 hover:text-red-400`}
                          title="مشاهده مقاله اصلی"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="p-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/20 cursor-pointer transition-colors"
                          title="حذف پست"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* 4. SOURCES TAB (Advanced Source Manager) */}
        {/* ======================================================== */}
        {activeTab === 'sources' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-black text-lg sm:text-xl flex items-center gap-2">
                  <Globe className="w-5 h-5 text-red-500" />
                  <span>مدیریت منابع خبری و فیدهای RSS</span>
                </h2>
                <p className={`text-xs ${theme.textMuted} mt-1`}>
                  افزودن دستی منابع مدنظر، تست سلامت فید و فعال/غیرفعال‌سازی هر منبع به صورت مستقل
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddSource(!showAddSource)}
                  className={`px-4 py-2 rounded-xl ${theme.btnPrimary} text-xs flex items-center gap-1.5`}
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن منبع جدید</span>
                </button>
              </div>
            </div>

            {/* Quick Presets Strip */}
            <div className={`p-4 rounded-2xl ${theme.card} border space-y-2`}>
              <span className={`text-xs font-bold ${theme.textMuted}`}>منابع پیشنهادی با یک کلیک (افزودن سریع):</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {presetSources.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAddPresetSource(preset)}
                    className={`px-3 py-1.5 rounded-xl ${theme.btnDark} text-xs font-bold flex items-center gap-1.5 hover:border-red-500/50`}
                  >
                    <Plus className="w-3 h-3 text-red-500" />
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Add Custom Source Form */}
            {showAddSource && (
              <form onSubmit={handleAddCustomSource} className={`p-5 rounded-2xl ${theme.card} border border-red-500/30 space-y-4`}>
                <h3 className="font-bold text-sm text-red-500 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>ثبت منبع جدید اختصاصی:</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>نام وب‌سایت یا خبرگزاری:</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: ورج (The Verge)"
                      value={newSource.name}
                      onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${theme.input}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>آدرس وب‌سایت (اختیاری):</label>
                    <input
                      type="url"
                      placeholder="https://example.com"
                      value={newSource.url}
                      onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${theme.input}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>آدرس فید RSS یا Atom (الزامی):</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      required
                      placeholder="https://example.com/feed یا rss.xml"
                      value={newSource.rssUrl}
                      onChange={(e) => setNewSource({ ...newSource, rssUrl: e.target.value })}
                      className={`flex-1 px-3 py-2 rounded-xl border text-xs font-mono ${theme.input}`}
                    />
                    <button
                      type="button"
                      onClick={handleTestFeedUrl}
                      disabled={feedTesting}
                      className={`px-3 py-2 rounded-xl ${theme.btnDark} text-xs font-bold flex items-center gap-1.5 shrink-0`}
                    >
                      {feedTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5 text-red-500" />}
                      <span>تست زنده فید</span>
                    </button>
                  </div>
                </div>

                {feedTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold ${
                      feedTestResult.success ? 'bg-red-600/15 text-red-400 border border-red-500/30' : 'bg-red-950 text-red-300 border border-red-800'
                    }`}
                  >
                    {feedTestResult.success ? (
                      <div>
                        ✅ فید معتبر است: <b>{feedTestResult.feedTitle}</b> ({feedTestResult.itemCount} مقاله آماده پایش)
                      </div>
                    ) : (
                      <div>❌ فید نامعتبر یا در دسترس نیست: {feedTestResult.error}</div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>دسته‌بندی موضوعی:</label>
                    <select
                      value={newSource.category}
                      onChange={(e) => setNewSource({ ...newSource, category: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${theme.input}`}
                    >
                      <option value="ابزارهای جدید AI">ابزارهای جدید AI</option>
                      <option value="فناوری و موبایل">فناوری و موبایل</option>
                      <option value="استارتاپ و تکنولوژی">استارتاپ و تکنولوژی</option>
                      <option value="هوش مصنوعی عمومی">هوش مصنوعی عمومی</option>
                      <option value="سخت‌افزار و گیمینگ">سخت‌افزار و گیمینگ</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>اولویت منبع (۱ تا ۵):</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={newSource.priority}
                      onChange={(e) => setNewSource({ ...newSource, priority: Number(e.target.value) })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold ${theme.input}`}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSource(false)}
                    className={`px-4 py-2 rounded-xl ${theme.btnDark} text-xs font-bold`}
                  >
                    انصراف
                  </button>
                  <button type="submit" className={`px-5 py-2 rounded-xl ${theme.btnPrimary} text-xs font-bold`}>
                    ثبت منبع اختصاصی
                  </button>
                </div>
              </form>
            )}

            {/* Sources Table */}
            <div className={`p-4 rounded-2xl ${theme.card} border space-y-3`}>
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className={`text-xs font-bold ${theme.textMuted}`}>فهرست منابع فعال و در حال رصد ({sources.length} منبع):</span>
              </div>

              <div className="space-y-2">
                {sources.map((src) => {
                  const isEnabled = src.enabled === 1 || src.enabled === true;
                  return (
                    <div
                      key={src.id}
                      className={`p-3.5 rounded-xl ${theme.inset} border ${theme.border} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleSource(src.id)}
                          className={`w-5 h-5 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
                            isEnabled ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-600'
                          }`}
                        >
                          {isEnabled ? <Check className="w-3.5 h-3.5" /> : null}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs">{src.name}</span>
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                              {src.category}
                            </span>
                            <span className="text-[10px] text-red-500 font-mono">اولویت {src.priority}</span>
                          </div>
                          <p className={`text-[11px] ${theme.textDim} font-mono mt-0.5 truncate max-w-sm sm:max-w-md`} title={src.rssUrl}>
                            {src.rssUrl}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleDeleteSource(src.id, src.name)}
                          className="p-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/20 cursor-pointer transition-colors"
                          title="حذف منبع"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 5. SETTINGS TAB (AI, Telegram & Bot Persona) */}
        {/* ======================================================== */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="font-black text-lg sm:text-xl flex items-center gap-2">
                <Cpu className="w-5 h-5 text-red-500" />
                <span>تنظیمات پیشرفته هوش مصنوعی و اتصال تلگرام</span>
              </h2>
              <p className={`text-xs ${theme.textMuted} mt-1`}>
                تعویض توکن، اتصال ربات جدید، انتخاب ارائه‌دهنده AI، تست آنلاین تأخیر و تنظیم لحن و وظیفه ربات
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5">
              {/* Telegram Token & Channel Info */}
              <div className={`p-5 rounded-2xl ${theme.card} border space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-red-500 flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    <span>۱. توکن ربات و اتصال به کانال تلگرام:</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => fetchTelegramStatus(true)}
                    disabled={checkingTg}
                    className="text-[11px] text-red-500 hover:text-red-400 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${checkingTg ? 'animate-spin' : ''}`} />
                    <span>بررسی زنده اتصال بات</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>توکن ربات تلگرام (از @BotFather):</label>
                    <div className="relative">
                      <input
                        type={showTokens['botToken'] ? 'text' : 'password'}
                        value={aiSettingsForm.botToken}
                        onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, botToken: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${theme.input} pl-9`}
                        placeholder="123456789:ABCdefGhI..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens({ ...showTokens, botToken: !showTokens['botToken'] })}
                        className="absolute left-2.5 top-2.5 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {showTokens['botToken'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-red-500" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>آیدی کانال تلگرام (هدف انتشار):</label>
                    <input
                      type="text"
                      value={aiSettingsForm.channelUsername}
                      onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, channelUsername: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold ${theme.input}`}
                      placeholder="@ChiDidamTest"
                    />
                  </div>
                </div>

                {telegramStatus && (
                  <div className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between ${telegramStatus.connected ? 'bg-red-600/15 text-red-400 border border-red-500/30' : 'bg-red-950 text-red-300 border border-red-800'}`}>
                    <span>{telegramStatus.connected ? `✅ بات @${telegramStatus.bot?.username} به کانال ${telegramStatus.channel?.title} متصل است.` : `❌ ${telegramStatus.error || 'عدم دسترسی به کانال'}`}</span>
                    {telegramStatus.connected && <span className="font-mono text-red-500 font-bold">{telegramStatus.channel?.memberCount} عضو</span>}
                  </div>
                )}
              </div>

              {/* AI Provider & Models Selection */}
              <div className={`p-5 rounded-2xl ${theme.card} border space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-red-500 flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    <span>۲. انتخاب موتور و هوش مصنوعی بازنویسی:</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleTestAiConnection}
                    disabled={testingAi}
                    className={`px-3 py-1.5 rounded-xl ${theme.btnPrimary} text-xs font-bold flex items-center gap-1.5`}
                  >
                    {testingAi ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    <span>تست زنده اتصال AI</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'groq', name: 'Groq (فوق سریع ⚡)' },
                    { id: 'gemini', name: 'Google Gemini' },
                    { id: 'openai', name: 'OpenAI (GPT-4o)' },
                    { id: 'custom', name: 'Custom / محلی' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAiSettingsForm({ ...aiSettingsForm, activeAiProvider: p.id })}
                      className={`p-3 rounded-xl text-center text-xs font-bold transition-all cursor-pointer border ${
                        aiSettingsForm.activeAiProvider === p.id
                          ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30'
                          : `${theme.inset} ${theme.border} hover:border-red-500/50`
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                {/* Groq Settings */}
                {aiSettingsForm.activeAiProvider === 'groq' && (
                  <div className={`p-4 rounded-xl ${theme.inset} space-y-3 border ${theme.border}`}>
                    <label className={`block text-xs font-bold ${theme.textMuted}`}>کلید Groq API Key:</label>
                    <div className="relative">
                      <input
                        type={showTokens['groq'] ? 'text' : 'password'}
                        value={aiSettingsForm.groqApiKey}
                        onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, groqApiKey: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${theme.input} pl-9`}
                        placeholder="gsk_..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens({ ...showTokens, groq: !showTokens['groq'] })}
                        className="absolute left-2.5 top-2.5 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {showTokens['groq'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-red-500" />}
                      </button>
                    </div>

                    <label className={`block text-xs font-bold ${theme.textMuted} mt-2`}>مدل Groq:</label>
                    <input
                      type="text"
                      value={aiSettingsForm.groqModel}
                      onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, groqModel: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold ${theme.input}`}
                      placeholder="openai/gpt-oss-120b یا llama-3.3-70b-versatile"
                    />
                  </div>
                )}

                {/* Gemini Settings */}
                {aiSettingsForm.activeAiProvider === 'gemini' && (
                  <div className={`p-4 rounded-xl ${theme.inset} space-y-3 border ${theme.border}`}>
                    <label className={`block text-xs font-bold ${theme.textMuted}`}>Google Gemini API Key:</label>
                    <div className="relative">
                      <input
                        type={showTokens['gemini'] ? 'text' : 'password'}
                        value={aiSettingsForm.geminiApiKey}
                        onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, geminiApiKey: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${theme.input} pl-9`}
                        placeholder="AIzaSy..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens({ ...showTokens, gemini: !showTokens['gemini'] })}
                        className="absolute left-2.5 top-2.5 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {showTokens['gemini'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-red-500" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* OpenAI / Custom Settings */}
                {(aiSettingsForm.activeAiProvider === 'openai' || aiSettingsForm.activeAiProvider === 'custom') && (
                  <div className={`p-4 rounded-xl ${theme.inset} space-y-3 border ${theme.border}`}>
                    <label className={`block text-xs font-bold ${theme.textMuted}`}>کلید API Key:</label>
                    <div className="relative">
                      <input
                        type={showTokens['openai'] ? 'text' : 'password'}
                        value={aiSettingsForm.openaiApiKey}
                        onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, openaiApiKey: e.target.value })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${theme.input} pl-9`}
                        placeholder="sk-..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens({ ...showTokens, openai: !showTokens['openai'] })}
                        className="absolute left-2.5 top-2.5 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {showTokens['openai'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-red-500" />}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className={`block text-xs font-bold ${theme.textMuted} mb-1`}>نام مدل (Model):</label>
                        <input
                          type="text"
                          value={aiSettingsForm.openaiModel}
                          onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, openaiModel: e.target.value })}
                          className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold ${theme.input}`}
                          placeholder="gpt-4o-mini"
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-bold ${theme.textMuted} mb-1`}>Base URL (در صورت استفاده از پراکسی یا سرور محلی):</label>
                        <input
                          type="text"
                          value={aiSettingsForm.openaiBaseUrl}
                          onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, openaiBaseUrl: e.target.value })}
                          className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${theme.input}`}
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Test Result Card */}
                {aiTestResult && (
                  <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${aiTestResult.success ? 'bg-red-600/15 border-red-500/40 text-red-400' : 'bg-red-950/80 border-red-800 text-red-300'}`}>
                    <div className="flex items-center justify-between font-bold">
                      <span>{aiTestResult.success ? '✅ ارتباط با مدل هوش مصنوعی با موفقیت برقرار شد!' : '❌ خطا در برقراری ارتباط با مدل'}</span>
                      <span className="font-mono text-red-500 font-bold">{aiTestResult.latencyMs}ms</span>
                    </div>
                    <p className={`text-[11px] ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>{aiTestResult.message}</p>
                    {aiTestResult.sample && <p className="text-[10px] font-mono opacity-80 pt-1">نمونه پاسخ: {aiTestResult.sample}</p>}
                  </div>
                )}
              </div>

              {/* Bot Persona, Tone & Custom Prompt */}
              <div className={`p-5 rounded-2xl ${theme.card} border space-y-4`}>
                <h3 className="font-bold text-sm text-red-500 flex items-center gap-2">
                  <Flame className="w-4 h-4" />
                  <span>۳. لحن، هویت و پرامپت اختصاصی ربات:</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {personas.map((p) => {
                    const isSelected = aiSettingsForm.aiPersona === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setAiSettingsForm({ ...aiSettingsForm, aiPersona: p.id })}
                        className={`p-3.5 rounded-xl text-right transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30'
                            : `${theme.inset} ${theme.border} hover:border-red-500/40`
                        }`}
                      >
                        <div className="font-black text-xs">{p.label}</div>
                        <p className={`text-[11px] mt-1 line-clamp-2 ${isSelected ? 'text-white/90' : theme.textMuted}`}>{p.desc}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>توضیح لحن بازنویسی:</label>
                    <input
                      type="text"
                      value={aiSettingsForm.toneOfVoice}
                      onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, toneOfVoice: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${theme.input}`}
                      placeholder="هیجان‌انگیز، خودمانی، جذب‌کننده"
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>هشتگ‌های پیش‌فرض کانال:</label>
                    <input
                      type="text"
                      value={aiSettingsForm.channelHashtags}
                      onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, channelHashtags: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold ${theme.input}`}
                      placeholder="#چی_دیدم #هوش_مصنوعی"
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold ${theme.textMuted} mb-1.5`}>
                    دستورات و پرامپت سفارشی ادمین (وظایف اختصاصی هوش مصنوعی):
                  </label>
                  <textarea
                    rows={4}
                    value={aiSettingsForm.customPromptInstructions}
                    onChange={(e) => setAiSettingsForm({ ...aiSettingsForm, customPromptInstructions: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border text-xs leading-relaxed ${theme.input}`}
                    placeholder="مثال: همیشه در انتهای هر پست بگو به چه دردی می‌خوره، از کلمات سخت استفاده نکن، فقط اخبار مربوط به مدل‌های زبانی رایگان را اولویت بده..."
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className={`px-6 py-2.5 rounded-xl ${theme.btnPrimary} text-xs flex items-center gap-2`}
                >
                  {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>ذخیره تنظیمات هوش مصنوعی و ربات</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* 6. LOGS TAB */}
        {/* ======================================================== */}
        {activeTab === 'logs' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-lg sm:text-xl flex items-center gap-2">
                  <Layers className="w-5 h-5 text-red-500" />
                  <span>لاگ‌های زنده فعالیت سیستم «چی دیدم»</span>
                </h2>
                <p className={`text-xs ${theme.textMuted} mt-1`}>گزارش لحظه‌ای پایش فیدها، هوش مصنوعی، و تراکنش‌های ربات تلگرام</p>
              </div>

              <button
                onClick={fetchLogs}
                className={`px-3 py-1.5 rounded-xl ${theme.btnDark} text-xs font-bold flex items-center gap-1.5`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>بروزرسانی لاگ‌ها</span>
              </button>
            </div>

            <div className={`p-4 rounded-2xl ${theme.card} border font-mono text-xs space-y-2 max-h-[600px] overflow-y-auto`}>
              {logs.length === 0 ? (
                <p className={`text-center py-8 ${theme.textDim}`}>هنوز لاگی ثبت نشده است.</p>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2.5 rounded-xl flex items-start gap-3 border ${
                      log.level === 'error'
                        ? 'bg-red-950/40 border-red-800 text-red-300'
                        : log.level === 'warn'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                        : `${theme.inset} border-white/5 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`
                    }`}
                  >
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-black shrink-0 ${
                        log.level === 'error'
                          ? 'bg-red-600 text-white'
                          : log.level === 'warn'
                          ? 'bg-zinc-700 text-white'
                          : 'bg-red-950 text-red-400'
                      }`}
                    >
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-zinc-500 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString('fa-IR')}
                    </span>
                    <span className="font-bold text-red-500 shrink-0">[{log.source}]</span>
                    <span className="flex-1 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Glassmorphic Red & Black Mobile Bottom Navigation Bar */}
      <nav className={`md:hidden fixed bottom-3 left-3 right-3 z-40 backdrop-blur-2xl ${theme.headerBg} border rounded-2xl p-1.5 shadow-2xl flex items-center justify-around`}>
        {[
          { id: 'dashboard', label: 'داشبورد', icon: Activity },
          { id: 'chatbot', label: 'چت‌بات AI', icon: Sparkles },
          { id: 'scheduler', label: 'زمان‌بندی', icon: Clock },
          { id: 'posts', label: 'پست‌ها', icon: FileText, badge: posts.length },
          { id: 'settings', label: 'تنظیمات', icon: Cpu }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer relative ${
                isActive ? 'bg-red-600 text-white font-black shadow-md shadow-red-600/30' : theme.inactiveTab
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px]">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && !isActive && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 text-white rounded-full text-[9px] flex items-center justify-center font-mono font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
