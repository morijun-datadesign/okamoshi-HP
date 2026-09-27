interface Env {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ADMIN_EMAIL?: string;
  NEXT_PUBLIC_N8N_WEBHOOK_URL?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, any>;
    console.log("Cloudflare Function received contact request:", body);

    const apiKey = context.env.RESEND_API_KEY || (typeof process !== "undefined" && process.env?.RESEND_API_KEY);
    const fromEmail =
      context.env.RESEND_FROM_EMAIL ||
      (typeof process !== "undefined" && process.env?.RESEND_FROM_EMAIL) ||
      "岡山県統一模擬試験 <info@okayama-moshi.com>";
    const adminEmail =
      context.env.ADMIN_EMAIL ||
      (typeof process !== "undefined" && process.env?.ADMIN_EMAIL) ||
      "info@okayama-moshi.com";

    if (!apiKey) {
      console.error("RESEND_API_KEY is not configured.");
      return new Response(
        JSON.stringify({
          success: false,
          message: "メール送信APIキー（RESEND_API_KEY）が設定されていません。",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
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

    // 1. 管理者宛通知メール送信
    const adminEmailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        reply_to: body.email || undefined,
        subject: subject,
        text: textContent,
      }),
    });

    if (!adminEmailRes.ok) {
      const errData = await adminEmailRes.json().catch(() => ({}));
      console.error("Resend API Error (Admin Notification):", adminEmailRes.status, errData);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Resend送信エラー: ${adminEmailRes.status}`,
          details: errData,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. ユーザー宛自動返信メール（メールアドレスが入力されている場合）
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

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [body.email],
          subject: userSubject,
          text: userTextContent,
        }),
      }).catch((err) => {
        console.warn("User auto-reply failed (non-fatal):", err);
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "送信完了" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Function Internal Error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
