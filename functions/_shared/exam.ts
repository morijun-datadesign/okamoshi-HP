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
 * 全角括弧（...）および半角括弧(...)とその中身を除去してトリムする
 */
const stripParentheticals = (raw: string): string => {
  let s = String(raw || "").trim();
  if (!s) return "";
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/[（(][^（）()]*[）)]/g, "");
  }
  return s.replace(/[（(][^）)]*$/, "").trim();
};

/**
 * 受験会場の短縮名（会場区分名のみ・括弧/施設名なし）を返す
 * 例: 「倉敷会場（作陽学園高等学校）」 -> 「倉敷会場」、「自宅受験（問題冊子郵送...）」 -> 「自宅受験」
 */
export const normalizeVenueShortName = (rawVenue: string): string => {
  const original = String(rawVenue || "").trim();
  if (!original) return "";

  const codeMap: Record<string, string> = {
    venue_okayama: "岡山会場",
    venue_kurashiki: "倉敷会場",
    venue_tsuyama: "津山会場",
    home: "自宅受験",
  };
  const lower = original.toLowerCase();
  if (codeMap[lower]) return codeMap[lower];

  const cleaned = stripParentheticals(original)
    .replace(/[\r\n].*$/s, "")
    .replace(/\s*※.*$/, "")
    .trim();

  return cleaned || original;
};

/**
 * 対象模試の月号短縮表記（例: 「12月号」）を返す
 * issueRaw を優先し、存在しない場合は labelOrExamNameRaw の括弧除去や idRaw の末尾数字から補完する
 */
export const normalizeIssueShortName = (
  issueRaw: string,
  labelOrExamNameRaw = "",
  idRaw = ""
): string => {
  const extractIssueCandidate = (raw: string): string => {
    const stripped = stripParentheticals(raw)
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .trim();
    if (!stripped || stripped === "月号不明") return "";

    const exactMonth = stripped.match(/^(\d{1,2})\s*月号?$/);
    if (exactMonth) return `${Number(exactMonth[1])}月号`;

    const embeddedIssue = stripped.match(/(\d{1,2})\s*月号/);
    if (embeddedIssue) return `${Number(embeddedIssue[1])}月号`;

    return stripped;
  };

  const fromIssue = extractIssueCandidate(issueRaw);
  if (fromIssue) return fromIssue;

  const fromLabel = extractIssueCandidate(labelOrExamNameRaw);
  if (fromLabel) return fromLabel;

  const idMatch = String(idRaw || "").match(/_(\d{1,2})$/);
  if (idMatch) return `${Number(idMatch[1])}月号`;

  return stripParentheticals(issueRaw || labelOrExamNameRaw);
};

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
    const venue = normalizeVenueShortName(String(e.venue_type || e.venue_name || e.venueLabel || e.venue || "").trim());
    const date = String(e.exam_date || e.examDate || "").trim();
    const id = e.id !== undefined && e.id !== null ? String(e.id) : "";
    const issueRaw = String(e.issue_name || e.issueName || "").trim();
    const price = Math.round(Number(e.price)) || 0;
    const { issue: formattedIssue, label } = formatExamLabel(issueRaw, title, id);
    const issue = normalizeIssueShortName(formattedIssue, label, id);
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
        const id = String(parsed.id || "");
        const label = String(parsed.label || "");
        const issue = normalizeIssueShortName(String(parsed.issue || parsed.issue_name || ""), label, id);
        const venue = normalizeVenueShortName(String(parsed.venue_type || parsed.venue || parsed.venue_name || ""));
        records.push({
          id,
          label,
          issue,
          title: String(parsed.title || ""),
          venue,
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

/**
 * 模試名の比較用正規化（NFKC正規化＋空白除去）
 */
export const normalizeExamName = (name: string): string =>
  String(name || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();

/**
 * Stripe session.metadata（およびフォールバックの exam_name 文字列）から
 * 対象模試名（exam_name / label）の配列を抽出する（複数同時申込対応）
 */
export const extractExamNamesFromMetadata = (
  metadata: Record<string, any> | undefined,
  fallbackExamName = ""
): string[] => {
  const records = recordsFromMetadata(metadata);
  if (records.length > 0) {
    const names = records
      .map((r) => String(r.label || r.title || "").trim())
      .filter(Boolean);
    if (names.length > 0) return Array.from(new Set(names));
  }
  const raw = String(metadata?.exam_name || fallbackExamName || "").trim();
  if (!raw) return [];
  const splitNames = raw
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(splitNames));
};

export type ExamType = "touitsu" | "tekisei" | "both";

/**
 * 模試レコード配列や学年・模試名から模試種別（touitsu / tekisei / both）を判定する
 */
export const detectExamType = (
  records: ExamRecord[],
  examNameRaw = "",
  gradeRaw = "",
  explicitTypeRaw = ""
): ExamType => {
  const explicit = String(explicitTypeRaw || "").toLowerCase().trim();
  if (explicit === "both") return "both";
  if (explicit.includes("tekisei") || explicit.includes("適性")) return "tekisei";
  if (explicit.includes("touitsu") || explicit.includes("統一")) return "touitsu";

  let hasTekisei = false;
  let hasTouitsu = false;

  for (const r of records) {
    const t = `${r.title} ${r.label} ${r.id}`.toLowerCase();
    if (t.includes("適性") || t.includes("tekisei") || t.includes("sho6") || t.includes("p6")) {
      hasTekisei = true;
    } else if (t.includes("統一") || t.includes("おかもし") || t.includes("chu") || /^c[123]_/.test(t)) {
      hasTouitsu = true;
    }
  }

  if (!hasTekisei && !hasTouitsu && examNameRaw) {
    if (examNameRaw.includes("適性")) hasTekisei = true;
    if (examNameRaw.includes("統一") || examNameRaw.includes("おかもし")) hasTouitsu = true;
  }

  if (!hasTekisei && !hasTouitsu && gradeRaw) {
    const g = String(gradeRaw).toLowerCase();
    if (g.includes("sho6") || g.includes("p6") || g.includes("小学6") || g.includes("小6")) {
      hasTekisei = true;
    } else if (g.includes("chu") || g.includes("中学") || /^c[123]$/.test(g)) {
      hasTouitsu = true;
    }
  }

  if (hasTekisei && hasTouitsu) return "both";
  if (hasTekisei) return "tekisei";
  return "touitsu";
};

/**
 * 模試種別に応じた正式名称（リード文・メール挨拶文用）を返す
 */
export const getExamBrandTitle = (examType: ExamType): string => {
  if (examType === "tekisei") return "岡山県適性検査対策模試";
  if (examType === "both") return "岡山県統一模擬試験（おかもし）・岡山県適性検査対策模試";
  return "岡山県統一模擬試験（おかもし）";
};

