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

// ===== ドメイン: 看護師国家試験 =====
export const DOMAIN_CONFIG: DomainConfig = {
  appId: 'exam-prep',
  appTitle: '看護師国試ドリル',
  appSubtitle: '看護師国家試験 一問一答',
  examLabel: '看護師国家試験',
  // 実際の試験日に合わせて編集する(国試は例年2月中旬)
  examDate: '2027-02-14',
  aiSubject: '看護師国家試験',
  segments: [
    {
      id: '病棟',
      label: '病棟',
      isRecommendedDefault: true,
      hint: '入院患者さんの全身管理。急性期から在宅連携まで幅広く(迷ったらこれ)',
    },
    { id: '外来', label: '外来', hint: '外来・在宅・継続看護が中心。重症集中ケアは控えめ' },
    { id: 'ICU', label: 'ICU', hint: '重症・急性期。クリティカルケアを厚めに' },
  ],
  // 1種類だけなので、オンボーディングの受験パターン選択(STEP2)は自動スキップされる
  examTargetOptions: [{ id: 'kokushi', label: '国家試験', examLevel: '国試' }],
}

export const GENRE_GROUPS: GenreGroup[] = [
  {
    id: 'hisshu',
    title: '必修問題',
    examLevel: '国試',
    segmentRelevance: [],
    genres: [
      '看護の対象と保健統計',
      '看護倫理と関係法規',
      '主要な症状と看護',
      '感染防止・医療安全',
      '基本的な臨床薬理',
      'フィジカルアセスメント',
    ],
  },
  {
    id: 'jintai',
    title: '人体の構造と機能',
    examLevel: '国試',
    segmentRelevance: [],
    genres: [
      '循環器',
      '呼吸器',
      '消化器',
      '腎・泌尿器',
      '内分泌・代謝',
      '脳・神経',
      '血液・免疫',
      '運動器・感覚器',
    ],
  },
  {
    id: 'shippei',
    title: '疾病の成り立ちと回復',
    examLevel: '国試',
    segmentRelevance: [],
    genres: [
      '病態生理の基本',
      '生活習慣病',
      '感染症',
      '悪性腫瘍',
      '主要薬剤と副作用',
      '検査データの解釈',
    ],
  },
  {
    id: 'shakai',
    title: '健康支援と社会保障',
    examLevel: '国試',
    segmentRelevance: [],
    genres: ['社会保障制度', '医療保険・介護保険', '保健統計・疫学', '公衆衛生・予防', '関係法規'],
  },
  {
    id: 'kiso',
    title: '基礎看護学',
    examLevel: '国試',
    segmentRelevance: [],
    genres: [
      '看護過程',
      '日常生活の援助',
      '与薬・輸液管理',
      'バイタルサインと観察',
      '無菌操作・感染管理',
      '看護記録とコミュニケーション',
    ],
  },
  {
    id: 'seijin',
    title: '成人看護学',
    examLevel: '国試',
    segmentRelevance: [],
    genres: [
      '周術期看護',
      '慢性期看護',
      'がん看護・緩和ケア',
      'リハビリテーション看護',
      '栄養・代謝の管理',
    ],
  },
  {
    id: 'ronen',
    title: '老年看護学',
    examLevel: '国試',
    segmentRelevance: [],
    genres: ['加齢に伴う変化', '認知症の看護', '高齢者の生活支援', '転倒・誤嚥の予防'],
  },
  {
    id: 'shoni',
    title: '小児看護学',
    examLevel: '国試',
    segmentRelevance: [],
    genres: ['成長・発達', '小児の疾患と看護', '予防接種・健診', '家族への支援'],
  },
  {
    id: 'bosei',
    title: '母性看護学',
    examLevel: '国試',
    segmentRelevance: [],
    genres: ['妊娠・分娩・産褥', '新生児の看護', '女性のライフサイクル', '母子保健'],
  },
  {
    id: 'seishin',
    title: '精神看護学',
    examLevel: '国試',
    segmentRelevance: [],
    genres: ['精神疾患の理解', '精神科の治療と看護', '地域精神保健', '危機介入'],
  },
  {
    id: 'critical',
    title: '急性期・クリティカルケア',
    examLevel: '国試',
    segmentRelevance: ['病棟', 'ICU'],
    genres: [
      '急変対応・一次救命処置',
      '人工呼吸器の管理',
      '循環動態モニタリング',
      'ショックと輸液療法',
      '術後合併症の早期発見',
      '重症患者の全身管理',
    ],
  },
  {
    id: 'zaitaku',
    title: '在宅・地域看護',
    examLevel: '国試',
    segmentRelevance: ['外来', '病棟'],
    genres: ['在宅療養の支援', '訪問看護', '社会資源の活用', '外来・継続看護', '退院支援と地域連携'],
  },
  {
    id: 'togo',
    title: '看護の統合と実践',
    examLevel: '国試',
    segmentRelevance: [],
    genres: ['医療安全管理', '災害看護', 'チーム医療・多職種連携', '看護管理の基本'],
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

/** レーダー/バーの達成率の分母(その group を「習得した」とみなす一意正解数の目安) */
export function groupGoal(groupId: string): number {
  const g = GENRE_GROUPS.find((x) => x.id === groupId)
  return Math.max(4, (g?.genres.length ?? 4) * 2)
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

/** JST の「今日から数えて n 日前」の日付キー(0=今日) */
export function jstDayKey(daysAgo = 0): string {
  return toJstDay(new Date(Date.now() - daysAgo * 24 * 3600 * 1000))
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

/** 直近7日(古い→新しい)それぞれ学習したか。streak のドット表示用 */
export function last7Days(dates: Date[]): { day: string; studied: boolean }[] {
  const days = new Set(dates.map(toJstDay))
  const out: { day: string; studied: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const key = toJstDay(new Date(Date.now() - i * 24 * 3600 * 1000))
    out.push({ day: key.slice(5), studied: days.has(key) })
  }
  return out
}
