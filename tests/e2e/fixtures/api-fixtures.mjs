/**
 * /api/exam-guides（Cloudflare D1）のレスポンスを再現するテスト用フィクスチャ
 * - 津山会場の「複数会場＋改行＋※注釈」ケースを含め、会場名表示の回帰テストに使用する
 * - 締切は遠い未来日付にして「受付中」状態を安定させる
 */
const scope = [
  { subject: '国語', topics: ['論説文', '小説', '古典'] },
  { subject: '数学', topics: ['二次方程式', '関数 y=ax²', '相似'] },
  { subject: '英語', topics: ['関係代名詞', '長文読解'] },
];

function venues(dateJp, homeRangeJp) {
  const list = [
    { badge: '岡山会場', school: '山陽学園中学校・高等学校', date: dateJp },
    {
      badge: '津山会場',
      school: '津山福祉総合会館、津山圏域雇用労働センター\n※会場は弊社にて決定',
      date: dateJp,
    },
    { badge: '自宅受験', school: '全国どこからでも', date: homeRangeJp },
  ];
  const details = list.map((v, i) => {
    const isHome = v.badge.includes('自宅');
    return {
      id: `v${i}`,
      name: isHome ? '🏠 自宅受験' : v.badge,
      place: isHome ? '全国どこからでも' : v.school,
      mapUrl: null,
      examDate: isHome ? `${homeRangeJp} 答案返送締切` : dateJp,
      ticketDispatch: isHome ? '2099年1月1日(木)頃に問題一式をご自宅へお届け' : '2099年1月1日(木)頃発送予定',
      reportDispatch: '2099年1月20日(火)発送予定',
      ticketShippingDate: '2099-01-01',
      ticketShippingDateJp: '2099年1月1日(木)',
      resultShippingDate: '2099-01-20',
      resultShippingDateJp: '2099年1月20日(火)',
      schedule: isHome
        ? [{ label: '問題同封の時間割・タイマーに沿って本番と同じ制限時間で自室にてご解答ください。', time: '' }]
        : [{ label: '集合・諸注意', time: '8:45 〜 9:00' }, { label: '第1科目 〜 最終科目', time: '9:05 〜 14:40' }],
      items: isHome
        ? 'お届けする問題用紙・解答用紙、筆記用具、同封の返信用封筒（ポスト投函）'
        : '受験票、筆記用具、コンパス、三角定規、腕時計、昼食・飲料、上履き（要持参）\n※会場により上履きが不要な場合があります',
      notice: null,
      home_return_deadline: isHome ? '2099-01-15' : null,
      homeReturnDeadline: isHome ? '2099年1月15日(木) 必着' : null,
      homeReturnDeadlineJp: isHome ? '2099年1月15日(木)' : null,
    };
  });
  return { list, details };
}

function round(monthNum, title) {
  const { list, details } = venues('2099年1月10日(土)', '2098年12月26日(金)〜1月10日(土)');
  return {
    id: `r${monthNum}`,
    monthNum,
    monthName: `${monthNum}月号`,
    title,
    catchCopy: '',
    announcement: '',
    fee: 5500,
    feeNote: '会場・自宅共通',
    subjectsNote: '',
    deadline: '2098年12月14日(日) 23:59まで',
    applyDeadlineRaw: '2098-12-14 23:59',
    ticketShippingDate: '2099-01-01',
    ticketShippingDateJp: '2099年1月1日(木)',
    ticketShippingNote: null,
    home_return_deadline: '2099-01-15',
    homeReturnDeadlineRaw: '2099-01-15',
    homeReturnDeadline: '2099年1月15日(木) 必着',
    homeReturnDeadlineJp: '2099年1月15日(木)',
    resultShippingDate: '2099-01-20',
    resultShippingDateJp: '2099年1月20日(火)',
    resultShippingNote: null,
    status: 'active',
    venuesList: list,
    venueDetails: details,
    scopeList: scope,
  };
}

function grade(code, name, examName) {
  return { gradeCode: code, gradeName: name, examName, price: 5500, rounds: [round(12, examName)] };
}

export const examGuidesFixture = {
  success: true,
  grades: {
    c3: grade('c3', '中3', '岡山県統一模擬試験'),
    c2: grade('c2', '中2', '岡山県統一模擬試験'),
    c1: grade('c1', '中1', '岡山県統一模擬試験'),
    p6: grade('p6', '小6', '岡山県適性検査対策模試'),
  },
  flat: { schedules: [], venues: [], timetables: [], scopes: [] },
};

export const cramSchoolsFixture = {
  success: true,
  districts: {
    okayama: { name: '岡山学区', count: 1, schools: [{ id: 1, area_id: 'okayama', area_name: '岡山学区', name: 'テスト塾 岡山校', website_url: '', phone_number: '086-000-0000', sort_order: 1 }] },
  },
  schools: [{ id: 1, area_id: 'okayama', area_name: '岡山学区', name: 'テスト塾 岡山校', website_url: '', phone_number: '086-000-0000', sort_order: 1 }],
};
