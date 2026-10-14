/**
 * 模試データ型定義および正規化共通モジュール
 */

export interface ExamRecord {
  id: string;
  label: string;
  issue: string;
  title: string;
  venue: string;
  price: number;
  date: string;
}

/**
 * 月号ラベルを生成する（例: 「10月号（岡山県統一模擬試験）」）
 * 月号が取れない場合は「月号不明」を明示。括弧の多重ネストを防止。
 */
export const formatExamLabel = (
  issueRaw: string,
  title: string,
  id: string
): { issue: string; label: string } => {
  let issue = String(issueRaw || "").trim();
  if (issue && /^\d{1,2}月$/.test(issue)) issue += "号";
  if (!issue) {
    const m = String(id || "").match(/_(\d{1,2})$/);
    if (m) issue = `${Number(m[1])}月号`;
  }
  // 「岡山県統一模擬試験（おかもし）」→「岡山県統一模擬試験」（括弧の入れ子を避ける）
  const baseTitle = title.replace(/[（(][^（）()]*[）)]\s*$/, "").trim() || title;
  return {
    issue,
    label: issue ? `${issue}（${baseTitle}）` : `月号不明（${baseTitle}）`,
  };
};

/**
 * フロントから送られた exams 配列を正規化して ExamRecord[] を生成
 */
export const recordsFromExams = (exams: unknown): ExamRecord[] => {
  if (!Array.isArray(exams)) return [];
  const records: ExamRecord[] = [];
  for (const item of exams) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, any>;
    const title = String(e.title || e.exam_name || "岡山県統一模擬試験").trim();
    const venue = String(e.venue_name || e.venueLabel || e.venue || "").trim();
    const date = String(e.exam_date || e.examDate || "").trim();
    const id = e.id !== undefined && e.id !== null ? String(e.id) : "";
    const issueRaw = String(e.issue_name || e.issueName || "").trim();
    const price = Math.round(Number(e.price)) || 0;
    const { issue, label } = formatExamLabel(issueRaw, title, id);
    records.push({
      id,
      label,
      issue,
      title,
      venue,
      price,
      date,
    });
  }
  return records;
};

/**
 * Stripe session.metadata (exam_1, exam_2, ...) から ExamRecord[] を復元
 */
export const recordsFromMetadata = (metadata: Record<string, any> | undefined): ExamRecord[] => {
  if (!metadata || typeof metadata !== "object") return [];
  const records: ExamRecord[] = [];
  for (let i = 1; i <= 10; i++) {
    const raw = metadata[`exam_${i}`];
    if (!raw) continue;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object") {
        records.push({
          id: String(parsed.id || ""),
          label: String(parsed.label || ""),
          issue: String(parsed.issue || ""),
          title: String(parsed.title || ""),
          venue: String(parsed.venue || ""),
          price: Number(parsed.price) || 0,
          date: String(parsed.date || ""),
        });
      }
    } catch (e) {
      console.warn(`[exam] Failed to parse metadata exam_${i}:`, e);
    }
  }
  return records;
};
