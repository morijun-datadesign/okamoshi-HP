/**
 * Stripe API 共通クライアント
 */
import { extractExamNamesFromMetadata, normalizeExamName } from "./exam";

export const fetchCheckoutSession = async (
  sessionId: string,
  secretKey: string,
  logPrefix = "[stripe]"
): Promise<Record<string, any> | null> => {
  if (!sessionId || !secretKey) return null;
  const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items&expand[]=payment_intent`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = (await res.json()) as Record<string, any>;
    if (!res.ok) {
      console.error(`${logPrefix} Failed to retrieve session ${sessionId}: HTTP ${res.status}`, JSON.stringify(data));
      return null;
    }
    return data;
  } catch (err) {
    console.error(`${logPrefix} Session fetch exception ${sessionId}:`, err);
    return null;
  }
};

export const fetchPaymentIntent = async (
  paymentIntentId: string,
  secretKey: string,
  logPrefix = "[stripe]"
): Promise<Record<string, any> | null> => {
  if (!paymentIntentId || !secretKey) return null;
  const url = `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = (await res.json()) as Record<string, any>;
    if (!res.ok) {
      console.error(`${logPrefix} Failed to retrieve payment_intent ${paymentIntentId}: HTTP ${res.status}`, JSON.stringify(data));
      return null;
    }
    return data;
  } catch (err) {
    console.error(`${logPrefix} PaymentIntent fetch exception ${paymentIntentId}:`, err);
    return null;
  }
};

interface PaginatedSessionScanOptions {
  customerEmail?: string;
  maxPages: number;
  logPrefix?: string;
}

const listCompletedSessionsPaginated = async (
  secretKey: string,
  sinceTimestamp: number,
  options: PaginatedSessionScanOptions,
  onSession: (session: Record<string, any>) => boolean
): Promise<{ stoppedEarly: boolean; truncated: boolean }> => {
  const logPrefix = options.logPrefix || "[stripe]";
  let startingAfter = "";
  const seenPageCursors = new Set<string>();

  for (let page = 0; page < options.maxPages; page++) {
    const params = new URLSearchParams({
      limit: "100",
      "created[gte]": String(sinceTimestamp),
      status: "complete",
    });
    if (options.customerEmail) {
      params.set("customer_details[email]", options.customerEmail);
    }
    if (startingAfter) {
      params.set("starting_after", startingAfter);
    }

    const url = `https://api.stripe.com/v1/checkout/sessions?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) {
      console.warn(
        `${logPrefix} listCompletedSessionsPaginated error (page=${page + 1}, emailFilter=${Boolean(options.customerEmail)}): HTTP ${res.status}`
      );
      return { stoppedEarly: false, truncated: false };
    }

    const data = (await res.json()) as {
      data?: Array<Record<string, any>>;
      has_more?: boolean;
    };
    const sessions = Array.isArray(data.data) ? data.data : [];
    for (const s of sessions) {
      if (onSession(s)) {
        return { stoppedEarly: true, truncated: false };
      }
    }

    if (!data.has_more || sessions.length === 0) {
      return { stoppedEarly: false, truncated: false };
    }

    const lastId = String(sessions[sessions.length - 1]?.id || "");
    if (!lastId || seenPageCursors.has(lastId)) {
      console.warn(`${logPrefix} Pagination cursor stalled at "${lastId}"; stopping scan.`);
      return { stoppedEarly: false, truncated: false };
    }
    seenPageCursors.add(lastId);
    startingAfter = lastId;
  }

  return { stoppedEarly: false, truncated: true };
};

/**
 * コンビニ支払期限切れ時、直近（デフォルト14日以内）に
 * 「同一生徒 ＋ 同一メールアドレス ＋ 同一の対象模試（複数同時申込時は含まれるすべての模試）」で
 * ステータスが「paid」の別セッションが存在するかチェックする
 *
 * 【100件上限対策】
 * Phase 1: customer_details[email] 絞り込み + ページネーションで高速捕捉
 * Phase 2: 上記で見つからない場合（大文字/小文字差異・metadata.email のみ一致等）、
 *          has_more + starting_after による全ページ走査（最大20ページ=2,000件）で100%確実に捕捉する
 */
export const checkRecentPaidSession = async (
  email: string,
  studentName: string,
  targetExamNames: string[],
  secretKey: string,
  excludeSessionId: string,
  days = 14,
  logPrefix = "[stripe]"
): Promise<{ hasPaid: boolean; matchedSessionId?: string }> => {
  const rawEmail = String(email || "").trim();
  const normEmail = rawEmail.toLowerCase();
  const normName = String(studentName || "").normalize("NFKC").replace(/\s+/g, "").trim();
  const requiredExams = Array.from(
    new Set((targetExamNames || []).map((n) => normalizeExamName(n)).filter(Boolean))
  );

  // 「同一生徒 ＋ 同一メールアドレス ＋ 対象模試」のすべてが揃っていない場合はスキップ判定しない
  if (!secretKey || !normEmail || !normName || requiredExams.length === 0) {
    return { hasPaid: false };
  }

  try {
    const sinceTimestamp = Math.floor((Date.now() - days * 86400 * 1000) / 1000);
    const paidExamSet = new Set<string>();
    const matchedSessionIds: string[] = [];
    const seenSessionIds = new Set<string>();

    const evaluateSession = (s: Record<string, any>): boolean => {
      const sid = String(s?.id || "");
      if (sid) {
        if (sid === excludeSessionId || seenSessionIds.has(sid)) return false;
        seenSessionIds.add(sid);
      }
      if (s?.payment_status !== "paid") return false;

      const sEmail = String(s.customer_details?.email || s.customer_email || s.metadata?.email || "")
        .toLowerCase()
        .trim();
      const sName = String(s.metadata?.student_name || s.client_reference_id || "")
        .normalize("NFKC")
        .replace(/\s+/g, "")
        .trim();

      // 「同一生徒 ＋ 同一メールアドレス」の両方が一致するセッションのみ対象
      if (sEmail !== normEmail || sName !== normName) return false;

      const sExamNames = extractExamNamesFromMetadata(s.metadata);
      let matchedInThisSession = false;
      for (const exName of sExamNames) {
        const normEx = normalizeExamName(exName);
        if (normEx && requiredExams.includes(normEx)) {
          paidExamSet.add(normEx);
          matchedInThisSession = true;
        }
      }
      if (matchedInThisSession && sid && !matchedSessionIds.includes(sid)) {
        matchedSessionIds.push(sid);
      }

      return requiredExams.every((reqEx) => paidExamSet.has(reqEx));
    };

    // Phase 1: customer_details[email] 絞り込みによる高速検索（最大5ページ）
    const emailCandidates = Array.from(new Set([rawEmail, normEmail].filter(Boolean)));
    for (const candidateEmail of emailCandidates) {
      const p1 = await listCompletedSessionsPaginated(
        secretKey,
        sinceTimestamp,
        { customerEmail: candidateEmail, maxPages: 5, logPrefix },
        evaluateSession
      );
      if (p1.stoppedEarly) {
        const joinedIds = matchedSessionIds.join(", ");
        console.log(
          `${logPrefix} Found paid session(s) via email filter covering all target exams (${targetExamNames.join(" / ")}) for student="${studentName}" email="${email}": session_id=${joinedIds}`
        );
        return { hasPaid: true, matchedSessionId: joinedIds };
      }
    }

    // Phase 2: 100件上限突破・完全網羅フォールバック（has_more + starting_after、最大20ページ=2,000件）
    const MAX_FALLBACK_PAGES = 20;
    const p2 = await listCompletedSessionsPaginated(
      secretKey,
      sinceTimestamp,
      { maxPages: MAX_FALLBACK_PAGES, logPrefix },
      evaluateSession
    );
    if (p2.stoppedEarly) {
      const joinedIds = matchedSessionIds.join(", ");
      console.log(
        `${logPrefix} Found paid session(s) via paginated scan covering all target exams (${targetExamNames.join(" / ")}) for student="${studentName}" email="${email}": session_id=${joinedIds}`
      );
      return { hasPaid: true, matchedSessionId: joinedIds };
    }
    if (p2.truncated) {
      console.warn(
        `${logPrefix} checkRecentPaidSession reached page limit (${MAX_FALLBACK_PAGES} pages) while scanning sessions since=${sinceTimestamp}.`
      );
    }

    return { hasPaid: false };
  } catch (err) {
    console.warn(`${logPrefix} Error checking recent paid sessions:`, err);
    return { hasPaid: false };
  }
};


/**
 * Stripe Webhook 署名（Stripe-Signature）を Web Crypto API (HMAC-SHA256) で検証する。
 * リプレイ攻撃防止（許容時間差: デフォルト300秒）およびタイミング攻撃対策（定時間比較）を実装。
 */
export const verifyStripeWebhookSignature = async (
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSec = 300
): Promise<{ valid: boolean; error?: string }> => {
  if (!signatureHeader) {
    return { valid: false, error: "Missing stripe-signature header" };
  }
  if (!webhookSecret) {
    return { valid: false, error: "Missing webhookSecret" };
  }

  // 1. t と v1 を抽出
  const parts = signatureHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.trim().split("=");
    if (k === "t") timestamp = v;
    if (k === "v1") signatures.push(v);
  }

  if (!timestamp || signatures.length === 0) {
    return { valid: false, error: "Invalid stripe-signature header format" };
  }

  // 2. タイムスタンプの検証（リプレイ攻撃防止）
  const eventTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Number.isNaN(eventTime) || Math.abs(now - eventTime) > toleranceSec) {
    return { valid: false, error: "Webhook timestamp outside tolerance zone" };
  }

  // 3. HMAC-SHA256 の計算
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signedPayload = `${timestamp}.${rawBody}`;
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 4. 定数時間比較（Timing Attack 対策）
    const isValid = signatures.some((sig) => {
      if (sig.length !== expectedSignature.length) return false;
      let mismatch = 0;
      for (let i = 0; i < sig.length; i++) {
        mismatch |= sig.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
      }
      return mismatch === 0;
    });

    return isValid ? { valid: true } : { valid: false, error: "Signature mismatch" };
  } catch (err) {
    return { valid: false, error: `Signature verification exception: ${err}` };
  }
};
