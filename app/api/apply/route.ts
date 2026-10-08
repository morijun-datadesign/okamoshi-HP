import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Server API Route received apply request:", body);

    const gasUrl =
      process.env.GAS_APPLY_URL ||
      "https://script.google.com/macros/s/AKfycbwYljLEwbfFCQWx-c6JneJUDINYbhYl0_M1-e9CwhBskBvRBEdIuwNotYceCg5i6M9z/exec";

    // 1. Google Apps Script (GAS) 申込受付台帳へ直接 POST 送信
    let gasSuccess = false;
    let gasResponseData: any = null;

    try {
      const gasRes = await fetch(gasUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Okamoshi-Apply/1.0",
        },
        body: JSON.stringify(body),
        redirect: "follow",
      });

      if (gasRes.ok) {
        gasResponseData = await gasRes.json().catch(() => ({ status: "success" }));
        gasSuccess = true;
        console.log("GAS response successfully received:", gasResponseData);
      } else {
        console.warn("GAS responded with non-200 status:", gasRes.status);
      }
    } catch (gasErr) {
      console.error("Failed to forward application to GAS:", gasErr);
    }

    // 2. Resend API による管理者通知メール送信
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "岡山県統一模擬試験 <info@okayama-moshi.com>";
    const adminEmail = process.env.ADMIN_EMAIL || "info@okayama-moshi.com";

    const applicantEmail = body.email || body.customer_email || "";
    const studentName = body.student_name || "生徒氏名未入力";
    const studentGrade = body.student_grade_label || body.student_grade || "未選択";
    const examName = body.exam_name || "岡山県統一模擬試験";
    const totalAmount = body.amount || (body.metadata && body.metadata.total_amount) || 0;
    const paymentMethodLabel = (body.payment_method === "konbini" || body.raw_payment_method === "convenience_store")
      ? "コンビニ決済"
      : "クレジットカード決済";

    const examsListText = Array.isArray(body.exams) && body.exams.length > 0
      ? body.exams.map((ex: any) => `  ・${ex.title || ex.id} (${ex.venue_name || ex.venue || "会場未指定"}) / ￥${ex.price ? Number(ex.price).toLocaleString() : ""}`).join("\n")
      : `  ・${examName}`;

    const adminSubject = `【個人申込受付】${studentName} 様 (${studentGrade})：${examName}`;
    const adminTextContent = `
【岡山県統一模擬試験 Webサイトより個人申し込みがありました】
--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(totalAmount).toLocaleString()} (税込)
■ 決済方法: ${paymentMethodLabel}
--------------------------------------------------
【生徒情報】
■ 生徒氏名: ${studentName} (${body.student_kana || "未入力"})
■ 学年: ${studentGrade}
■ 在籍中学校/小学校: ${body.student_school || "未入力"}
■ 性別: ${body.student_gender || "未回答"}

【保護者・連絡先情報】
■ 保護者氏名: ${body.parent_name || "未入力"} (${body.parent_kana || "未入力"})
■ メールアドレス: ${applicantEmail || "未入力"}
■ 電話番号: ${body.phone || "未入力"}
■ 郵便番号: 〒${body.postal_code || "未入力"}
■ 住所: ${body.address || [body.prefecture, body.address_line1, body.address_line2, body.address_line3].filter(Boolean).join(" ") || "未入力"}
--------------------------------------------------
■ スプレッドシート連携 (GAS): ${gasSuccess ? "連携成功" : "送信エラーまたは未完了"}
送信日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
`.trim();

    if (apiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "Okamoshi-Apply/1.0",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [adminEmail],
          reply_to: applicantEmail || undefined,
          subject: adminSubject,
          text: adminTextContent,
        }),
      }).catch((mailErr) => {
        console.error("Admin notification email failed:", mailErr);
      });

      if (applicantEmail) {
        const userSubject = "【岡山県統一模擬試験】お申し込みを受け付けました";
        const userTextContent = `
${body.parent_name ? body.parent_name + " 様\n（生徒様：" + studentName + " 様）\n\n" : ""}岡山県統一模擬試験（おかもし）へのお申し込み、誠にありがとうございます。
以下の内容でお申し込みを受け付けいたしました。

--------------------------------------------------
■ お申し込み模試:
${examsListText}
■ 合計金額: ￥${Number(totalAmount).toLocaleString()} (税込)
■ 決済方法: ${paymentMethodLabel}
--------------------------------------------------
【ご登録内容】
■ 生徒氏名: ${studentName} 様
■ 学年: ${studentGrade}
■ 学校名: ${body.student_school || "未入力"}
■ お届け先住所: 〒${body.postal_code || ""} ${body.address || [body.prefecture, body.address_line1, body.address_line2].filter(Boolean).join(" ")}
■ 電話番号: ${body.phone || ""}
--------------------------------------------------

${paymentMethodLabel === "コンビニ決済" ? `
【コンビニ決済をご選択された方へ】
決済代行システムより、お支払い番号・払込手順を記載した案内メールが別途届きます。
記載されたお支払い期限（受付日より3日以内）にお近くのコンビニエンスストアにてお支払いをお願いいたします。
期限を過ぎますとお申し込みは自動キャンセルとなりますのでご注意ください。
--------------------------------------------------
` : ""}
【今後のスケジュール・受験票のお届け】
・会場受験：試験日の約1週間前に受験票をご自宅宛てにお届けします。
・自宅受験：試験日の約1週間前に問題冊子・解答用紙一式をご自宅宛てにお届けします。

※本メールは送信専用アドレスより自動配信されています。
ご不明な点がございましたら、お手数ですが下記お問い合わせ窓口までご連絡ください。

--------------------------------------------------
岡山県統一模擬試験実行委員会（中央教育研究所株式会社）
〒730-0013 広島県広島市中区八丁堀15番6号 広島ちゅうぎんビル3階
TEL : 082-227-3999（平日 10:00〜18:00）
MAIL: info@okayama-moshi.com
Web : https://okayama-moshi.com
--------------------------------------------------
`.trim();

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Okamoshi-Apply/1.0",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [applicantEmail],
            subject: userSubject,
            text: userTextContent,
          }),
        }).catch((err) => {
          console.warn("User apply confirmation email failed (non-fatal):", err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: "success",
      message: "お申し込みを受け付けました",
      gas: gasSuccess,
      redirect_url: "/apply/success",
    });
  } catch (error: any) {
    console.error("Apply Route Internal Error:", error);
    return NextResponse.json({ success: false, message: error.message || "Server Error" }, { status: 500 });
  }
}
