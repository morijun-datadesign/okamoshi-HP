import re

with open('js/header.snippet.html', 'r', encoding='utf-8') as f:
    header_html = f.read()
with open('js/footer.snippet.html', 'r', encoding='utf-8') as f:
    footer_html = f.read()

with open('_11/code.html', 'r', encoding='utf-8') as f:
    c = f.read()

main_m = re.search(r'<main[^>]*>(.*?)</main>', c, re.DOTALL)
main_content = main_m.group(1).strip() if main_m else ''

# Replace the 3-button grade selector with 4 buttons: 小6, 中1, 中2, 中3
old_grade_selector_pattern = r'<div class=\"grid grid-cols-3 gap-3\">.*?<\/div>\s*<\/div>\s*<!-- STEP 1-2'

new_grade_selector = """<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3" id="gradeButtonGroup" role="radiogroup" aria-label="学年選択">
            <button type="button" onclick="selectFormGrade('sho6')" id="grade-btn-sho6" class="grade-select-btn flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 cursor-pointer hover:bg-surface-container transition-all text-center">
              <span class="font-headline-md text-lg sm:text-xl font-extrabold text-on-surface leading-tight">小6</span>
              <span class="text-[11px] text-on-surface-variant mt-0.5">適性検査対策</span>
            </button>
            <button type="button" onclick="selectFormGrade('chu1')" id="grade-btn-chu1" class="grade-select-btn flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 cursor-pointer hover:bg-surface-container transition-all text-center">
              <span class="font-headline-md text-lg sm:text-xl font-extrabold text-on-surface leading-tight">中1</span>
              <span class="text-[11px] text-on-surface-variant mt-0.5">基礎・標準模試</span>
            </button>
            <button type="button" onclick="selectFormGrade('chu2')" id="grade-btn-chu2" class="grade-select-btn flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 cursor-pointer hover:bg-surface-container transition-all text-center">
              <span class="font-headline-md text-lg sm:text-xl font-extrabold text-on-surface leading-tight">中2</span>
              <span class="text-[11px] text-on-surface-variant mt-0.5">公立入試基礎</span>
            </button>
            <button type="button" onclick="selectFormGrade('chu3')" id="grade-btn-chu3" class="grade-select-btn flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-primary-fixed/50 border-2 border-primary-container ring-2 ring-primary-container/20 cursor-pointer hover:bg-primary-fixed/60 transition-all text-center shadow-xs">
              <span class="font-headline-md text-lg sm:text-xl font-extrabold text-primary-container leading-tight">中3</span>
              <span class="text-[11px] text-primary-container font-bold mt-0.5">高校入試対策</span>
            </button>
          </div>
        </div><!-- STEP 1-2"""

main_content = re.sub(old_grade_selector_pattern, new_grade_selector, main_content, flags=re.DOTALL)

# Empty examOptionGroup so JavaScript dynamically renders it based on selected grade
main_content = re.sub(r'<div class=\"flex flex-col gap-3\" id=\"examOptionGroup\">.*?</div>\s*</div>\s*<!-- STEP 2',
                      '<div class="flex flex-col gap-3" id="examOptionGroup"><!-- Dynamic Exam Cards will be rendered here --></div></div><!-- STEP 2',
                      main_content, flags=re.DOTALL)

# Update form action / onsubmit
main_content = re.sub(r'<form([^>]*)>', r'<form\1 id="applicationForm" onsubmit="handleApplySubmit(event)">', main_content)

# Add contact id for in-page link
main_content = main_content.replace('id="contact-section"', 'id="contact"')
if 'id="contact"' not in main_content:
    main_content = re.sub(r'(<!-- STEP 3: 保護者)', r'<div id="contact"></div>\1', main_content)

# Tailwind config block
tailwind_config_block = """
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script id="tailwind-config">
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "tertiary-container": "#6c4c00",
            "outline-variant": "#c0c9c2",
            "error": "#ba1a1a",
            "on-error": "#ffffff",
            "on-tertiary": "#ffffff",
            "outline": "#717973",
            "surface-dim": "#dcd9d9",
            "on-surface": "#1b1c1c",
            "on-secondary-fixed-variant": "#822801",
            "surface-tint": "#3a6752",
            "surface-container-high": "#eae7e7",
            "surface-container-low": "#f6f3f2",
            "background": "#fcf9f8",
            "surface-container": "#f0eded",
            "on-tertiary-container": "#f1bd5a",
            "surface-variant": "#e4e2e1",
            "on-primary-fixed-variant": "#224f3c",
            "on-tertiary-fixed-variant": "#5e4200",
            "tertiary": "#4f3600",
            "surface-bright": "#fcf9f8",
            "inverse-primary": "#a1d1b8",
            "tertiary-fixed-dim": "#f2be5b",
            "on-secondary": "#ffffff",
            "on-surface-variant": "#414944",
            "on-primary-fixed": "#002114",
            "on-secondary-fixed": "#390c00",
            "surface-container-lowest": "#ffffff",
            "on-error-container": "#93000a",
            "on-background": "#1b1c1c",
            "error-container": "#ffdad6",
            "primary-container": "#2d5a46",
            "secondary-fixed-dim": "#ffb59c",
            "primary-fixed-dim": "#a1d1b8",
            "primary-fixed": "#bceed3",
            "on-secondary-container": "#6f2000",
            "surface": "#fcf9f8",
            "primary": "#134230",
            "on-tertiary-fixed": "#271900",
            "inverse-surface": "#303030",
            "tertiary-fixed": "#ffdea7",
            "secondary-container": "#fe8357",
            "inverse-on-surface": "#f3f0ef",
            "secondary": "#a23e18",
            "on-primary": "#ffffff",
            "secondary-fixed": "#ffdbcf",
            "surface-container-highest": "#e4e2e1",
            "on-primary-container": "#9fcfb6"
          },
          borderRadius: { "DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "2xl": "1rem", "3xl": "1.5rem", "full": "9999px" },
          spacing: {
            "gutter-desktop": "1.5rem",
            "space-3xl": "4.5rem",
            "space-md": "1rem",
            "container-max": "75rem",
            "space-lg": "1.5rem",
            "space-xs": "0.5rem",
            "gutter-mobile": "1rem",
            "space-4xl": "6rem",
            "space-2xs": "0.25rem",
            "space-xl": "2rem",
            "space-2xl": "3rem",
            "space-sm": "0.75rem"
          },
          fontFamily: {
            "body-md": ["Noto Sans JP", "sans-serif"],
            "headline-xl": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "headline-sm": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "body-lg": ["Noto Sans JP", "sans-serif"],
            "headline-md": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "headline-lg-mobile": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "headline-xl-mobile": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "label-sm": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "label-md": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "body-sm": ["Noto Sans JP", "sans-serif"],
            "headline-lg": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"],
            "label-lg": ["Plus Jakarta Sans", "Noto Sans JP", "sans-serif"]
          }
        }
      }
    };
  </script>
"""

apply_html = f"""<!DOCTYPE html>
<html lang="ja" class="scroll-smooth">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>模試Webお申込みフォーム | 岡山県統一模擬試験（おかもし）</title>
  <meta name="description" content="岡山県統一模擬試験（おかもし）の個人受験Webお申込みフォームです。中3・中2・中1・小6対象。希望模試、会場受験（岡山・倉敷・津山）または自宅受験を選択して簡単にお申し込みいただけます。">
  <link rel="canonical" href="https://okamoshi.pages.dev/apply.html">
  
  <!-- OGP -->
  <meta property="og:title" content="模試Webお申込みフォーム | 岡山県統一模擬試験（おかもし）">
  <meta property="og:description" content="岡山県統一模擬試験（おかもし）の個人受験Webお申込みフォームです。中3・中2・中1・小6対象。">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://okamoshi.pages.dev/apply.html">
  <meta property="og:image" content="https://okamoshi.pages.dev/og-image.jpg">
  <meta property="og:site_name" content="岡山県統一模擬試験（おかもし）">
  <meta name="twitter:card" content="summary_large_image">

  <!-- Fonts & Icons -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">

  {tailwind_config_block}

  <!-- JSON-LD 構造化データ -->
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "模試Webお申込みフォーム | 岡山県統一模擬試験",
    "description": "岡山県統一模擬試験の個人受験Webお申込みフォームです。",
    "url": "https://okamoshi.pages.dev/apply.html",
    "publisher": {{
      "@type": "Organization",
      "name": "岡山県統一模擬試験実行委員会",
      "url": "https://okamoshi.pages.dev/"
    }}
  }}
  </script>
</head>
<body class="bg-background font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between selection:bg-primary/20 selection:text-primary pt-16 sm:pt-20">

  {header_html}

  <main class="flex-1 w-full flex flex-col items-center">
    {main_content}

    <!-- Success Modal Overlay -->
    <div id="successModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center p-4">
      <div class="bg-surface-container-lowest rounded-3xl p-6 sm:p-10 max-w-lg w-full shadow-2xl border border-outline-variant/30 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div class="w-16 h-16 rounded-full bg-[#e8f5ee] text-[#134230] flex items-center justify-center mx-auto shadow-sm">
          <span class="material-symbols-outlined text-4xl">check_circle</span>
        </div>
        <div class="space-y-2">
          <h3 class="font-headline-md text-2xl font-bold text-primary">お申し込みを受け付けました</h3>
          <p class="text-sm text-on-surface-variant leading-relaxed">
            ご入力いただいたメールアドレス宛に、お申し込み受付完了メールおよび決済案内を送信いたしました。内容をご確認ください。
          </p>
        </div>
        <div class="p-4 rounded-2xl bg-surface-container-low text-left text-xs text-on-surface-variant space-y-1.5 border border-outline-variant/20">
          <div class="flex justify-between">
            <span>受付番号:</span>
            <strong class="text-on-surface font-mono" id="modalReceiptNo">OKM-2026-9812</strong>
          </div>
          <div class="flex justify-between">
            <span>対象学年:</span>
            <strong class="text-on-surface" id="modalGradeName">中3</strong>
          </div>
          <div class="flex justify-between">
            <span>ご請求合計:</span>
            <strong class="text-primary font-bold" id="modalTotalAmount">¥5,500（税込）</strong>
          </div>
        </div>
        <div class="pt-2">
          <a href="index.html" class="inline-flex items-center justify-center w-full py-3.5 px-6 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-md hover:bg-primary-container transition-all">
            トップページへ戻る
          </a>
        </div>
      </div>
    </div>
  </main>

  {footer_html}

  <script src="js/common.js"></script>
  <script src="js/microcms.js"></script>

  <!-- Form Logic: Dynamic Grade Filtering & n8n Webhook Integration -->
  <script>
    // ========================================================
    // 1. n8n WEBHOOK 設定
    // ========================================================
    const N8N_WEBHOOK_URL = 'YOUR_N8N_WEBHOOK_URL';

    // ========================================================
    // 2. 学年別模試マスターデータ
    // ========================================================
    const EXAMS_DATABASE = {{
      'chu3': [
        {{
          id: 'chu3_10',
          grade: '中3',
          title: '第2回 岡山県統一模擬試験（10月号）',
          badge: '中3対象・受付中',
          examDate: '10/18(日)',
          deadline: '10/11(日)',
          price: 5500,
          isNext: true,
          checked: true
        }},
        {{
          id: 'chu3_11',
          grade: '中3',
          title: '第3回 岡山県統一模擬試験（11月号）',
          badge: '中3対象',
          examDate: '11/15(日)',
          deadline: '11/8(日)',
          price: 5500,
          isNext: false,
          checked: false
        }},
        {{
          id: 'chu3_12',
          grade: '中3',
          title: '第4回 岡山県統一模擬試験（12月号）',
          badge: '中3対象',
          examDate: '12/20(日)',
          deadline: '12/13(日)',
          price: 5500,
          isNext: false,
          checked: false
        }},
        {{
          id: 'chu3_01',
          grade: '中3',
          title: '第5回 岡山県統一模擬試験（1月号 直前対策）',
          badge: '中3対象',
          examDate: '1/17(日)',
          deadline: '1/10(日)',
          price: 5500,
          isNext: false,
          checked: false
        }}
      ],
      'chu2': [
        {{
          id: 'chu2_12',
          grade: '中2',
          title: '第2回 中2 岡山県統一模擬試験（12月号）',
          badge: '中2対象・受付中',
          examDate: '12/20(日)',
          deadline: '12/13(日)',
          price: 4400,
          isNext: true,
          checked: true
        }},
        {{
          id: 'chu2_03',
          grade: '中2',
          title: '第3回 中2 岡山県統一模擬試験（3月号 学年末対策）',
          badge: '中2対象',
          examDate: '3/14(日)',
          deadline: '3/7(日)',
          price: 4400,
          isNext: false,
          checked: false
        }}
      ],
      'chu1': [
        {{
          id: 'chu1_12',
          grade: '中1',
          title: '第2回 中1 岡山県統一模擬試験（12月号）',
          badge: '中1対象・受付中',
          examDate: '12/20(日)',
          deadline: '12/13(日)',
          price: 4400,
          isNext: true,
          checked: true
        }},
        {{
          id: 'chu1_03',
          grade: '中1',
          title: '第3回 中1 岡山県統一模擬試験（3月号 学年末対策）',
          badge: '中1対象',
          examDate: '3/14(日)',
          deadline: '3/7(日)',
          price: 4400,
          isNext: false,
          checked: false
        }}
      ],
      'sho6': [
        {{
          id: 'sho6_10',
          grade: '小6',
          title: '第2回 岡山県立中高一貫校 適性検査対策模試（10月号）',
          badge: '小6対象・受付中',
          examDate: '10/18(日)',
          deadline: '10/11(日)',
          price: 5500,
          isNext: true,
          checked: true
        }},
        {{
          id: 'sho6_12',
          grade: '小6',
          title: '第3回 岡山県立中高一貫校 適性検査対策模試（12月号 直前対策）',
          badge: '小6対象',
          examDate: '12/13(日)',
          deadline: '12/6(日)',
          price: 5500,
          isNext: false,
          checked: false
        }}
      ]
    }};

    let currentSelectedGrade = 'chu3';
    let selectedExamsState = {{}};

    // ========================================================
    // 3. 学年切り替えボタンの制御
    // ========================================================
    function selectFormGrade(gradeKey) {{
      currentSelectedGrade = gradeKey;
      const grades = ['sho6', 'chu1', 'chu2', 'chu3'];

      grades.forEach(g => {{
        const btn = document.getElementById('grade-btn-' + g);
        if (!btn) return;

        const title = btn.querySelector('span:first-child');
        const desc = btn.querySelector('span:last-child');

        if (g === gradeKey) {{
          btn.className = 'grade-select-btn flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-primary-fixed/50 border-2 border-primary-container ring-2 ring-primary-container/20 cursor-pointer hover:bg-primary-fixed/60 transition-all text-center shadow-xs';
          if (title) title.className = 'font-headline-md text-lg sm:text-xl font-extrabold text-primary-container leading-tight';
          if (desc) desc.className = 'text-[11px] text-primary-container font-bold mt-0.5';
        }} else {{
          btn.className = 'grade-select-btn flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 cursor-pointer hover:bg-surface-container transition-all text-center';
          if (title) title.className = 'font-headline-md text-lg sm:text-xl font-extrabold text-on-surface leading-tight';
          if (desc) desc.className = 'text-[11px] text-on-surface-variant mt-0.5';
        }}
      }});

      renderExamCards(gradeKey);
    }}

    // ========================================================
    // 4. 対象学年の模試カード一覧の動的レンダリング
    // ========================================================
    function renderExamCards(gradeKey) {{
      const container = document.getElementById('examOptionGroup');
      if (!container) return;

      const exams = EXAMS_DATABASE[gradeKey] || [];
      selectedExamsState = {{}};

      container.innerHTML = exams.map((exam, index) => {{
        // 初期状態として次回の模試をチェック
        const isChecked = exam.checked;
        if (isChecked) {{
          selectedExamsState[exam.id] = {{
            ...exam,
            venue: 'venue_okayama'
          }};
        }}

        return `
          <div class="relative flex flex-col p-4 sm:p-5 rounded-2xl ${{isChecked ? 'bg-primary-fixed/30 border-2 border-primary-container' : 'bg-surface-container-lowest border border-outline-variant/30'}} shadow-sm gap-3 transition-all duration-200" id="card-${{exam.id}}">
            <label class="flex items-start justify-between gap-3 cursor-pointer">
              <div class="flex items-start gap-3 flex-1">
                <input type="checkbox" id="check-${{exam.id}}" name="selected_exam_${{exam.id}}" ${{isChecked ? 'checked' : ''}} 
                  onchange="toggleExamSelection('${{exam.id}}')"
                  class="mt-1 w-5 h-5 text-primary-container accent-primary-container rounded cursor-pointer shrink-0">
                <div class="flex flex-col">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="bg-primary text-on-primary font-label-sm text-[11px] px-2 py-0.5 rounded-full font-bold">${{exam.badge}}</span>
                  </div>
                  <span class="font-headline-sm text-base sm:text-lg font-bold text-on-surface leading-snug">${{exam.title}}</span>
                  <div class="flex items-center gap-4 mt-1.5 text-on-surface-variant font-body-sm text-xs sm:text-[13px] flex-wrap">
                    <span>実施日: <strong class="text-primary font-bold">${{exam.examDate}}</strong></span>
                    <span>申込締切: <strong class="text-secondary font-bold">${{exam.deadline}}</strong></span>
                  </div>
                </div>
              </div>
              <div class="flex flex-col items-end shrink-0">
                <span class="font-headline-sm text-base sm:text-lg font-extrabold text-primary-container">¥${{exam.price.toLocaleString()}}</span>
                <span class="font-body-sm text-[11px] text-on-surface-variant">税込</span>
              </div>
            </label>

            <div class="pt-3 border-t border-outline-variant/30 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
              <label class="md:col-span-4 font-label-md text-xs sm:text-sm font-bold text-primary flex items-center gap-1.5 pl-1">
                <span class="material-symbols-outlined text-base">apartment</span>受験方法・希望会場
              </label>
              <div class="md:col-span-8 relative">
                <select id="venue-${{exam.id}}" onchange="updateExamVenue('${{exam.id}}', this.value)"
                  class="w-full h-10 sm:h-11 pl-3 pr-9 bg-surface-container-lowest text-on-surface rounded-xl font-body-sm text-xs sm:text-sm appearance-none border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary-container shadow-2xs">
                  <option value="venue_okayama" selected>岡山会場（岡山大学 津島キャンパス / 山陽学園）</option>
                  <option value="venue_kurashiki">倉敷会場（倉敷商工会議所）</option>
                  <option value="venue_tsuyama">津山会場（美作大学）</option>
                  <option value="home">自宅受験（問題冊子郵送・期日内答案返送）</option>
                </select>
                <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-base">expand_more</span>
              </div>
            </div>
          </div>
        `;
      }}).join('');

      updateSummary();
    }}

    // 模試選択のON/OFF切り替え
    function toggleExamSelection(examId) {{
      const chk = document.getElementById('check-' + examId);
      const card = document.getElementById('card-' + examId);
      const venueSelect = document.getElementById('venue-' + examId);
      const exams = EXAMS_DATABASE[currentSelectedGrade] || [];
      const examData = exams.find(e => e.id === examId);

      if (!chk || !examData) return;

      if (chk.checked) {{
        selectedExamsState[examId] = {{
          ...examData,
          venue: venueSelect ? venueSelect.value : 'venue_okayama'
        }};
        if (card) {{
          card.classList.remove('bg-surface-container-lowest', 'border-outline-variant/30');
          card.classList.add('bg-primary-fixed/30', 'border-2', 'border-primary-container');
        }}
      }} else {{
        delete selectedExamsState[examId];
        if (card) {{
          card.classList.remove('bg-primary-fixed/30', 'border-2', 'border-primary-container');
          card.classList.add('bg-surface-container-lowest', 'border-outline-variant/30');
        }}
      }}

      updateSummary();
    }}

    // 会場変更の反映
    function updateExamVenue(examId, venueValue) {{
      if (selectedExamsState[examId]) {{
        selectedExamsState[examId].venue = venueValue;
      }}
    }}

    // ========================================================
    // 5. お申し込みサマリー（合計金額）の自動更新
    // ========================================================
    function updateSummary() {{
      const selectedList = Object.values(selectedExamsState);
      const totalAmount = selectedList.reduce((sum, item) => sum + item.price, 0);

      // サマリー内要素の更新
      const summaryListElem = document.getElementById('summarySelectedExams') || document.querySelector('[data-summary-list]');
      const summaryTotalElem = document.getElementById('summaryTotalAmount') || document.querySelector('[data-summary-total]');

      if (summaryTotalElem) {{
        summaryTotalElem.textContent = '¥' + totalAmount.toLocaleString();
      }}

      // 全体UI内の該当テキストも更新
      document.querySelectorAll('.js-total-price').forEach(el => {{
        el.textContent = '¥' + totalAmount.toLocaleString();
      }});
    }}

    // ========================================================
    // 6. n8n Webhook へのデータ送信 (handleApplySubmit)
    // ========================================================
    async function handleApplySubmit(e) {{
      e.preventDefault();

      const form = document.getElementById('applicationForm');
      if (!form) return;

      const selectedExams = Object.values(selectedExamsState);
      if (selectedExams.length === 0) {{
        alert('受検を希望する模試を1つ以上選択してください。');
        return;
      }}

      // 送信データオブジェクトの構築
      const formData = new FormData(form);
      const totalAmount = selectedExams.reduce((sum, item) => sum + item.price, 0);

      const payload = {{
        timestamp: new Date().toISOString(),
        selectedGrade: currentSelectedGrade,
        gradeLabel: {{ 'sho6': '小6', 'chu1': '中1', 'chu2': '中2', 'chu3': '中3' }}[currentSelectedGrade] || currentSelectedGrade,
        selectedExams: selectedExams.map(ex => ({{
          id: ex.id,
          title: ex.title,
          examDate: ex.examDate,
          price: ex.price,
          venue: ex.venue
        }})),
        student: {{
          lastName: formData.get('student_last_name') || '',
          firstName: formData.get('student_first_name') || '',
          kanaLastName: formData.get('student_kana_last_name') || '',
          kanaFirstName: formData.get('student_kana_first_name') || '',
          gender: formData.get('student_gender') || '',
          schoolName: formData.get('student_school') || '',
          grade: currentSelectedGrade
        }},
        parent: {{
          name: formData.get('parent_name') || '',
          email: formData.get('parent_email') || '',
          phone: formData.get('parent_phone') || '',
          postalCode: formData.get('postal_code') || '',
          prefecture: formData.get('prefecture') || '',
          address: formData.get('address') || '',
          building: formData.get('building') || ''
        }},
        paymentMethod: formData.get('payment_method') || 'credit_card',
        summary: {{
          examCount: selectedExams.length,
          totalAmount: totalAmount,
          currency: 'JPY'
        }}
      }};

      console.log('[お申込み送信データ]', payload);

      // ボタンを「送信中...」にして二重送信防止
      const submitBtn = form.querySelector('button[type=\"submit\"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {{
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <span class="inline-block animate-spin mr-2">⟳</span>
          <span>送信処理中...</span>
        `;
      }}

      try {{
        // n8n Webhook が有効な場合に POST 送信
        if (N8N_WEBHOOK_URL && N8N_WEBHOOK_URL !== 'YOUR_N8N_WEBHOOK_URL') {{
          const res = await fetch(N8N_WEBHOOK_URL, {{
            method: 'POST',
            headers: {{
              'Content-Type': 'application/json'
            }},
            body: JSON.stringify(payload)
          }});
          if (!res.ok) {{
            console.warn('[n8n Webhook] 送信レスポンスステータス:', res.status);
          }}
        }} else {{
          console.info('[n8n Webhook] N8N_WEBHOOK_URLが未設定のため、シミュレーション完了として処理します。');
          // 擬似通信待機
          await new Promise(r => setTimeout(r, 600));
        }}

        // 成功モーダルの表示
        const modal = document.getElementById('successModal');
        const modalReceipt = document.getElementById('modalReceiptNo');
        const modalGrade = document.getElementById('modalGradeName');
        const modalTotal = document.getElementById('modalTotalAmount');

        if (modalReceipt) modalReceipt.textContent = 'OKM-' + Math.floor(100000 + Math.random() * 900000);
        if (modalGrade) modalGrade.textContent = payload.gradeLabel;
        if (modalTotal) modalTotal.textContent = '¥' + totalAmount.toLocaleString() + '（税込）';

        if (modal) {{
          modal.classList.remove('hidden');
        }} else {{
          alert('お申し込みを受け付けました。ご入力ありがとうございます。');
          window.location.href = 'index.html';
        }}
      }} catch (err) {{
        console.error('[n8n Webhook 送信エラー]:', err);
        alert('通信エラーが発生しました。お手数ですが、もう一度お試しいただくかお電話でお問い合わせください。');
      }} finally {{
        if (submitBtn) {{
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }}
      }}
    }}

    // 初期実行: 中3を選択
    document.addEventListener('DOMContentLoaded', function() {{
      selectFormGrade('chu3');
    }});
  </script>
</body>
</html>"""

with open('apply.html', 'w', encoding='utf-8') as f:
    f.write(apply_html)

print('apply.html written successfully')
