/**
 * microCMS exam-guides API TypeScript Type Definitions
 */

export interface ScheduleItem {
  fieldId?: 'schedule_item';
  /** 会場区分: ['岡山会場'], ['倉敷会場'], ['津山会場'], ['自宅'] など */
  venue_type: string[];
  /** 会場名 (例: 「山陽学園中学校・高等学校」) */
  venue_name?: string;
  /** ISO日時文字列 (例: "2026-10-31T15:00:00.000Z") */
  date_start: string;
  /** ISO日時文字列 (例: "2026-10-31T15:00:00.000Z") */
  date_end?: string;
}

export interface TimetableItem {
  fieldId?: 'timetable_item';
  /** 項目名 (例: "受付", "ガイダンス", "社会", "数学") */
  label: string;
  /** 時間帯 (例: "9:30〜9:50", "10:10 〜 10:55") */
  time_range: string;
}

export interface ExamSession {
  fieldId?: 'exam_session';
  is_active: boolean;
  issue_name: string;
  session_label?: string;
  notice_text?: string;
  title: string;
  catchphrase?: string;
  deadline?: string;
  fee?: string;
  fee_note?: string;
  apply_button_text?: string;
  apply_btn_text?: string;
  apply_url?: string;

  // 1. 会場受検用フィールド
  /** 受験票等の発送日 (例: "10月13日(火) 頃発送予定") */
  shipping_date_venue?: string;
  /** 当日持参物 (改行区切りの持ち物・注記テキスト) */
  belongings?: string;
  /** 当日の時間割 */
  timetable?: TimetableItem[];

  // 2. 自宅受検用フィールド
  /** 問題用紙等の発送日 (例: "10月13日(火) 頃発送予定") */
  shipping_date_home?: string;
  /** 答案提出締め切り (例: "2026年11月4日(水)" または ISO文字列) */
  submission_deadline?: string;
  /** 成績表のご返却予定 (例: "2026年11月12日(木) 発送予定") */
  return_date?: string;

  // 3. 実施日程・会場
  /** 実施日程・会場スケジュール配列 */
  schedules?: ScheduleItem[];

  // 後方互換用フィールド (リッチエディタ移行前)
  venue_exam_html?: string;
  home_exam_html?: string;
  guideline_html?: string;
  schedule_html?: string;
}

export interface ExamGuide {
  id: string;
  grade_code: 'c3' | 'c2' | 'c1' | 's6' | string;
  grade_label?: string;
  grade_name?: string;
  exam_name?: string;
  sessions: ExamSession[];
}
