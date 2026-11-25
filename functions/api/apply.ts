import { Env, readEnv } from "../_shared/env";
import { jsonResponse, errorResponse } from "../_shared/http";
import { fetchCheckoutSession } from "../_shared/stripe";
import { dispatchInitialApplicationEmails } from "../_shared/apply-initial-mail";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, any>;
    console.log("[functions/api/apply] Received apply request:", JSON.stringify(body));

    const stripeSecretKey = readEnv(context.env, "STRIPE_SECRET_KEY");

    // 1. 【セキュリティ改修】Stripe Session ID の検証ガード（未認証での無制限メール送信を完全遮断）
    const incomingSessionId = String(
      body.session_id || body.stripe_session_id || (body.metadata && body.metadata.session_id) || ""
    ).trim();
    if (!incomingSessionId || !incomingSessionId.startsWith("cs_")) {
      console.warn("[functions/api/apply] Unauthorized request: missing or invalid session_id");
      return errorResponse("有効なStripe決済セッションID（session_id）が提供されていません。", 400);
    }

    if (!stripeSecretKey) {
      console.error("[functions/api/apply] STRIPE_SECRET_KEY is not configured.");
      return errorResponse("決済認証サービスの設定が完了していません。", 500);
    }

    // Stripe API から最新のセッションを取得して決済完了状態を照合する
    console.log(`[functions/api/apply] Verifying Stripe session ${incomingSessionId}...`);
    const stripeSessionData = await fetchCheckoutSession(incomingSessionId, stripeSecretKey, "[functions/api/apply]");
    if (!stripeSessionData) {
      console.warn(`[functions/api/apply] Stripe session not found: ${incomingSessionId}`);
      return errorResponse("指定された決済セッションが見つかりません。", 404);
    }

    const sessionStatus = String(stripeSessionData.status || "");
    const sessionPaymentStatus = String(stripeSessionData.payment_status || "");
    if (sessionStatus === "expired" || (sessionStatus !== "complete" && sessionPaymentStatus !== "paid")) {
      console.warn(
        `[functions/api/apply] Incomplete or expired Stripe session state: status=${sessionStatus}, payment_status=${sessionPaymentStatus}`
      );
      return errorResponse("決済が完了していないセッションへの通知送信はできません。", 400);
    }

    const sessionMeta = (stripeSessionData && stripeSessionData.metadata) || {};

    // 1-2. 【緊急ガード】旧サイト決済除外フィルター
    const successUrl = String((stripeSessionData && stripeSessionData.success_url) || "");
    const isNewSiteUrl = successUrl.includes("/apply/success") || successUrl.includes("/apply");
    const hasNewSiteMeta = Boolean(
      sessionMeta.source === "okamoshi_apply" ||
      (sessionMeta.student_name && (sessionMeta.grade || sessionMeta.student_grade_label)) ||
      sessionMeta.exam_1 ||
      (sessionMeta.student_name && sessionMeta.exam_name)
    );

    if (!isNewSiteUrl && !hasNewSiteMeta) {
      console.warn(`[functions/api/apply] Legacy site session ignored: ${incomingSessionId}`);
      return jsonResponse({ received: true, ignored: "legacy_site_session" });
    }

    // 2. 台帳（GAS）への書き込みは Stripe Webhook（functions/api/stripe-webhook.ts）に一本化。
    //    初回受付メール（申込者サンクス＋管理者通知）は D1 冪等性ロック付き共通モジュールで必ず1回だけ送信する。
    const activeSessionId = String(stripeSessionData.id || incomingSessionId).trim();
    const dispatch = await dispatchInitialApplicationEmails({
      env: context.env,
      sessionId: activeSessionId,
      source: "apply_api",
      stripeSession: stripeSessionData,
      stripeSecretKey,
      fallbackBody: body,
    });

    const gasResponseData = { delegated_to: "stripe-webhook", records: dispatch.examRecords.length };

    return jsonResponse({
      success: true,
      status: "success",
      already_sent: dispatch.alreadySent,
      in_progress: dispatch.inProgress || undefined,
      dispatch_source: dispatch.dispatchSource,
      message: dispatch.alreadySent
        ? "お申し込み受付済みです（確認メールは送信済みです）"
        : "お申し込みを受け付けました",
      gas: {
        success: true,
        response: gasResponseData,
        error: null,
      },
      resend: {
        already_sent: dispatch.alreadySent,
        dispatch_source: dispatch.dispatchSource,
        admin_mail_id: dispatch.adminMailId,
        applicant_mail_id: dispatch.applicantMailId,
        error: dispatch.mailError,
      },
      session_id: activeSessionId,
      exam_type: dispatch.examType,
      exam_name: dispatch.examName,
      redirect_url: "/apply/success",
    });
  } catch (error: any) {
    console.error("[functions/api/apply] Internal Error:", error);
    return errorResponse(error.message || "Server Error", 500);
  }
};
