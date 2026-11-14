"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { backendGoogleLogin } from "../services/authApi";

declare global {
  interface Window {
    google?: any;
  }
}

interface GoogleSignInButtonProps {
  mode?: "login" | "signup";
  onSuccess?: () => void;
  onError?: (err: string) => void;
  next?: string;
}

export function GoogleSignInButton({
  mode = "login",
  onSuccess,
  onError,
  next,
}: GoogleSignInButtonProps) {
  const router = useRouter();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [configNotice, setConfigNotice] = useState<string | null>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const isConfigured = Boolean(clientId && !clientId.includes("your_google_client_id"));

  const handleCredentialResponse = useCallback(
    async (response: any) => {
      if (!response?.credential) return;
      setGoogleLoading(true);
      setConfigNotice(null);
      try {
        const res = await backendGoogleLogin(response.credential);
        if (res.success && res.user) {
          router.refresh();
          if (onSuccess) {
            onSuccess();
          } else if (next && next.startsWith("/") && !next.startsWith("//")) {
            router.push(next);
          } else {
            router.push("/");
          }
        } else if (res.mfa_required) {
          onError?.(
            res.message || "MFA required for privileged account. Please enter your TOTP code."
          );
        } else {
          onError?.(res.error || "Google authentication failed.");
        }
      } catch {
        onError?.("Failed to connect to authentication server.");
      } finally {
        setGoogleLoading(false);
      }
    },
    [router, onSuccess, onError, next]
  );

  useEffect(() => {
    if (!isConfigured || !clientId) return;

    let checkInterval: any = null;
    let cancelled = false;

    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) {
        return false;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
        });

        googleBtnRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: 320,
          text: mode === "signup" ? "signup_with" : "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
        });

        setScriptLoaded(true);
        return true;
      } catch (err) {
        console.warn("Google GSI renderButton error:", err);
        return false;
      }
    };

    // 1. Try immediate render if already loaded
    if (renderGoogleButton()) {
      return;
    }

    // 2. Ensure Google script tag is in document
    const scriptId = "google-gsi-client";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    // 3. Poll every 100ms for up to 5 seconds until ready
    let attempts = 0;
    checkInterval = setInterval(() => {
      attempts++;
      if (renderGoogleButton() || attempts > 50) {
        clearInterval(checkInterval);
      }
    }, 100);

    return () => {
      cancelled = true;
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [isConfigured, clientId, mode, handleCredentialResponse]);

  const handleFallbackClick = () => {
    if (!isConfigured) {
      setConfigNotice(
        "Google Sign-In is not yet configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env or sign in with email above."
      );
    } else {
      // If script is still loading, try triggering prompt
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.prompt();
        } catch {
          setConfigNotice("Connecting to Google Identity Services...");
        }
      } else {
        setConfigNotice("Connecting to Google Identity Services. Please wait a moment...");
      }
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Separator */}
      <div className="relative my-4 w-full">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200"></div>
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-slate-500 font-medium text-xs">
            Or continue with
          </span>
        </div>
      </div>

      {/* Button Container */}
      <div className="flex flex-col items-center justify-center min-h-[44px] w-full">
        {/* Google's official GSI button container - always in DOM if configured */}
        {isConfigured && (
          <div
            ref={googleBtnRef}
            className={`flex justify-center w-full ${scriptLoaded ? "block" : "hidden"}`}
          />
        )}

        {/* Fallback button: visible while script is loading or if client ID isn't configured */}
        {(!isConfigured || !scriptLoaded) && (
          <button
            type="button"
            onClick={handleFallbackClick}
            disabled={googleLoading}
            className="flex min-h-12 w-full max-w-[320px] items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 cursor-pointer disabled:opacity-60"
          >
            {/* Google G Logo SVG */}
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>{mode === "signup" ? "Sign up with Google" : "Continue with Google"}</span>
          </button>
        )}

        {googleLoading && (
          <div className="text-xs text-sky-600 flex items-center gap-1.5 mt-2 animate-pulse">
            <span>⏳</span> Authenticating with Google...
          </div>
        )}

        {configNotice && (
          <p className="mt-2 text-center text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 max-w-[340px]">
            {configNotice}
          </p>
        )}
      </div>
    </div>
  );
}
