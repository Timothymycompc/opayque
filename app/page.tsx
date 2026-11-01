"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { 
  LucideShieldCheck, 
  LucideLoader2, 
  LucideLock, 
  LucideMonitorSmartphone, 
  LucideCode2,
  LucideArrowUpRight,
  LucideExternalLink,
} from "lucide-react";
import { clearActiveSession, createSessionChallenge, createTerminalSession, getActiveSession, setActiveSession } from "@/lib/crypto/session";
import { configureConfidentialAccount } from "@/lib/solana/confidential";
import { getAssetMintAddress } from "@/lib/solana/constants";
import { PublicKey } from "@solana/web3.js";
import { createClient } from "@/lib/supabase/client";

function getSavedMerchantName() {
  if (typeof window === "undefined") {
    return "Opayque Merchant";
  }

  const merchantName = window.localStorage.getItem("merchant_name")?.trim();
  return merchantName || "Opayque Merchant";
}

function getSavedMerchantLogo() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("merchant_logo")?.trim() || window.localStorage.getItem("merchant_avatar")?.trim() || null;
}

async function registerMerchant(walletAddress: string): Promise<string> {
  const response = await fetch("/api/merchant/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet_address: walletAddress,
      merchant_name: getSavedMerchantName(),
      merchant_logo: getSavedMerchantLogo(),
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.success || !payload?.data?.merchant?.id) {
    throw new Error(payload?.error || "Failed to register merchant");
  }

  return payload.data.merchant.id;
}

const WalletMultiButtonNoSSR = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  {
    ssr: false,
    loading: () => <div className="h-14 w-full bg-zinc-800/20 animate-pulse rounded-2xl" />,
  }
);

function getMobileWalletContext() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { isMobile: false, isInAppBrowser: false };
  }

  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isInAppBrowser = /Instagram|FBAN|FBAV|Line|TikTok|Twitter|Discord|WeChat|WhatsApp|Telegram|KAKAOTALK|Meta|FxiOS|CriOS|SamsungBrowser|FB_IAB|FB4A/i.test(ua);
  const isStandalone = Boolean((window as Window & { navigator?: { standalone?: boolean } }).navigator?.standalone);

  return {
    isMobile,
    isInAppBrowser: isInAppBrowser || isStandalone,
  };
}

function openPhantomUniversalLink(targetUrl: string) {
  if (typeof window === "undefined") {
    return;
  }

  const phantomUrl = `https://phantom.app/ul/v1/browse?url=${encodeURIComponent(targetUrl)}`;
  const popup = window.open(phantomUrl, "_blank", "noopener,noreferrer");

  if (!popup) {
    window.location.assign(phantomUrl);
  }
}

export default function UnifiedLanding() {
  const [mounted, setMounted] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { connected, publicKey, signMessage, signTransaction, connect } = useWallet();
  const router = useRouter();
  const mobileWalletContext = getMobileWalletContext();

  useEffect(() => {
    setMounted(true);
    // Do not treat an existing session as an in-flight vault authorization.
    // The spinner should only be active while the user is actively authorizing.
  }, []);

  const handleVaultEntrance = async () => {
    const canSignMessage = Boolean(signMessage);
    const canSignTransaction = Boolean(signTransaction);
    const canPerformConfidentialSetup = canSignMessage || canSignTransaction;

    if (!connected || !publicKey) {
      if (mobileWalletContext.isMobile && !mobileWalletContext.isInAppBrowser) {
        setAuthError("Opening Phantom for a seamless mobile sign-in...");
        openPhantomUniversalLink(window.location.href);
        return;
      }

      if (connect) {
        try {
          await connect();
        } catch (e) {
          setAuthError("Please connect a wallet to continue.");
          return;
        }
      } else {
        setAuthError("Please connect a wallet to continue.");
        return;
      }
    }

    if (!publicKey || !canPerformConfidentialSetup) {
      if (mobileWalletContext.isMobile && !mobileWalletContext.isInAppBrowser) {
        setAuthError("Phantom is required for secure mobile signing. Opening Phantom...");
        openPhantomUniversalLink(window.location.href);
        return;
      }

      setAuthError("Connected wallet cannot perform confidential signing operations. Please use Phantom or another supported wallet.");
      return;
    }

    setAuthError(null);
    setIsAuthorizing(true);

    try {
      const merchantId = await registerMerchant(publicKey.toBase58());
      const challenge = createSessionChallenge();
      const message = new TextEncoder().encode(challenge.nonce);
      const signature = signMessage ? await signMessage(message) : new Uint8Array();
      const session = await createTerminalSession({
        merchantId,
        walletAddress: publicKey.toBase58(),
        nonce: challenge.nonce,
        walletSignature: signature,
      });

      const mint = new PublicKey(getAssetMintAddress("USDC", true));
      const confidentialSummary = await configureConfidentialAccount(
        { publicKey, signMessage, signTransaction },
        mint
      );

      if (confidentialSummary.status === "unsupported" || confidentialSummary.status === "error") {
        setActiveSession(session);
        setAuthError(confidentialSummary.message);
        router.push("/vault/registry");
        return;
      }

      setActiveSession(session);
      router.push("/vault/registry");
    } catch (error) {
      clearActiveSession();
      setAuthError(error instanceof Error ? error.message : "Wallet signing was rejected.");
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleAccessVault = async () => {
    setAuthError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      router.push(`/login?next=${encodeURIComponent("/vault")}`);
      return;
    }
    router.push("/vault");
  };

  const handleDeveloperDashboard = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      router.push("/login?next=%2Fdeveloper%2Foverview");
      return;
    }
    router.push("/developer/overview");
  };

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white selection:bg-purple-500/30">
      {isAuthorizing && (
        <div className="absolute inset-0 z-0 animate-pulse bg-purple-600/15 duration-400" />
      )}

      {isAuthorizing ? (
        <div className="relative z-20 flex min-h-screen flex-col items-center justify-center px-6 text-center animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 rounded-full border border-purple-500/30 flex items-center justify-center mb-8 relative">
            <div className="absolute inset-0 rounded-full border-2 border-purple-500 animate-ping opacity-20" />
            <div className="absolute inset-0 rounded-full border-t-2 border-purple-500 animate-spin duration-700" />
            <LucideShieldCheck size={32} className="text-purple-500" />
          </div>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-2">Merchant Authorization</h2>
          <div className="flex items-center gap-3 text-zinc-500">
            <LucideLoader2 size={14} className="animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Verifying Wallet Identity...</p>
          </div>
          {authError ? (
            <p className="mt-4 max-w-sm text-sm text-amber-400">{authError}</p>
          ) : null}
        </div>
      ) : (
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:px-12">
          <header className="flex h-20 items-center justify-between border-b border-white/10">
            <Link href="/" className="flex items-center gap-3" aria-label="Opayque home">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-purple-300/30 bg-purple-400/10 text-xs font-black text-purple-200">O</span>
              <span className="text-sm font-extrabold uppercase text-white">Opayque</span>
            </Link>

            <nav className="flex items-center gap-4 sm:gap-7" aria-label="Main navigation">
              <Link href="/developer/docs" className="hidden text-sm text-zinc-400 transition hover:text-white sm:inline">Docs</Link>
              <Link
                href="https://github.com/EmperorBloyan/opayque"
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white md:inline-flex"
              >
                GitHub <LucideExternalLink size={13} aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => void handleAccessVault()}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-bold text-white transition hover:border-purple-300/50 hover:bg-white/[0.04] sm:px-4 sm:text-sm"
              >
                Merchant sign in <LucideArrowUpRight size={14} aria-hidden="true" />
              </button>
            </nav>
          </header>

          <main className="flex-1">
            <section className="grid items-center gap-12 py-16 sm:py-20 lg:min-h-[590px] lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:py-24" aria-labelledby="hero-title">
              <div className="animate-in fade-in slide-in-from-bottom-3 duration-700">
                <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-purple-300/25 bg-purple-400/[0.07] px-3 py-2 text-[10px] font-bold uppercase text-purple-200 sm:text-xs">
                  <LucideShieldCheck size={14} aria-hidden="true" />
                  SOLANA-NATIVE MERCHANT INFRASTRUCTURE
                </p>
                <h1 id="hero-title" className="max-w-3xl text-5xl font-black leading-[1.04] text-white sm:text-6xl lg:text-7xl">
                  Non-Custodial Payment Execution Layer for Modern Commerce
                </h1>
                <p className="mt-7 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
                  Opayque powers real-time Point-of-Sale checkout, cross-device session orchestration, and multi-branch ledger reconciliation—enabling physical and digital merchants to accept on-chain USDC directly into self-custody with zero custodial licensing overhead.
                </p>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/terminal"
                    className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg bg-purple-500 px-6 text-sm font-bold text-white transition hover:bg-purple-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
                  >
                    <LucideMonitorSmartphone size={17} aria-hidden="true" />
                    Launch Terminal Demo
                    <LucideArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    href="https://github.com/EmperorBloyan/opayque#architecture"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg border border-white/15 px-6 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.04]"
                  >
                    <LucideCode2 size={17} aria-hidden="true" />
                    Read Architecture Specs
                    <LucideExternalLink size={14} aria-hidden="true" />
                  </Link>
                </div>
                {authError ? <p role="alert" className="mt-4 text-sm text-amber-300">{authError}</p> : null}
                <p className="mt-6 text-xs text-zinc-600">Merchant operations, settled directly to self-custody on Solana.</p>
              </div>

              <div className="relative border-y border-white/10 py-8 sm:py-10 lg:ml-4" aria-label="Payment execution flow">
                <div className="mb-8 flex items-center justify-between gap-4">
                  <p className="text-[10px] font-bold uppercase text-zinc-500 sm:text-xs">Payment execution flow</p>
                  <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase text-emerald-300 sm:text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Non-custodial settlement
                  </span>
                </div>

                <div className="grid grid-cols-[52px_1fr_auto] items-center gap-4 border-b border-white/10 py-5 sm:grid-cols-[64px_1fr_auto] sm:gap-5">
                  <span className="font-mono text-sm text-zinc-600">01</span>
                  <div>
                    <p className="text-sm font-semibold text-white sm:text-base">Checkout session</p>
                    <p className="mt-1 text-xs text-zinc-500">POS, mobile, or web terminal</p>
                  </div>
                  <span className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-zinc-400">CREATED</span>
                </div>

                <div className="grid grid-cols-[52px_1fr_auto] items-center gap-4 border-b border-white/10 py-5 sm:grid-cols-[64px_1fr_auto] sm:gap-5">
                  <span className="font-mono text-sm text-zinc-600">02</span>
                  <div>
                    <p className="text-sm font-semibold text-white sm:text-base">USDC payment</p>
                    <p className="mt-1 text-xs text-zinc-500">Merchant-scoped session tracking</p>
                  </div>
                  <span className="rounded border border-purple-300/20 bg-purple-400/[0.06] px-2 py-1 font-mono text-[10px] text-purple-200">SUBMITTED</span>
                </div>

                <div className="grid grid-cols-[52px_1fr_auto] items-center gap-4 py-5 sm:grid-cols-[64px_1fr_auto] sm:gap-5">
                  <span className="font-mono text-sm text-zinc-600">03</span>
                  <div>
                    <p className="text-sm font-semibold text-white sm:text-base">Direct settlement</p>
                    <p className="mt-1 text-xs text-zinc-500">Funds remain in merchant custody</p>
                  </div>
                  <span className="rounded border border-emerald-300/20 bg-emerald-400/[0.06] px-2 py-1 font-mono text-[10px] text-emerald-200">CONFIRMED</span>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-5 text-xs">
                  <span className="font-mono text-zinc-500">SOLANA / USDC</span>
                  <span className="inline-flex items-center gap-2 font-semibold text-zinc-300">
                    <LucideLock size={13} className="text-purple-300" aria-hidden="true" />
                    Merchant-controlled wallet
                  </span>
                </div>
              </div>
            </section>

            <section className="border-y border-white/10 py-9 sm:py-11" aria-label="Platform capabilities">
              <div className="mb-7 flex items-center justify-between gap-4">
                <p className="text-[10px] font-bold uppercase text-zinc-500 sm:text-xs">Built for commerce operations</p>
                <span className="hidden font-mono text-[10px] text-zinc-600 sm:inline">01 — 03</span>
              </div>
              <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
                <article className="py-6 md:py-1 md:pr-7">
                  <LucideLock size={18} className="mb-5 text-purple-300" aria-hidden="true" />
                  <h2 className="text-base font-bold text-white">Zero Custody Risk</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">Direct on-chain settlement into merchant self-custody wallets. Eliminates money transmission licensing (MTL) and custodial liability.</p>
                </article>
                <article className="py-6 md:px-7 md:py-1">
                  <LucideMonitorSmartphone size={18} className="mb-5 text-purple-300" aria-hidden="true" />
                  <h2 className="text-base font-bold text-white">Real-Time Session Engine</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">Instant checkout state tracking (<span className="font-mono text-zinc-300">CREATED</span> to <span className="font-mono text-zinc-300">CONFIRMED</span>) across physical POS hardware, mobile endpoints, and web terminals.</p>
                </article>
                <article className="py-6 md:pl-7 md:py-1">
                  <LucideCode2 size={18} className="mb-5 text-purple-300" aria-hidden="true" />
                  <h2 className="text-base font-bold text-white">Multi-Branch Ledger</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">Automated batch reconciliation and real-time transaction reporting for multi-store retail and enterprise chains.</p>
                </article>
              </div>
            </section>
          </main>

          <footer className="flex flex-col gap-4 py-7 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
            <span>Opayque · Solana-native merchant infrastructure</span>
            <div className="flex items-center gap-5">
              <Link href="/developer/overview" onClick={(event) => void handleDeveloperDashboard(event)} className="transition hover:text-white">Developer dashboard</Link>
              <button type="button" onClick={() => void handleAccessVault()} className="transition hover:text-white">Access Vault</button>
            </div>
          </footer>
        </div>
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.035]" />
    </div>
  );
}
