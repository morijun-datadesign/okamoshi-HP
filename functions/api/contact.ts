import { Env, DEFAULT_FROM_EMAIL, DEFAULT_ADMIN_EMAIL, readEnv } from "../_shared/env";
import { jsonResponse, errorResponse } from "../_shared/http";
import { verifyTurnstile } from "../_shared/turnstile";
import { sendResendEmail } from "../_shared/resend";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, any>;
    console.log("Cloudflare Function received contact request:", body);

    // 1. Turnstile トークンの検証
    const turnstileSecret = readEnv(context.env, "TURNSTILE_SECRET_KEY");
    const turnstileResult = await verifyTurnstile(context.request, body, turnstileSecret);
    if (!turnstileResult.success) {
      return jsonResponse(
        {
          success: false,
          message: turnstileResult.error || "セキュリティ認証に失敗しました。もう一度お試しください。",
        },
        403
      );
    }

    // 2. メール送信設定の取得
    const apiKey = readEnv(context.env, "RESEND_API_KEY");
    const fromEmail = readEnv(context.env, "RESEND_FROM_EMAIL", DEFAULT_FROM_EMAIL);
    const individualAdminEmail = readEnv(context.env, "ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL);
    const orgAdminEmail =
      readEnv(context.env, "ORG_ADMIN_EMAIL") ||
      readEnv(context.env, "ADMIN_EMAIL_ORG") ||
      readEnv(context.env, "CHUO_KYOIKU_EMAIL") ||
      "okayamamoshi@chuoh-kyouiku.co.jp";

    if (!apiKey) {
      console.error("RESEND_API_KEY is not configured.");
      return jsonResponse(
        {
          success: false,
          message: "メール送信APIキー（RESEND_API_KEY）が設定されていません。",
        },
        500
      );
    }

    const isOrg = body.type === "organization";
    const typeLabel = isOrg ? "塾・学校関係者様" : "個人・一般生";
    const subject = `【お問い合わせ】${typeLabel}：${body.name || "お名前なし"} 様`;

    // 本文の生成（管理者通知用）
    const textContent = `
【岡山県統一模擬試験 Webサイトよりお問い合わせがありました】
--------------------------------------------------
■ お問い合わせ種別: ${typeLabel}
■ 区分/カテゴリ: ${body.category || "未選択"}
${
  isOrg
    ? `■ 貴塾・学校名: ${body.organizationName || "未入力"}
■ 教室名・校舎名: ${body.classroomName || "未入力"}`
    : `■ 生徒氏名: ${body.studentName || "未入力"}
■ 学年: ${body.grade || "未選択"}`
}
■ ご担当者/保護者氏名: ${body.name || "未入力"} (${body.phonetic || "未入力"})
■ メールアドレス: ${body.email || "未入力"}
■ 電話番号: ${body.phone || "未入力"}
--------------------------------------------------
■ お問い合わせ内容:
${body.message || "なし"}
--------------------------------------------------
送信日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
`.trim();

    // 3. 管理者宛通知メール送信
    const targetAdminEmail = isOrg ? orgAdminEmail : individualAdminEmail;
    const adminMailRes = await sendResendEmail(
      apiKey,
      {
        from: fromEmail,
        to: [targetAdminEmail],
        reply_to: body.email || undefined,
        subject,
        text: textContent,
      },
      "[functions/api/contact/admin]"
    );

    if (!adminMailRes.ok) {
      console.error("Resend API Error (Admin Notification):", adminMailRes.status, adminMailRes.error);
      return jsonResponse(
        {
          success: false,
          message: `Resend送信エラー: ${adminMailRes.status}`,
          details: adminMailRes.error,
        },
        500
      );
    }

    // 4. ユーザー宛自動返信メール（メールアドレスが入力されている場合）
    if (body.email) {
      const userSubject = "【岡山県統一模擬試験】お問い合わせを受け付けました";
      const userTextContent = `
${body.name ? body.name + " 様\n\n" : ""}岡山県統一模擬試験（おかもし）へのお問い合わせありがとうございます。
以下の内容でお問い合わせを受け付けました。
担当者より内容を確認のうえ、折り返しご連絡いたしますので今しばらくお待ちください。

--------------------------------------------------
■ お問い合わせ種別: ${typeLabel}
■ 区分/カテゴリ: ${body.category || "未選択"}
${
  isOrg
    ? `■ 貴塾・学校名: ${body.organizationName || "未入力"}
■ 教室名・校舎名: ${body.classroomName || "未入力"}`
    : `■ 生徒氏名: ${body.studentName || "未入力"}
■ 学年: ${body.grade || "未選択"}`
}
■ 氏名: ${body.name || "未入力"} (${body.phonetic || "未入力"})
■ メールアドレス: ${body.email || "未入力"}
■ 電話番号: ${body.phone || "未入力"}
--------------------------------------------------
■ お問い合わせ内容:
${body.message || "なし"}
--------------------------------------------------

※本メールは送信専用アドレスより自動配信されています。
心当たりのない場合は、お手数ですが本メールを破棄してください。

--------------------------------------------------
岡山県統一模擬試験実行委員会（中央教育研究所株式会社）
〒730-0013 広島県広島市中区八丁堀15番6号 広島ちゅうぎんビル3階
TEL : 082-227-3999
MAIL: info@okayama-moshi.com
Web : https://okayama-moshi.com
--------------------------------------------------
`.trim();

      sendResendEmail(
        apiKey,
        {
          from: fromEmail,
          to: [body.email],
          subject: userSubject,
          text: userTextContent,
        },
        "[functions/api/contact/user]"
      ).catch((err) => {
        console.warn("User auto-reply failed (non-fatal):", err);
      });
    }

    return jsonResponse({ success: true, message: "送信完了" });
  } catch (error: any) {
    console.error("Function Internal Error:", error);
    return errorResponse(error.message || "Server Error", 500);
  }
};
