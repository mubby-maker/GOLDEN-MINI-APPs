import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Home,
  Coins,
  Users,
  Wallet,
  Menu,
  Crown,
  Gift,
  Copy,
  Check,
  Share2,
  ShieldCheck,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// ==========================================
// 1. SUPABASE & APP CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://rtgjephpftbwmyttfxig.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZxuSWqSRU1cnnHpeqAndpg_wjFNPctR';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_TELEGRAM_ID = 9278551040;
const BOT_USERNAME = 'AllGoldenbot';
const DEFAULT_DEPOSIT_WALLET = '0xF8354B188fAC6B6341273641de4F014921F82032';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [user, setUser] = useState(null);
  const [depositWallet, setDepositWallet] = useState(DEFAULT_DEPOSIT_WALLET);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Plan Upgrade Modal State
  const [selectedPlanModal, setSelectedPlanModal] = useState(null); // 'normal' | 'premium' | null
  const [txHashInput, setTxHashInput] = useState('');
  const [submittingPlan, setSubmittingPlan] = useState(false);

  // Promo Code State
  const [promoInput, setPromoInput] = useState('');
  const [redeemingPromo, setRedeemingPromo] = useState(false);

  // Live 24-Hour Countdown State
  const [nowTs, setNowTs] = useState(Date.now());
  const [coinActionLoading, setCoinActionLoading] = useState(false);

  // Referrals Data
  const [referrals, setReferrals] = useState([]);
  const [copiedKey, setCopiedKey] = useState('');

  // Wallet & Withdrawals State
  const [walletInput, setWalletInput] = useState('');
  const [savingWallet, setSavingWallet] = useState(false);
  const [withdrawSource, setWithdrawSource] = useState('daily'); // 'daily' ($5 min) | 'referral' ($10 min)
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawalHistory, setWithdrawalHistory] = useState([]);

  // Admin Panel State (Only loaded for ID 9278551040)
  const [adminSubTab, setAdminSubTab] = useState('payments'); // 'payments' | 'withdrawals' | 'promos' | 'settings'
  const [pendingPayments, setPendingPayments] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [promoList, setPromoList] = useState([]);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoAmount, setNewPromoAmount] = useState('');
  const [newPromoUses, setNewPromoUses] = useState('50');
  const [adminWalletEdit, setAdminWalletEdit] = useState(DEFAULT_DEPOSIT_WALLET);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Copied to clipboard!');
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // Tick every second for live 24h Golden Coin countdown
  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize Telegram WebApp & Authenticate User
  useEffect(() => {
    const initApp = async () => {
      try {
        const tg = window.Telegram?.WebApp;
        if (tg) {
          tg.ready();
          tg.expand();
          tg.setHeaderColor('#F8F9FA');
        }

        const tgUser = tg?.initDataUnsafe?.user;
        const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(window.location.search).get('startapp') || '';

                const initData = tg?.initData;
        if (!initData || !tgUser?.id) {
          window.location.replace('https://t.me/AllGoldenbot');
          setLoading(false);
          return;
        }

        const telegramId = tgUser.id;
        const username = tgUser.username || '';
        const firstName = tgUser.first_name || 'Member';
        const lastName = tgUser.last_name || '';


        // Load deposit address from settings
        const { data: settingsData } = await supabase
          .from('app_settings')
          .select('bep20_deposit_address')
          .eq('id', 1)
          .single();

        if (settingsData?.bep20_deposit_address) {
          setDepositWallet(settingsData.bep20_deposit_address);
          setAdminWalletEdit(settingsData.bep20_deposit_address);
        }

        // Register or fetch user via RPC
        const { data: userData, error } = await supabase.rpc('register_or_get_user', {
          p_telegram_id: telegramId,
          p_username: username,
          p_first_name: firstName,
          p_last_name: lastName,
          p_ref_code: startParam,
        });

        if (error) throw error;
        setUser(userData);
        setWalletInput(userData.bep20_wallet || '');

        await loadUserExtras(telegramId);
        if (telegramId === ADMIN_TELEGRAM_ID) {
          await loadAdminData();
        }
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Failed to connect to server', 'error');
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  const loadUserExtras = async (telegramId) => {
    const [{ data: refs }, { data: wds }] = await Promise.all([
      supabase
        .from('users')
        .select('telegram_id, first_name, username, active_plan, referral_qualified, created_at')
        .eq('referred_by', telegramId)
        .order('created_at', { ascending: false }),
      supabase
        .from('withdrawals')
        .select('*')
        .eq('telegram_id', telegramId)
        .order('created_at', { ascending: false }),
    ]);
    setReferrals(refs || []);
    setWithdrawalHistory(wds || []);
  };

  const loadAdminData = async () => {
    const [{ data: pays }, { data: wds }, { data: promos }] = await Promise.all([
      supabase
        .from('plan_payments')
        .select('*, users(first_name, username)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('withdrawals')
        .select('*, users(first_name, username)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);
    setPendingPayments(pays || []);
    setPendingWithdrawals(wds || []);
    setPromoList(promos || []);
  };

  const isAdmin = Number(user?.telegram_id) === ADMIN_TELEGRAM_ID;

  // Check active plan & expiry
  const planStatus = useMemo(() => {
    if (!user || user.active_plan === 'none' || !user.plan_expires_at) {
      return { active: false, plan: 'none', daysLeft: 0, dailyRate: 0 };
    }
    const exp = new Date(user.plan_expires_at).getTime();
    if (exp <= nowTs) {
      return { active: false, plan: 'expired', daysLeft: 0, dailyRate: 0 };
    }
    const daysLeft = Math.ceil((exp - nowTs) / (1000 * 60 * 60 * 24));
    const dailyRate = user.active_plan === 'premium' ? 2.5 : 1.0;
    return { active: true, plan: user.active_plan, daysLeft, dailyRate };
  }, [user, nowTs]);

  // 24-Hour Golden Coin Timer State
  const miningStatus = useMemo(() => {
    if (!user?.mining_started_at) {
      return { state: 'idle', remainingMs: 0, formatted: '24:00:00', progress: 0 };
    }
    const startMs = new Date(user.mining_started_at).getTime();
    const endMs = startMs + 24 * 60 * 60 * 1000;
    const remainingMs = Math.max(0, endMs - nowTs);

    if (remainingMs === 0) {
      return { state: 'ready', remainingMs: 0, formatted: '00:00:00', progress: 100 };
    }

    const hrs = Math.floor(remainingMs / (1000 * 60 * 60));
    const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((remainingMs % (1000 * 60)) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const progress = Math.min(100, Math.round(((24 * 3600 * 1000 - remainingMs) / (24 * 3600 * 1000)) * 100));

    return {
      state: 'running',
      remainingMs,
      formatted: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`,
      progress,
    };
  }, [user, nowTs]);

  // Combined Available Balance
  const totalAvailableBalance = Number(user?.daily_balance || 0) + Number(user?.referral_balance || 0);

  // Handlers
  const handleSubmitPlanPayment = async (e) => {
    e.preventDefault();
    if (!txHashInput.trim() || txHashInput.trim().length < 12) {
      return showToast('Enter a valid USDT BEP20 Transaction Hash (TxID)', 'error');
    }
    setSubmittingPlan(true);
    try {
      const amount = selectedPlanModal === 'premium' ? 3.0 : 1.0;
      const { error } = await supabase.from('plan_payments').insert({
        telegram_id: user.telegram_id,
        plan_type: selectedPlanModal,
        amount,
        tx_hash: txHashInput.trim(),
      });
      if (error) {
        if (error.code === '23505') throw new Error('This Transaction Hash has already been submitted.');
        throw error;
      }
      showToast('Payment submitted! Admin will verify and activate shortly.');
      setSelectedPlanModal(null);
      setTxHashInput('');
      if (isAdmin) await loadAdminData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingPlan(false);
    }
  };

  const handleStartCoin = async () => {
    if (!planStatus.active) {
      showToast('Activate Normal ($1) or Premium ($3) plan on Home first!', 'error');
      setActiveTab('home');
      return;
    }
    setCoinActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('start_daily_mining', {
        p_telegram_id: user.telegram_id,
      });
      if (error) throw error;
      setUser(data);
      showToast('Golden Coin is rolling! Come back in 24 hours to claim.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCoinActionLoading(false);
    }
  };

  const handleClaimCoin = async () => {
    setCoinActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('claim_daily_mining', {
        p_telegram_id: user.telegram_id,
      });
      if (error) throw error;
      setUser(data);
      showToast(`Claimed +$${planStatus.dailyRate.toFixed(2)} Daily Reward!`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCoinActionLoading(false);
    }
  };

  const handleRedeemPromo = async (e) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    setRedeemingPromo(true);
    try {
      const { data, error } = await supabase.rpc('redeem_promo_code', {
        p_telegram_id: user.telegram_id,
        p_code: promoInput.trim(),
      });
      if (error) throw error;
      setUser(data);
      setPromoInput('');
      showToast('Promo code redeemed! Bonus added to Daily Balance.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRedeemingPromo(false);
    }
  };

  const handleSaveWallet = async (e) => {
    e.preventDefault();
    if (!walletInput.trim() || !walletInput.trim().startsWith('0x') || walletInput.trim().length < 20) {
      return showToast('Enter a valid BEP20 wallet address starting with 0x', 'error');
    }
    setSavingWallet(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ bep20_wallet: walletInput.trim() })
        .eq('telegram_id', user.telegram_id)
        .select()
        .single();
      if (error) throw error;
      setUser(data);
      showToast('USDT BEP20 withdrawal address saved!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingWallet(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    const minReq = withdrawSource === 'daily' ? 5.0 : 10.0;
    if (isNaN(amt) || amt < minReq) {
      return showToast(`Minimum withdrawal for ${withdrawSource === 'daily' ? 'Daily Reward' : 'Referral'} is $${minReq.toFixed(2)}`, 'error');
    }
    if (!user.bep20_wallet && !walletInput.trim()) {
      return showToast('Save your USDT BEP20 wallet address first', 'error');
    }
    setWithdrawing(true);
    try {
      const { data, error } = await supabase.rpc('request_withdrawal', {
        p_telegram_id: user.telegram_id,
        p_source: withdrawSource,
        p_amount: amt,
        p_wallet: user.bep20_wallet || walletInput.trim(),
      });
      if (error) throw error;
      setUser(data);
      setWithdrawAmount('');
      await loadUserExtras(user.telegram_id);
      if (isAdmin) await loadAdminData();
      showToast('Withdrawal request submitted for Admin approval!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  // Admin Actions
  const handleAdminPayment = async (paymentId, action) => {
    try {
      const { error } = await supabase.rpc('admin_review_payment', {
        p_admin_id: ADMIN_TELEGRAM_ID,
        p_payment_id: paymentId,
        p_action: action,
      });
      if (error) throw error;
      showToast(`Payment ${action}!`);
      await loadAdminData();
      // Refresh admin's own profile in case admin approved their own Premium upgrade
      const { data: refreshed } = await supabase.from('users').select('*').eq('telegram_id', ADMIN_TELEGRAM_ID).single();
      if (refreshed) setUser(refreshed);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAdminWithdrawal = async (withdrawalId, action) => {
    try {
      const { error } = await supabase.rpc('admin_review_withdrawal', {
        p_admin_id: ADMIN_TELEGRAM_ID,
        p_withdrawal_id: withdrawalId,
        p_action: action,
      });
      if (error) throw error;
      showToast(`Withdrawal ${action}!`);
      await loadAdminData();
      const { data: refreshed } = await supabase.from('users').select('*').eq('telegram_id', ADMIN_TELEGRAM_ID).single();
      if (refreshed) setUser(refreshed);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCreatePromo = async (e) => {
    e.preventDefault();
    if (!newPromoCode.trim() || !newPromoAmount) return;
    try {
      const { error } = await supabase.from('promo_codes').insert({
        code: newPromoCode.trim().toUpperCase(),
        reward_amount: parseFloat(newPromoAmount),
        max_uses: parseInt(newPromoUses, 10) || 100,
      });
      if (error) throw error;
      setNewPromoCode('');
      setNewPromoAmount('');
      showToast('Promo code created!');
      await loadAdminData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateDepositWallet = async (e) => {
    e.preventDefault();
    if (!adminWalletEdit.trim()) return;
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ bep20_deposit_address: adminWalletEdit.trim(), updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      setDepositWallet(adminWalletEdit.trim());
      showToast('Deposit BEP20 wallet updated!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200 flex items-center justify-center shadow-lg animate-spin">
          <Crown className="w-8 h-8 text-slate-900" />
        </div>
        <p className="mt-4 font-bold tracking-widest text-amber-700 text-sm">LOADING GOLDEN...</p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F1E36] text-white flex flex-col items-center justify-center p-6 text-center">
        <Crown className="w-14 h-14 text-amber-400 mb-3" />
        <h2 className="text-xl font-extrabold">GOLDEN Mini App</h2>
        <p className="text-xs text-slate-300 mt-1 mb-5">This app only works inside Telegram.</p>
        <a
          href="https://t.me/AllGoldenbot"
          className="px-6 py-3.5 rounded-2xl bg-amber-400 text-slate-950 font-extrabold text-sm"
        >
          Open in Telegram
        </a>
      </div>
    );
  }

  const referralLink = `https://t.me/${BOT_USERNAME}?startapp=${user?.referral_code || ''}`;
  const qualifiedCount = referrals.filter((r) => r.referral_qualified).length;

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-slate-900 pb-24 max-w-md mx-auto relative font-sans">
      {/* Custom Coin Spin CSS */}
      <style>{`
        @keyframes coinSpin3D {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
        .animate-coin-spin {
          animation: coinSpin3D 2.4s linear infinite;
          transform-style: preserve-3d;
        }
      `}</style>

      {/* Top Mini App Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="w-12" />
        <div className="text-center">
          <h1 className="font-extrabold text-base tracking-tight text-slate-900 flex items-center justify-center gap-1">
            GOLDEN <Crown className="w-4 h-4 text-amber-500 fill-amber-400" />
          </h1>
          <p className="text-[11px] text-slate-400 font-medium leading-none">mini app</p>
        </div>
        <div className="w-12 flex justify-end">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase">
            {planStatus.active ? planStatus.plan : 'Free'}
          </span>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-lg text-xs font-semibold flex items-center gap-2 max-w-[90%] ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-amber-300'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ==========================================
          TAB 1: HOME SCREEN
         ========================================== */}
      {activeTab === 'home' && (
        <main className="p-4 space-y-4">
          {/* Greeting Row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-wider text-amber-600 uppercase">GOLDEN REWARDS</p>
              <h2 className="text-2xl font-extrabold text-slate-900">
                Hi, {user?.first_name || 'Member'} 👋
              </h2>
            </div>
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-amber-400 flex items-center justify-center shadow">
              <Crown className="w-5 h-5 text-amber-400 fill-amber-400" />
            </div>
          </div>

          {/* Main Balance Card (Navy & Gold Gradient matching GOLDEN branding) */}
          <div className="rounded-3xl bg-gradient-to-br from-[#0F1E36] via-[#13294B] to-[#6B4E16] p-5 text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-amber-400/10 pointer-events-none" />
            <p className="text-xs text-slate-300 font-medium">Available balance</p>
            <div className="text-4xl font-extrabold text-amber-400 mt-1 tracking-tight">
              ${totalAvailableBalance.toFixed(2)}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/10 text-xs">
              <div>
                <p className="text-slate-300 text-[11px]">Daily Bal.</p>
                <p className="font-bold text-white mt-0.5">${Number(user?.daily_balance || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-300 text-[11px]">Referral Bal.</p>
                <p className="font-bold text-white mt-0.5">${Number(user?.referral_balance || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-300 text-[11px]">Total earned</p>
                <p className="font-bold text-amber-300 mt-0.5">${Number(user?.total_earned || 0).toFixed(2)}</p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('wallet')}
              className="mt-4 w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-sm shadow-md active:scale-[0.99] transition"
            >
              Withdraw
            </button>
          </div>

          {/* Membership Plan Selector Card (Replaces "Do tasks" from reference) */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Choose Earning Plan</h3>
                <p className="text-xs text-slate-500">
                  {planStatus.active
                    ? `Active: ${planStatus.plan.toUpperCase()} (${planStatus.daysLeft}d left)`
                    : 'Select Normal or Premium to start earning'}
                </p>
              </div>
              <Crown className="w-5 h-5 text-amber-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Normal Earning Plan */}
              <div
                className={`rounded-2xl p-3.5 border-2 transition flex flex-col justify-between ${
                  planStatus.active && planStatus.plan === 'normal'
                    ? 'border-amber-500 bg-amber-50/50'
                    : 'border-slate-100 bg-slate-50/70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase text-slate-700">Normal</span>
                    <span className="text-xs font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                      {isAdmin ? 'FREE' : '$1.00'}
                    </span>
                  </div>
                  <p className="text-xl font-extrabold text-slate-900 mt-2">
                    $1.00<span className="text-xs font-medium text-slate-500">/24h</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Valid for 30 days</p>
                </div>

                <button
                  onClick={() => {
                    if (isAdmin) {
                      showToast('Normal plan is permanently free for Admin!');
                    } else {
                      setSelectedPlanModal('normal');
                    }
                  }}
                  className="mt-3 w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
                >
                  {planStatus.active && planStatus.plan === 'normal' ? 'Active / Renew' : 'Select Normal'}
                </button>
              </div>

              {/* Premium Earning Plan */}
              <div
                className={`rounded-2xl p-3.5 border-2 transition flex flex-col justify-between relative overflow-hidden ${
                  planStatus.active && planStatus.plan === 'premium'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-amber-300/70 bg-gradient-to-b from-amber-50/60 to-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase text-amber-800 flex items-center gap-1">
                      Premium <Sparkles className="w-3 h-3 text-amber-500" />
                    </span>
                    <span className="text-xs font-black text-slate-900 bg-amber-400 px-2 py-0.5 rounded-full">
                      $3.00
                    </span>
                  </div>
                  <p className="text-xl font-extrabold text-slate-900 mt-2">
                    $2.50<span className="text-xs font-medium text-slate-500">/24h</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Valid for 25 days</p>
                </div>

                <button
                  onClick={() => setSelectedPlanModal('premium')}
                  className="mt-3 w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 text-xs font-extrabold shadow-sm"
                >
                  {planStatus.active && planStatus.plan === 'premium' ? 'Active / Renew' : 'Go Premium'}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Action Grid: Daily Coin + Invite Friends */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setActiveTab('earn')}
              className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 text-left active:scale-[0.98] transition"
            >
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-3">
                <Coins className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-900">Daily Coin</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {miningStatus.state === 'ready'
                  ? 'Ready to claim!'
                  : miningStatus.state === 'running'
                  ? miningStatus.formatted
                  : 'Tap to start 24h'}
              </p>
            </button>

            <button
              onClick={() => setActiveTab('invite')}
              className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 text-left active:scale-[0.98] transition"
            >
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-3">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-900">Invite friends</h4>
              <p className="text-xs text-slate-500 mt-0.5">$0.70 per friend</p>
            </button>
          </div>

          {/* Have a promo code? Card */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="w-5 h-5 text-amber-500" />
              <h3 className="font-extrabold text-sm text-slate-900">Have a promo code?</h3>
            </div>
            <form onSubmit={handleRedeemPromo} className="flex gap-2">
              <input
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                className="flex-1 bg-slate-100 rounded-2xl px-4 py-3 text-xs font-bold tracking-wider uppercase outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="submit"
                disabled={redeemingPromo}
                className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs transition disabled:opacity-50"
              >
                {redeemingPromo ? '...' : 'Redeem'}
              </button>
            </form>
          </div>
        </main>
      )}

      {/* ==========================================
          TAB 2: DAILY EARNING (BIG ROLLING GOLD COIN)
         ========================================== */}
      {activeTab === 'earn' && (
        <main className="p-4 space-y-5">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Daily Earning</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Start the Golden Coin and claim after 24 hours.
            </p>
          </div>

          {/* Active Plan Banner */}
          <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase font-bold text-slate-400">Current Membership</p>
              <p className="font-extrabold text-base text-slate-900 capitalize mt-0.5">
                {planStatus.active ? `${planStatus.plan} Plan` : 'No Active Plan'}
              </p>
              {planStatus.active && (
                <p className="text-xs text-amber-600 font-semibold">{planStatus.daysLeft} days remaining</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase font-bold text-slate-400">24h Reward</p>
              <p className="font-extrabold text-xl text-amber-600">
                ${planStatus.active ? planStatus.dailyRate.toFixed(2) : '0.00'}
              </p>
            </div>
          </div>

          {/* Big Rolling Golden Coin Centerpiece */}
          <div className="bg-gradient-to-b from-[#0F1E36] to-[#1A2E4C] rounded-3xl p-6 text-white shadow-xl flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),transparent_70%)] pointer-events-none" />

            <span className="text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-white/10 text-amber-300 mb-6">
              {miningStatus.state === 'running'
                ? 'Coin Rolling • Mining Active'
                : miningStatus.state === 'ready'
                ? '24 Hours Completed!'
                : 'Ready to Roll'}
            </span>

            {/* 3D Gold Coin */}
            <div className="relative my-2 flex items-center justify-center">
              <div
                className={`w-44 h-44 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200 p-2 shadow-[0_0_45px_rgba(245,158,11,0.55)] flex items-center justify-center ${
                  miningStatus.state === 'running' ? 'animate-coin-spin' : ''
                }`}
              >
                <div className="w-full h-full rounded-full border-4 border-amber-700/40 bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600 flex flex-col items-center justify-center shadow-inner">
                  <Crown className="w-12 h-12 text-amber-950 fill-amber-900/80 mb-1" />
                  <span className="font-black text-xl tracking-widest text-amber-950">GOLDEN</span>
                  <span className="text-[11px] font-extrabold text-amber-900 mt-0.5">
                    +${planStatus.active ? planStatus.dailyRate.toFixed(2) : '1.00 / $2.50'}
                  </span>
                </div>
              </div>
            </div>

            {/* 24-Hour Countdown Display */}
            <div className="mt-6 w-full">
              <p className="text-xs text-slate-300">Time Remaining</p>
              <div className="text-3xl font-mono font-extrabold text-amber-400 tracking-wider mt-1">
                {miningStatus.formatted}
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-500"
                  style={{ width: `${miningStatus.progress}%` }}
                />
              </div>
            </div>

            {/* Start / Rolling / Claim Action Button */}
            <div className="w-full mt-6">
              {!planStatus.active ? (
                <button
                  onClick={() => setActiveTab('home')}
                  className="w-full py-3.5 rounded-2xl bg-amber-400 text-slate-950 font-extrabold text-sm shadow-lg"
                >
                  Activate Plan First
                </button>
              ) : miningStatus.state === 'idle' ? (
                <button
                  onClick={handleStartCoin}
                  disabled={coinActionLoading}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-sm shadow-lg active:scale-[0.98] transition"
                >
                  {coinActionLoading ? 'Starting...' : 'Start 24h Earning'}
                </button>
              ) : miningStatus.state === 'running' ? (
                <button
                  disabled
                  className="w-full py-3.5 rounded-2xl bg-white/15 text-amber-200 font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <Clock className="w-4 h-4 animate-pulse" />
                  Rolling... Claim after 24hrs
                </button>
              ) : (
                <button
                  onClick={handleClaimCoin}
                  disabled={coinActionLoading}
                  className="w-full py-3.5 rounded-2xl bg-emerald-400 text-slate-950 font-extrabold text-sm shadow-lg animate-bounce"
                >
                  {coinActionLoading ? 'Claiming...' : `Claim $${planStatus.dailyRate.toFixed(2)} Reward`}
                </button>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ==========================================
          TAB 3: INVITE FRIENDS ($0.70 PER QUALIFIED)
         ========================================== */}
      {activeTab === 'invite' && (
        <main className="p-4 space-y-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Invite friends</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Earn <span className="font-bold text-amber-600">$0.70</span> for every friend who joins and activates a membership plan.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Invite friends</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Share your link. Reward unlocks once they pay for Normal or Premium.
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-extrabold text-slate-900">{referrals.length}</span>
                <p className="text-[11px] text-slate-400">invited</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
              <p className="text-[11px] text-slate-400 font-medium">Your code</p>
              <p className="text-lg font-extrabold tracking-widest text-slate-900 mt-0.5">
                {user?.referral_code}
              </p>
              <p className="text-xs text-slate-500 break-all mt-1.5">{referralLink}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => copyText(referralLink, 'reflink')}
                className="py-3 rounded-2xl border border-slate-200 font-bold text-xs text-slate-800 flex items-center justify-center gap-1.5 active:bg-slate-50"
              >
                {copiedKey === 'reflink' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                Copy link
              </button>
              <button
                onClick={() => {
                  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
                    referralLink
                  )}&text=${encodeURIComponent('Join GOLDEN and earn daily USDT rewards!')}`;
                  if (window.Telegram?.WebApp?.openTelegramLink) {
                    window.Telegram.WebApp.openTelegramLink(shareUrl);
                  } else {
                    window.open(shareUrl, '_blank');
                  }
                }}
                className="py-3 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>

          {/* 3-Column Referral Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-3.5 text-center shadow-sm border border-slate-100">
              <p className="text-xl font-extrabold text-slate-900">{referrals.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Invited</p>
            </div>
            <div className="bg-white rounded-2xl p-3.5 text-center shadow-sm border border-slate-100">
              <p className="text-xl font-extrabold text-slate-900">{qualifiedCount}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Qualified</p>
            </div>
            <div className="bg-white rounded-2xl p-3.5 text-center shadow-sm border border-slate-100">
              <p className="text-xl font-extrabold text-amber-600">
                ${(qualifiedCount * 0.7).toFixed(2)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Earned</p>
            </div>
          </div>

          {/* Friends List */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            <h3 className="font-extrabold text-sm text-slate-900 mb-3">Your friends</h3>
            {referrals.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No one yet — share your link to start earning!
              </p>
            ) : (
              <div className="space-y-2.5">
                {referrals.map((ref) => (
                  <div
                    key={ref.telegram_id}
                    className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-800">{ref.first_name || 'Member'}</p>
                      <p className="text-[11px] text-slate-400">
                        {ref.referral_qualified ? 'Membership Confirmed' : 'Pending Plan Payment'}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${
                        ref.referral_qualified
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {ref.referral_qualified ? '+$0.70' : 'Unpaid'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ==========================================
          TAB 4: WALLET ($5 DAILY MIN / $10 REFERRAL MIN)
         ========================================== */}
      {activeTab === 'wallet' && (
        <main className="p-4 space-y-4">
          {/* Top Compact Summary */}
          <div className="rounded-3xl bg-gradient-to-r from-[#0F1E36] to-[#4A3510] p-4 text-white grid grid-cols-3 gap-2 text-center shadow">
            <div>
              <p className="text-[11px] text-slate-300">Daily Bal.</p>
              <p className="font-extrabold text-base text-amber-400">
                ${Number(user?.daily_balance || 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-300">Referral Bal.</p>
              <p className="font-extrabold text-base text-amber-400">
                ${Number(user?.referral_balance || 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-300">Withdrawing</p>
              <p className="font-extrabold text-base text-white">
                ${Number(user?.pending_withdrawal || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* USDT BEP20 Wallet Address Card */}
          <form onSubmit={handleSaveWallet} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
            <h3 className="font-extrabold text-base text-slate-900">USDT (BEP20) Wallet</h3>
            <input
              type="text"
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              placeholder="Enter your 0x... BEP20 wallet address"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-mono outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={savingWallet}
              className="w-full py-3 rounded-2xl bg-slate-900 text-white font-extrabold text-xs"
            >
              {savingWallet ? 'Saving...' : 'Save BEP20 Address'}
            </button>
          </form>

          {/* Withdraw Card */}
          <form onSubmit={handleWithdraw} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
            <h3 className="font-extrabold text-base text-slate-900">Withdraw USDT</h3>

            {/* Balance Source Selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWithdrawSource('daily')}
                className={`p-2.5 rounded-2xl border text-left transition ${
                  withdrawSource === 'daily'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <p className="text-[11px] font-bold text-slate-500">Daily Reward</p>
                <p className="text-sm font-extrabold text-slate-900">
                  ${Number(user?.daily_balance || 0).toFixed(2)}
                </p>
                <p className="text-[10px] text-amber-700 font-semibold mt-0.5">Min $5.00</p>
              </button>

              <button
                type="button"
                onClick={() => setWithdrawSource('referral')}
                className={`p-2.5 rounded-2xl border text-left transition ${
                  withdrawSource === 'referral'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <p className="text-[11px] font-bold text-slate-500">Referral Bonus</p>
                <p className="text-sm font-extrabold text-slate-900">
                  ${Number(user?.referral_balance || 0).toFixed(2)}
                </p>
                <p className="text-[10px] text-amber-700 font-semibold mt-0.5">Min $10.00</p>
              </button>
            </div>

            <div className="relative">
              <input
                type="number"
                step="0.01"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder={withdrawSource === 'daily' ? '$ Min 5.00' : '$ Min 10.00'}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() =>
                  setWithdrawAmount(
                    withdrawSource === 'daily'
                      ? String(user?.daily_balance || 0)
                      : String(user?.referral_balance || 0)
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-amber-600"
              >
                Use full balance
              </button>
            </div>

            <button
              type="submit"
              disabled={withdrawing}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-xs shadow-sm disabled:opacity-50"
            >
              {withdrawing
                ? 'Processing...'
                : user?.bep20_wallet
                ? 'Request USDT BEP20 Withdrawal'
                : 'Save BEP20 wallet address first'}
            </button>
          </form>

          {/* Withdrawal History */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            <h3 className="font-extrabold text-sm text-slate-900 mb-3">History</h3>
            {withdrawalHistory.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No withdrawals yet.</p>
            ) : (
              <div className="space-y-2.5">
                {withdrawalHistory.map((wd) => (
                  <div key={wd.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">
                        ${Number(wd.amount).toFixed(2)} USDT ({wd.source_balance})
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">
                        {wd.bep20_wallet}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
                        wd.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : wd.status === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {wd.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ==========================================
          TAB 5: ADMIN PANEL (ONLY FOR ID 9278551040)
         ========================================== */}
      {activeTab === 'admin' && isAdmin && (
        <main className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                Admin Control • ID {ADMIN_TELEGRAM_ID}
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-1">GOLDEN Admin Panel</h2>
            </div>
            <button
              onClick={loadAdminData}
              className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Admin Sub-Tabs */}
          <div className="grid grid-cols-4 gap-1.5 bg-slate-200/70 p-1 rounded-2xl text-[11px] font-bold">
            {[
              { id: 'payments', label: `Plans (${pendingPayments.length})` },
              { id: 'withdrawals', label: `Payouts (${pendingWithdrawals.length})` },
              { id: 'promos', label: 'Promos' },
              { id: 'settings', label: 'Wallet' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setAdminSubTab(t.id)}
                className={`py-2 rounded-xl transition ${
                  adminSubTab === t.id ? 'bg-slate-900 text-amber-400 shadow-sm' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Subtab 1: Pending Plan Deposits */}
          {adminSubTab === 'payments' && (
            <div className="space-y-3">
              {pendingPayments.length === 0 ? (
                <div className="bg-white rounded-3xl p-6 text-center text-xs text-slate-400">
                  No pending plan deposits.
                </div>
              ) : (
                pendingPayments.map((pay) => (
                  <div key={pay.id} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-extrabold text-slate-900">
                          {pay.users?.first_name || 'User'} (ID: {pay.telegram_id})
                        </p>
                        <p className="text-xs font-bold text-amber-600 uppercase mt-0.5">
                          {pay.plan_type} Plan — ${Number(pay.amount).toFixed(2)} USDT
                        </p>
                      </div>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                        Pending
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-600 break-all">{pay.tx_hash}</span>
                      <button onClick={() => copyText(pay.tx_hash, pay.id)} className="shrink-0 text-slate-500">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleAdminPayment(pay.id, 'approved')}
                        className="py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve (+$0.70 Ref)
                      </button>
                      <button
                        onClick={() => handleAdminPayment(pay.id, 'rejected')}
                        className="py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Subtab 2: Pending Withdrawals */}
          {adminSubTab === 'withdrawals' && (
            <div className="space-y-3">
              {pendingWithdrawals.length === 0 ? (
                <div className="bg-white rounded-3xl p-6 text-center text-xs text-slate-400">
                  No pending withdrawal requests.
                </div>
              ) : (
                pendingWithdrawals.map((wd) => (
                  <div key={wd.id} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-extrabold text-slate-900">
                          {wd.users?.first_name || 'User'} (ID: {wd.telegram_id})
                        </p>
                        <p className="text-sm font-extrabold text-emerald-700 mt-0.5">
                          ${Number(wd.amount).toFixed(2)} USDT ({wd.source_balance})
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-700 break-all">{wd.bep20_wallet}</span>
                      <button onClick={() => copyText(wd.bep20_wallet, wd.id)} className="shrink-0 text-slate-500">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleAdminWithdrawal(wd.id, 'approved')}
                        className="py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs"
                      >
                        Mark Paid
                      </button>
                      <button
                        onClick={() => handleAdminWithdrawal(wd.id, 'rejected')}
                        className="py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs"
                      >
                        Reject & Refund
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Subtab 3: Create Promo Codes */}
          {adminSubTab === 'promos' && (
            <div className="space-y-3">
              <form onSubmit={handleCreatePromo} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
                <h3 className="font-extrabold text-sm text-slate-900">Create New Promo Code</h3>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newPromoCode}
                    onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold uppercase"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={newPromoAmount}
                    onChange={(e) => setNewPromoAmount(e.target.value)}
                    placeholder="$ Reward"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold"
                  />
                  <input
                    type="number"
                    value={newPromoUses}
                    onChange={(e) => setNewPromoUses(e.target.value)}
                    placeholder="Max Uses"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold"
                  />
                </div>
                <button type="submit" className="w-full py-2.5 rounded-xl bg-slate-900 text-amber-400 font-bold text-xs">
                  Create Promo Code
                </button>
              </form>

              <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-2">
                {promoList.map((p) => (
                  <div key={p.code} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-50 last:border-0">
                    <div>
                      <span className="font-extrabold text-slate-900">{p.code}</span>
                      <span className="text-slate-400 ml-2">
                        ({p.used_count}/{p.max_uses} used)
                      </span>
                    </div>
                    <span className="font-bold text-emerald-600">+${Number(p.reward_amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subtab 4: Admin Receiving BEP20 Address */}
          {adminSubTab === 'settings' && (
            <form onSubmit={handleUpdateDepositWallet} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
              <h3 className="font-extrabold text-sm text-slate-900">Receiving USDT (BEP20) Wallet</h3>
              <p className="text-xs text-slate-500">Users send $1 Normal and $3 Premium payments here.</p>
              <input
                type="text"
                value={adminWalletEdit}
                onChange={(e) => setAdminWalletEdit(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-3 text-xs font-mono"
              />
              <button type="submit" className="w-full py-3 rounded-2xl bg-slate-900 text-amber-400 font-extrabold text-xs">
                Update Deposit Wallet
              </button>
            </form>
          )}
        </main>
      )}

      {/* ==========================================
          PLAN PAYMENT MODAL (USDT BEP20 DEPOSIT)
         ========================================== */}
      {selectedPlanModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900 capitalize">
                Activate {selectedPlanModal} Plan
              </h3>
              <button
                onClick={() => setSelectedPlanModal(null)}
                className="text-xs font-bold text-slate-400 px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Amount to Send:</span>
                <span className="font-extrabold text-slate-900">
                  {selectedPlanModal === 'premium' ? '$3.00 USDT (BEP20)' : '$1.00 USDT (BEP20)'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Daily Coin Reward:</span>
                <span className="font-extrabold text-amber-700">
                  {selectedPlanModal === 'premium' ? '$2.50 / 24h (25 Days)' : '$1.00 / 24h (30 Days)'}
                </span>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-500 mb-1">Send USDT (BEP20 Network) to:</p>
              <div className="bg-slate-100 rounded-2xl p-3 flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-bold text-slate-800 break-all">
                  {depositWallet}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(depositWallet, 'depwallet')}
                  className="p-2 rounded-xl bg-white shadow-xs shrink-0"
                >
                  {copiedKey === 'depwallet' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-700" />
                  )}
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmitPlanPayment} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500">Paste Transaction Hash (TxID)</label>
                <input
                  type="text"
                  required
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  placeholder="0x..."
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-mono outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingPlan}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-extrabold text-xs shadow-md"
              >
                {submittingPlan ? 'Submitting...' : 'I Have Paid — Submit TxID'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          BOTTOM NAVIGATION BAR
          ("More" 3-line Admin tab ONLY renders for ID 9278551040)
         ========================================== */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/95 backdrop-blur border-t border-slate-100 px-2 py-2 flex items-center justify-around z-40">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            activeTab === 'home' ? 'text-amber-600 font-extrabold' : 'text-slate-400 font-medium'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px]">Home</span>
        </button>

        <button
          onClick={() => setActiveTab('earn')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            activeTab === 'earn' ? 'text-amber-600 font-extrabold' : 'text-slate-400 font-medium'
          }`}
        >
          <Coins className="w-5 h-5" />
          <span className="text-[11px]">Daily Coin</span>
        </button>

        <button
          onClick={() => setActiveTab('invite')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            activeTab === 'invite' ? 'text-amber-600 font-extrabold' : 'text-slate-400 font-medium'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[11px]">Invite</span>
        </button>

        <button
          onClick={() => setActiveTab('wallet')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            activeTab === 'wallet' ? 'text-amber-600 font-extrabold' : 'text-slate-400 font-medium'
          }`}
        >
          <Wallet className="w-5 h-5" />
          <span className="text-[11px]">Wallet</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition relative ${
              activeTab === 'admin' ? 'text-amber-600 font-extrabold' : 'text-slate-400 font-medium'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[11px]">More</span>
            {(pendingPayments.length > 0 || pendingWithdrawals.length > 0) && (
              <span className="absolute top-0.5 right-2 w-2 h-2 rounded-full bg-red-500" />
            )}
          </button>
        )}
      </nav>
    </div>
  );
}
