/**
 * 申込フォーム入力ガード共通モジュール（サーバーサイド検証・正規化）
 *
 * - 在籍小中学校名のオートフィル誤爆（生徒名・保護者名の一致）および不正書式の検証
 * - 住所（町名・丁目・番地）における都道府県・市区町村・町名の重複自動クレンジング
 */

export interface PersonNameFields {
  studentName?: string;
  studentLastName?: string;
  studentFirstName?: string;
  studentKana?: string;
  studentKanaLastName?: string;
  studentKanaFirstName?: string;
  parentName?: string;
  parentLastName?: string;
  parentFirstName?: string;
  parentKana?: string;
  parentKanaLastName?: string;
  parentKanaFirstName?: string;
}

export type SchoolValidationCode = "empty" | "matches_person_name" | "invalid_school_format";

export interface SchoolValidationResult {
  valid: boolean;
  code?: SchoolValidationCode;
  message?: string;
}

const SCHOOL_NAME_KEYWORD_RE =
  /(小|中|高|学|校|園|義務|教育|支援|附属|付属|中等|分校|インター|ホームスクール|フリースクール|school|academy|elementary|junior|high)/i;

/**
 * NFKC正規化および全角・半角空白除去を行う
 */
export const normalizeCompact = (raw: string): string =>
  String(raw || "")
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .trim();

/**
 * ひらがなをカタカナへ統一する（姓・名・フリガナの表記揺れ対策）
 */
export const toKatakana = (raw: string): string =>
  String(raw || "").replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));

/**
 * 生徒・保護者の「姓」「名」「フルネーム」「セイ」「メイ」「フルフリガナ」の比較用セットを構築する
 */
export const collectPersonNameTokens = (names: PersonNameFields): Set<string> => {
  const tokens = new Set<string>();

  const register = (raw?: string): void => {
    const val = String(raw || "").trim();
    if (!val) return;
    const compact = normalizeCompact(val);
    if (compact) {
      tokens.add(compact);
      tokens.add(toKatakana(compact));
    }
    const parts = val.split(/[\s\u3000]+/).filter(Boolean);
    for (const part of parts) {
      const pCompact = normalizeCompact(part);
      if (pCompact) {
        tokens.add(pCompact);
        tokens.add(toKatakana(pCompact));
      }
    }
  };

  register(names.studentName);
  register(names.studentLastName);
  register(names.studentFirstName);
  if (names.studentLastName || names.studentFirstName) {
    register(`${names.studentLastName || ""}${names.studentFirstName || ""}`);
  }

  register(names.studentKana);
  register(names.studentKanaLastName);
  register(names.studentKanaFirstName);
  if (names.studentKanaLastName || names.studentKanaFirstName) {
    register(`${names.studentKanaLastName || ""}${names.studentKanaFirstName || ""}`);
  }

  register(names.parentName);
  register(names.parentLastName);
  register(names.parentFirstName);
  if (names.parentLastName || names.parentFirstName) {
    register(`${names.parentLastName || ""}${names.parentFirstName || ""}`);
  }

  register(names.parentKana);
  register(names.parentKanaLastName);
  register(names.parentKanaFirstName);
  if (names.parentKanaLastName || names.parentKanaFirstName) {
    register(`${names.parentKanaLastName || ""}${names.parentKanaFirstName || ""}`);
  }

  return tokens;
};

/**
 * 在籍小中学校名の厳格バリデーション
 */
export const validateSchoolName = (
  schoolNameRaw: string,
  names: PersonNameFields = {}
): SchoolValidationResult => {
  const compact = normalizeCompact(schoolNameRaw);
  if (!compact) {
    return {
      valid: false,
      code: "empty",
      message: "在籍小中学校名を入力してください。",
    };
  }

  const personTokens = collectPersonNameTokens(names);
  if (personTokens.has(compact) || personTokens.has(toKatakana(compact))) {
    return {
      valid: false,
      code: "matches_person_name",
      message: "在籍校欄にお名前が入力されています。在籍されている小・中学校名をご入力ください。",
    };
  }

  if (!SCHOOL_NAME_KEYWORD_RE.test(compact)) {
    return {
      valid: false,
      code: "invalid_school_format",
      message: "正しい学校名（〇〇中学校・〇〇小学校など）をご入力ください。",
    };
  }

  return { valid: true };
};

/**
 * 先頭の都道府県名・市区町村名（郡名付き/政令指定都市区含む）プレフィックスを安全に除去する
 */
export const stripPrefCityPrefix = (raw: string, pref = "", city = ""): string => {
  let s = String(raw || "").trim();
  if (!s) return "";

  const cleanPref = String(pref || "").trim();
  if (cleanPref && s.startsWith(cleanPref)) {
    const rest = s.slice(cleanPref.length).replace(/^[\s\u3000]+/, "");
    if (rest.replace(/[\s\u3000]+/g, "")) {
      s = rest;
    }
  }

  const cleanCity = String(city || "").trim();
  if (cleanCity) {
    if (s.startsWith(cleanCity)) {
      const rest = s.slice(cleanCity.length).replace(/^[\s\u3000]+/, "");
      if (rest.replace(/[\s\u3000]+/g, "")) {
        s = rest;
      }
    } else {
      const subMatch = cleanCity.match(/^(.+郡)(.+[町村])$/) || cleanCity.match(/^(.+市)(.+区)$/);
      if (subMatch && subMatch[2] && s.startsWith(subMatch[2])) {
        const rest = s.slice(subMatch[2].length).replace(/^[\s\u3000]+/, "");
        if (rest.replace(/[\s\u3000]+/g, "")) {
          s = rest;
        }
      }
    }
  }

  return s.trim();
};

/**
 * 例: town="福田町福田", street="福田2413-6" のとき、末尾サフィックス重複部分 "福田" を返す
 * 誤爆防止のため、2文字以上の非数字文字列かつ直後が数字・漢数字始まりに限定する
 */
export const findDuplicateTownSuffix = (town: string, street: string): string => {
  const cleanTown = String(town || "").trim();
  const cleanStreet = String(street || "").trim();
  const lenTown = cleanTown.length;
  if (lenTown < 3 || !cleanStreet) return "";

  for (let len = lenTown - 1; len >= 2; len--) {
    const suffix = cleanTown.slice(lenTown - len);
    if (/[0-9０-９]/.test(suffix)) continue;
    if (cleanStreet.startsWith(suffix)) {
      const after = cleanStreet.slice(suffix.length);
      if (/^(?:[\s\u3000]+)?[0-9０-９〇一二三四五六七八九十]/.test(after)) {
        return suffix;
      }
    }
  }
  return "";
};

/**
 * 単一の「町名・丁目・番地」文字列内の重複（"長尾 長尾1441-1" や "福田町福田 福田2413-6" など）および
 * 地域名重複（"岡山県英田郡西粟倉村長尾1441-1" など）を正規化する
 */
export const dedupeSingleAddressLine = (rawAddr1: string, pref = "", city = ""): string => {
  let s = stripPrefCityPrefix(String(rawAddr1 || "").trim(), pref, city);
  if (!s) return "";

  for (let i = 0; i < 4; i++) {
    const m = s.match(/^([^\s\u3000]+)[\s\u3000]+(.+)$/);
    if (!m) break;

    const head = stripPrefCityPrefix(m[1].trim(), pref, city);
    const tail = stripPrefCityPrefix(m[2].trim(), pref, city);

    if (head && !/[0-9０-９]/.test(head)) {
      if (tail.startsWith(head)) {
        s = tail;
        continue;
      }
      const dupSuffix = findDuplicateTownSuffix(head, tail);
      if (dupSuffix) {
        const rest = tail.slice(dupSuffix.length).replace(/^[\s\u3000]+/, "");
        s = rest ? `${head} ${rest}` : head;
        break;
      }
    }

    const normalizedPair = `${head} ${tail}`.trim();
    if (normalizedPair !== s) {
      s = normalizedPair;
      break;
    }
    break;
  }

  return s.trim();
};

/**
 * 町名（town）と番地（street）を重複なく安全に結合する
 */
export const combineTownAndStreet = (params: {
  pref?: string;
  city?: string;
  town?: string;
  street?: string;
}): string => {
  const pref = params.pref || "";
  const city = params.city || "";
  const cleanTown = stripPrefCityPrefix(params.town || "", pref, city);
  const cleanStreet = stripPrefCityPrefix(params.street || "", pref, city);

  if (!cleanTown) {
    return dedupeSingleAddressLine(cleanStreet, pref, city);
  }
  if (!cleanStreet) {
    return dedupeSingleAddressLine(cleanTown, pref, city);
  }
  if (cleanStreet.startsWith(cleanTown)) {
    return dedupeSingleAddressLine(cleanStreet, pref, city);
  }
  const dupSuffix = findDuplicateTownSuffix(cleanTown, cleanStreet);
  if (dupSuffix) {
    const rest = cleanStreet.slice(dupSuffix.length).replace(/^[\s\u3000]+/, "");
    return rest ? `${cleanTown} ${rest}` : cleanTown;
  }

  return dedupeSingleAddressLine(`${cleanTown} ${cleanStreet}`, pref, city);
};

/**
 * 町名・丁目・番地（addr1）の正規化統合エントリポイント
 */
export const cleanAddressLine1 = (params: {
  pref?: string;
  city?: string;
  town?: string;
  addr1?: string;
}): string => {
  const pref = params.pref || "";
  const city = params.city || "";
  const town = String(params.town || "").trim();
  const addr1 = String(params.addr1 || "").trim();

  if (town) {
    return combineTownAndStreet({ pref, city, town, street: addr1 });
  }
  return dedupeSingleAddressLine(addr1, pref, city);
};
