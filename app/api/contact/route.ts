import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Server API Route received contact request:", body);

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "岡山県統一模擬試験 <info@okayama-moshi.com>";
    
    // 個人問い合わせ向け管理者通知先: info@okayama-moshi.com
    const individualAdminEmail = process.env.ADMIN_EMAIL || "info@okayama-moshi.com";
    // 塾・学校関係者フォーム向け管理者通知先: 中央教育研究所の指定アドレス（環境変数で切り替え可能）
    const orgAdminEmail =
      process.env.ORG_ADMIN_EMAIL ||
      process.env.ADMIN_EMAIL_ORG ||
      process.env.CHUO_KYOIKU_EMAIL ||
      "okayamamoshi@chuoh-kyouiku.co.jp";

    if (!apiKey) {
      console.error("RESEND_API_KEY is not configured.");
      return NextResponse.json(
        { success: false, message: "メール送信APIキー（RESEND_API_KEY）が設定されていません。" },
        { status: 500 }
      );
    }

    const isOrg = body.type === "organization";
    const typeLabel = isOrg ? "塾・学校関係者様" : "個人・一般生";
    const subject = `【お問い合わせ】${typeLabel}：${body.name || "お名前なし"} 様`;
    const targetAdminEmail = isOrg ? orgAdminEmail : individualAdminEmail;

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
        "User-Agent": "Okamoshi-Contact/1.0",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [targetAdminEmail],
        reply_to: body.email || undefined,
        subject: subject,
        text: textContent,
      }),
    });

    if (!adminEmailRes.ok) {
      const errData = await adminEmailRes.json().catch(() => ({}));
      console.error("Resend API Error (Admin Notification):", adminEmailRes.status, errData);
      return NextResponse.json(
        { success: false, message: `Resend送信エラー: ${adminEmailRes.status}`, details: errData },
        { status: 500 }
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
          "User-Agent": "Okamoshi-Contact/1.0",
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

    return NextResponse.json({ success: true, message: "送信完了" });
  } catch (error: any) {
    console.error("API Route Internal Error:", error);
    return NextResponse.json({ success: false, message: error.message || "Server Error" }, { status: 500 });
  }
}
