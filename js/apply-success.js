/**
 * 申込完了ページ（/apply/success）後処理スクリプト
 * - Stripe セッション復元、模試種別に応じたリード文切替、コンビニ決済案内表示制御
 * - /api/apply 呼び出しによる初回メール送信トリガー（sessionStorage + localStorage 二重送信抑止付き）
 */
(async function processPostPaymentRegistration() {
  const APPLY_API_URL = '/api/apply';

  function getCookie(name) {
    const match = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  function restorePendingPayload(sessionId) {
    const sources = [];
    if (sessionId) {
      sources.push(
        localStorage.getItem('okamoshi_apply_' + sessionId),
        sessionStorage.getItem('okamoshi_apply_' + sessionId),
        getCookie('okamoshi_apply_' + sessionId)
      );
    }
    sources.push(
      localStorage.getItem('okamoshi_latest_application'),
      localStorage.getItem('okamoshi_pending_apply'),
      sessionStorage.getItem('okamoshi_latest_application'),
      sessionStorage.getItem('okamoshi_pending_apply'),
      getCookie('okamoshi_pending_apply'),
      localStorage.getItem('okamoshi_last_apply'),
      sessionStorage.getItem('okamoshi_last_apply')
    );

    for (const src of sources) {
      if (src) {
        try {
          const parsed = JSON.parse(src);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        } catch (e) {
          console.warn('JSON parse error on restored candidate:', e);
        }
      }
    }
    return null;
  }

  function detectExamTypeFromData(urlParams, dataObj) {
    if (urlParams) {
      const paramType = (urlParams.get('exam_type') || urlParams.get('type') || urlParams.get('exam') || '').toLowerCase();
      if (paramType === 'both') return 'both';
      if (paramType.includes('tekisei') || paramType.includes('適性')) return 'tekisei';
      if (paramType.includes('touitsu') || paramType.includes('統一')) return 'touitsu';
    }
    if (!dataObj || typeof dataObj !== 'object') return 'touitsu';

    const meta = dataObj.metadata || {};
    const explicitType = String(dataObj.exam_type || meta.exam_type || '').toLowerCase();
    if (explicitType === 'both') return 'both';
    if (explicitType.includes('tekisei') || explicitType.includes('適性')) return 'tekisei';
    if (explicitType.includes('touitsu') || explicitType.includes('統一')) return 'touitsu';

    let hasTekisei = false;
    let hasTouitsu = false;

    const checkToken = (str) => {
      const s = String(str || '').toLowerCase();
      if (!s) return;
      if (s.includes('適性') || s.includes('tekisei') || s.includes('sho6') || s.includes('p6') || s.includes('小学6') || s.includes('小6')) {
        hasTekisei = true;
      }
      if (s.includes('統一') || s.includes('おかもし') || s.includes('chu') || s.includes('中学') || /^c[123]$/.test(s)) {
        hasTouitsu = true;
      }
    };

    if (Array.isArray(dataObj.exams) && dataObj.exams.length > 0) {
      for (const ex of dataObj.exams) {
        if (!ex || typeof ex !== 'object') continue;
        const titleText = String(ex.title || ex.label || ex.exam_name || '');
        if (
          titleText.includes('適性') ||
          String(ex.id || '').toLowerCase().includes('tekisei') ||
          String(ex.id || '').toLowerCase().includes('sho6') ||
          String(ex.id || '').toLowerCase().includes('p6')
        ) {
          hasTekisei = true;
        } else if (titleText.includes('統一') || titleText.includes('おかもし')) {
          hasTouitsu = true;
        } else {
          checkToken(ex.grade || ex.grade_label || ex.id);
        }
      }
    }

    if (!hasTekisei && !hasTouitsu) {
      const examNameStr = String(dataObj.exam_name || meta.exam_name || '');
      if (examNameStr.includes('適性')) hasTekisei = true;
      if (examNameStr.includes('統一') || examNameStr.includes('おかもし')) hasTouitsu = true;
    }

    if (!hasTekisei && !hasTouitsu) {
      checkToken(
        dataObj.grade ||
          meta.grade ||
          dataObj.student_grade ||
          meta.student_grade ||
          dataObj.student_grade_label ||
          meta.student_grade_label
      );
    }

    if (hasTekisei && hasTouitsu) return 'both';
    if (hasTekisei) return 'tekisei';
    return 'touitsu';
  }

  function applyExamTitleToDom(examType) {
    const titleEl = document.getElementById('successExamTitle');
    if (!titleEl) return;
    if (examType === 'tekisei') {
      titleEl.textContent = '岡山県適性検査対策模試';
    } else if (examType === 'both') {
      titleEl.textContent = '岡山県統一模擬試験（おかもし）・岡山県適性検査対策模試';
    } else {
      titleEl.textContent = '岡山県統一模擬試験（おかもし）';
    }
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id') || urlParams.get('sessionId') || '';
    let payload = restorePendingPayload(sessionId);

    // 申し込んだ模試の種別に応じてリード文を即時切り替え
    applyExamTitleToDom(detectExamTypeFromData(urlParams, payload));

    // 決済方法に応じた案内ボックスの表示調整
    if (payload) {
      const isKonbini = payload.payment_method === 'konbini' || payload.raw_payment_method === 'convenience_store';
      const convBox = document.getElementById('convenienceStoreNotice');
      if (convBox && !isKonbini) {
        convBox.classList.add('hidden');
      }
    }

    if (!payload && !sessionId) {
      console.info('[apply/success] No pending application payload or session_id found.');
      return;
    }

    payload = payload || {};
    const meta = payload.metadata || {};

    // JST受付日時の生成
    const now = new Date();
    const jstReceivedAt = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(now)
      .replace(/\//g, '-');

    const activeSessionId = sessionId || payload.session_id || payload.stripe_session_id || meta.session_id || '';
    const studentFullName = payload.student_name || meta.student_name || payload.client_reference_id || '';
    const studentKanaFullName =
      payload.student_kana || meta.student_kana || payload.student_kana_name || meta.student_kana_name || payload.kana || meta.kana || '';
    const gradeVal =
      payload.grade || meta.grade || payload.student_grade_label || meta.student_grade_label || payload.student_grade || meta.student_grade || '';
    const schoolVal =
      payload.school_name || meta.school_name || payload.student_school || meta.student_school || payload.school || meta.school || '';
    const parentFullName = payload.parent_name || meta.parent_name || payload.guardian_name || meta.guardian_name || '';
    const venueVal =
      payload.venue_name ||
      meta.venue_name ||
      payload.venue ||
      meta.venue ||
      payload.venueName ||
      (Array.isArray(payload.exams) && payload.exams[0]?.venue_name) ||
      (Array.isArray(payload.exams) && payload.exams[0]?.venue) ||
      '会場未指定';
    const amountVal = Number(
      payload.amount ||
        meta.amount ||
        payload.total_amount ||
        meta.total_amount ||
        payload.price ||
        (Array.isArray(payload.exams) && payload.exams[0]?.price) ||
        0
    );
    const emailVal = payload.email || meta.email || payload.customer_email || '';
    const phoneVal = payload.phone || meta.phone || '';
    const paymentMethodVal =
      payload.payment_method ||
      meta.payment_method ||
      payload.selected_payment_method ||
      (payload.raw_payment_method === 'convenience_store' ? 'konbini' : 'card');
    const examNameVal =
      payload.exam_name || meta.exam_name || (Array.isArray(payload.exams) && payload.exams[0]?.title) || '岡山県統一模擬試験';

    // GAS 申込受付台帳・指定必須19項目およびエイリアス
    const gasPayload = {
      ...payload,
      received_at: jstReceivedAt,
      session_id: activeSessionId,
      exam_name: examNameVal,
      venue_name: venueVal,
      amount: amountVal,
      payment_status: 'paid',
      payment_method: paymentMethodVal,
      student_name: studentFullName,
      student_kana: studentKanaFullName,
      grade: gradeVal,
      school_name: schoolVal,
      parent_name: parentFullName,
      email: emailVal,
      phone: phoneVal,
      postal_code: payload.postal_code || meta.postal_code || '',
      prefecture: payload.prefecture || meta.prefecture || '',
      city: payload.city || meta.city || payload.address_line1 || '',
      address1: payload.address1 || meta.address1 || payload.address_line2 || '',
      address2: payload.address2 || meta.address2 || payload.address_line3 || '',

      venue: venueVal,
      venueName: venueVal,
      exam_venue: venueVal,
      total_amount: amountVal,
      price: amountVal,
      student_school: schoolVal,
      school: schoolVal,
      student_grade: gradeVal,
      student_grade_label: gradeVal,
      student_kana_name: studentKanaFullName,
      kana: studentKanaFullName,
      parent_kana: payload.parent_kana || meta.parent_kana || '',
      guardian_name: parentFullName,
      address:
        payload.address ||
        meta.address ||
        [
          payload.prefecture || meta.prefecture,
          payload.city || meta.city,
          payload.address1 || meta.address1,
          payload.address2 || meta.address2,
        ]
          .filter(Boolean)
          .join(' '),

      metadata: {
        ...meta,
        session_id: activeSessionId,
        student_name: studentFullName,
        student_kana: studentKanaFullName,
        grade: gradeVal,
        school_name: schoolVal,
        parent_name: parentFullName,
        venue_name: venueVal,
        amount: String(amountVal),
        email: emailVal,
        phone: phoneVal,
      },
    };

    // 二重送信防止チェック（sessionStorage + session_id 単位の localStorage 永続チェック）
    const registrationKey = 'okamoshi_registered_' + (activeSessionId || gasPayload.email + '_' + gasPayload.amount);
    let alreadyRegisteredInLocal = false;
    if (activeSessionId) {
      try {
        alreadyRegisteredInLocal = Boolean(localStorage.getItem(registrationKey));
      } catch (e) {}
    }
    if (sessionStorage.getItem(registrationKey) || alreadyRegisteredInLocal) {
      console.info('[apply/success] Application already processed in this browser:', registrationKey);
      return;
    }

    console.log('[apply/success] Triggering initial confirmation API (/api/apply):', gasPayload);

    // 1. バックエンド API (/api/apply) へ送信 (D1 冪等性ロック付き Resend メール通知)
    let backendSuccess = false;
    try {
      const res = await fetch(APPLY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gasPayload),
      });
      if (res.ok) {
        const apiResult = await res.json().catch(() => ({}));
        console.log('[apply/success] Backend API response:', apiResult);
        if (apiResult && (apiResult.exam_type || apiResult.exam_name || apiResult.exams)) {
          applyExamTitleToDom(detectExamTypeFromData(urlParams, apiResult));
        }
        backendSuccess = true;
        sessionStorage.setItem(registrationKey, 'true');
        if (activeSessionId) {
          try {
            localStorage.setItem(registrationKey, 'true');
          } catch (e) {}
        }
      } else {
        console.warn('[apply/success] Backend API responded with status:', res.status);
      }
    } catch (apiErr) {
      console.warn('[apply/success] Backend API call failed:', apiErr);
    }

    // 2. 台帳（スプレッドシート）への登録は Stripe Webhook が行うため、ここから GAS へは直接送信しない
    if (!backendSuccess) {
      console.warn('[apply/success] Notification API was not reachable. Ledger & email dispatch are handled by the Stripe webhook.');
    }
  } catch (err) {
    console.error('[apply/success] Error recording completed application:', err);
  }
})();
