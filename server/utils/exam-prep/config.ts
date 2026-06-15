// 学習対策ドリルの「ドメイン定義」。
// 試験・検定・社内研修を差し替えるときは、基本このファイルだけを編集する。
// (元仕様の domain-config.json + genres.json を、サーバー側 TS にまとめたもの。
//  出題範囲フィルタはサーバーで実行し、クライアントには getMe 経由で必要分だけ渡す。)

export interface SegmentDef {
  id: string
  label: string
  hint?: string
  /** オンボーディングで最上位に出す推奨種別 */
  isRecommendedDefault?: boolean
}

export interface ExamTargetDef {
  id: string
  label: string
  /** genres の examLevel と突き合わせる */
  examLevel: string
}

export interface DomainConfig {
  appId: string
  appTitle: string
  appSubtitle: string
  examLabel: string
  /** ISO (YYYY-MM-DD)。試験日カウントダウンに使う */
  examDate: string
  /** AI 出題プロンプトの「あなたは ○○ の出題者」に入る文字列 */
  aiSubject: string
  segments: SegmentDef[]
  examTargetOptions: ExamTargetDef[]
}

export interface GenreGroup {
  id: string
  title: string
  examLevel: string
  /** その種別に関係する group か。空配列 = 全 segment 共通 */
  segmentRelevance: string[]
  genres: string[]
}

// ===== ドメイン: 施工管理2級(2級建築施工管理技士・第一次検定)=====
export const DOMAIN_CONFIG: DomainConfig = {
  appId: 'exam-prep',
  appTitle: '施工管理2級ドリル',
  appSubtitle: '2級建築施工管理技士 一問一答',
  examLabel: '2級建築施工管理技士(第一次検定)',
  // 実際の試験日に合わせて編集する(目安として後期日程を仮置き)
  examDate: '2026-11-15',
  aiSubject: '2級建築施工管理技士(第一次検定)',
  segments: [
    {
      id: '建築',
      label: '建築',
      isRecommendedDefault: true,
      hint: '建築一式。躯体・仕上げ両方が出ます(迷ったらこれ)',
    },
    { id: '躯体', label: '躯体', hint: '鉄筋・型枠・コンクリート・鉄骨など構造体が中心' },
    { id: '仕上げ', label: '仕上げ', hint: '防水・左官・タイル・建具・内装・塗装など仕上げが中心' },
  ],
  // 1種類だけなので、オンボーディングの受験パターン選択(STEP2)は自動スキップされる
  examTargetOptions: [{ id: 'first', label: '第一次検定', examLevel: '2級' }],
}

export const GENRE_GROUPS: GenreGroup[] = [
  {
    id: 'kenchikugaku',
    title: '建築学',
    examLevel: '2級',
    segmentRelevance: [], // 全種別共通
    genres: [
      '計画(採光・換気・寸法)',
      '環境工学(熱・音・湿気)',
      '一般構造',
      '構造力学(反力・応力)',
      '建築材料(木・鋼・コンクリート)',
    ],
  },
  {
    id: 'kyotsu',
    title: '共通(設備・契約)',
    examLevel: '2級',
    segmentRelevance: [],
    genres: ['建築設備(給排水・電気・空調)', '測量', '契約・積算', '外構・植栽'],
  },
  {
    id: 'kutai',
    title: '躯体工事',
    examLevel: '2級',
    segmentRelevance: ['躯体', '建築'],
    genres: [
      '地盤調査・土工事',
      '地業・基礎',
      '鉄筋工事',
      '型枠工事',
      'コンクリート工事',
      '鉄骨工事',
      '補強コンクリートブロック',
      '木工事(軸組)',
      '建設機械',
    ],
  },
  {
    id: 'shiage',
    title: '仕上工事',
    examLevel: '2級',
    segmentRelevance: ['仕上げ', '建築'],
    genres: [
      '防水工事',
      '屋根・とい',
      '左官工事',
      'タイル工事',
      '石工事',
      '金属工事',
      '建具・ガラス',
      '塗装工事',
      '内装工事(床・壁・天井)',
      '断熱・改修',
    ],
  },
  {
    id: 'kanriho',
    title: '施工管理法',
    examLevel: '2級',
    segmentRelevance: [],
    genres: ['施工計画', '工程管理(工程表)', '品質管理', '安全管理', '材料の保管・取扱い'],
  },
  {
    id: 'hoki',
    title: '法規',
    examLevel: '2級',
    segmentRelevance: [],
    genres: [
      '建築基準法',
      '建設業法',
      '労働安全衛生法',
      '労働基準法',
      'その他関連法規(廃棄物・道路・消防)',
    ],
  },
]

export interface GenreTarget {
  groupId: string
  groupTitle: string
  genre: string
  examLevel: string
}

/** examTarget(id) → examLevel を解決 */
export function examLevelForTarget(targetId: string | null | undefined): string | null {
  const t = DOMAIN_CONFIG.examTargetOptions.find((x) => x.id === targetId)
  return t?.examLevel ?? null
}

/** 受験パターンが1種類ならそれを既定にする(オンボーディングSTEP2の自動スキップ用) */
export function defaultExamTarget(): ExamTargetDef | null {
  return DOMAIN_CONFIG.examTargetOptions.length === 1 ? DOMAIN_CONFIG.examTargetOptions[0] : null
}

/** segmentRelevance が空 = 全種別共通の group か */
export function isCommonGroup(groupId: string): boolean {
  const g = GENRE_GROUPS.find((x) => x.id === groupId)
  return !g || !g.segmentRelevance || g.segmentRelevance.length === 0
}

export function groupTitleById(groupId: string): string {
  return GENRE_GROUPS.find((g) => g.id === groupId)?.title ?? groupId
}

/**
 * あるユーザー(segment + examLevel)に出してよい group。
 * 「種別違いの問題が混ざらない」ことをここで厳密に守る。
 */
export function relevantGroups(segment: string, examLevel: string): GenreGroup[] {
  return GENRE_GROUPS.filter((g) => {
    if (g.examLevel !== examLevel) return false
    if (!g.segmentRelevance || g.segmentRelevance.length === 0) return true // 全種別共通
    return g.segmentRelevance.includes(segment)
  })
}

/** segment/examLevel に合うジャンルをフラット化(出題候補) */
export function genreTargets(segment: string, examLevel: string): GenreTarget[] {
  const out: GenreTarget[] = []
  for (const g of relevantGroups(segment, examLevel)) {
    for (const genre of g.genres) {
      out.push({ groupId: g.id, groupTitle: g.title, genre, examLevel: g.examLevel })
    }
  }
  return out
}

/** 試験日まで残り何日か(JST 基準・当日を含む) */
export function daysUntil(iso: string): number {
  const exam = new Date(`${iso}T00:00:00+09:00`).getTime()
  const now = Date.now()
  return Math.ceil((exam - now) / (24 * 3600 * 1000))
}

function toJstDay(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 回答日(Date配列)から、今日(または昨日)から遡った連続学習日数を求める */
export function computeStreak(dates: Date[]): number {
  const days = new Set(dates.map(toJstDay))
  if (days.size === 0) return 0
  let cursor = new Date()
  // 今日まだ未回答なら、昨日を起点に数える(streak を途切れさせない)
  if (!days.has(toJstDay(cursor))) cursor = new Date(Date.now() - 24 * 3600 * 1000)
  let streak = 0
  for (;;) {
    if (days.has(toJstDay(cursor))) {
      streak++
      cursor = new Date(cursor.getTime() - 24 * 3600 * 1000)
    } else break
  }
  return streak
}
