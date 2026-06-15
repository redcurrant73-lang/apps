// 学習ドリルの「クイズ(学習アプリ)レジストリ」。
//
// ★ 新しいクイズ(学習アプリ)を作るのに必要なのは次の4つだけ:
//      1. title       … タイトル(表示名)
//      2. occupation  … 出題する業種(誰向けか)
//      3. categories  … カテゴリ(出題範囲。任意で topics を足すと出題の幅が広がる)
//      4. prompt      … 個別のプロンプト(その業種ならではの作問指示)
//    この QUIZZES 配列に1つ追加すれば、新しい学習アプリが増える(ハードコードではない)。
//
// ★ どのユーザーがどのクイズ(業種)かは superuser が割り当てる
//    (apps/exam-prep/users/{uid}.quizId)。
// ★ 出題の質を調整したいときは、その業種の prompt.rules を編集して prompt.version を上げる
//    → 古い生成問題は自動で使われなくなり、新しいプロンプトで作り直される。

export interface QuizCategory {
  id: string
  /** カテゴリ名(レーダーの軸・集中セッションの単位) */
  title: string
  /** カテゴリ内の小トピック(任意)。あると出題の幅が広がる */
  topics?: string[]
}

export interface QuizPrompt {
  /** その業種の出題者像 */
  persona: string
  /** その業種ならではの作問ルール(箇条書き) */
  rules: string[]
  /** 上げると、この業種の古い生成問題は使われなくなる(プロンプト調整時に +1) */
  version: number
}

export interface Quiz {
  /** 一意ID(ユーザー割り当て・問題タグに使う) */
  id: string
  /** 1. タイトル(表示名) */
  title: string
  /** 2. 出題する業種(誰向けか) */
  occupation: string
  /** 試験日(任意・ISO)。あればカウントダウンを表示 */
  examDate?: string
  icon: string
  /** 3. カテゴリ */
  categories: QuizCategory[]
  /** 4. 個別のプロンプト */
  prompt: QuizPrompt
}

// ===== クイズ1: おもてなし(接客・接遇)=====
const OMOTENASHI: Quiz = {
  id: 'omotenashi',
  title: 'おもてなしドリル',
  occupation: 'ホテル・旅館などの接客スタッフ',
  icon: 'room_service',
  categories: [
    { id: 'kihon', title: '接客の基本', topics: ['第一印象・身だしなみ', '言葉遣い・敬語', 'お辞儀・立ち居振る舞い', '笑顔・アイコンタクト'] },
    { id: 'manner', title: '接遇マナー', topics: ['ご案内の所作', '電話応対', 'クレーム対応の基本', 'メール・文書対応'] },
    { id: 'hospitality', title: 'ホスピタリティ', topics: ['おもてなしの心', '気配り・察する力', 'インバウンド・異文化対応', '高齢者・バリアフリー配慮'] },
    { id: 'hygiene', title: '衛生・安全', topics: ['食品衛生の基本', '身だしなみと衛生', '緊急時対応・避難誘導'] },
    { id: 'front', title: 'フロント業務', topics: ['予約・チェックイン/アウト', '会計・精算', '観光・周辺案内', '一次クレーム対応'] },
    { id: 'dining', title: '料飲サービス', topics: ['配膳・下げ膳の基本', '料理・飲み物の提供', 'アレルギー対応', '宴会・コース対応'] },
    { id: 'room', title: '客室・館内サービス', topics: ['客室整備の基本', 'アメニティ・備品', '館内施設の案内', 'プライバシー配慮'] },
  ],
  prompt: {
    persona: 'あなたは接客・接遇マナーの検定問題を作る専門家です。プロの接客指導の観点で、正誤がはっきりした良問を作ります。',
    rules: [
      '知識として学べる問題を中心にする:正しい敬語(尊敬語・謙譲語・丁寧語)の使い分け、接客用語の意味、基本手順や所作の正誤など。半分以上はこの「知識型」にする。',
      '状況対応(ロールプレイ型)の問題を出すときは、正解が1つに定まる場面に限る。「どれも丁寧でOK」のような曖昧な4択は作らない。',
      '敬語問題は具体例で問う(例:「お客様が申された」は誤り。正しくは「おっしゃった」など、はっきり×が分かる形)。',
      '不正解の選択肢は「二重敬語」「謙譲語と尊敬語の取り違え」「失礼な言い回し」など、明確に間違いとわかるものにする。',
      '問題文・選択肢は簡潔に。長い前置きや回りくどい言い回しは避ける。',
    ],
    version: 2,
  },
}

// ===== クイズ2: 看護師国家試験 =====
const KANGO: Quiz = {
  id: 'kango',
  title: '看護師国試ドリル',
  occupation: '看護師国家試験の受験者',
  examDate: '2027-02-14',
  icon: 'medical_services',
  categories: [
    { id: 'hisshu', title: '必修問題', topics: ['看護の対象と保健統計', '看護倫理と関係法規', '主要な症状と看護', '感染防止・医療安全', '基本的な臨床薬理', 'フィジカルアセスメント'] },
    { id: 'jintai', title: '人体の構造と機能', topics: ['循環器', '呼吸器', '消化器', '腎・泌尿器', '内分泌・代謝', '脳・神経', '血液・免疫', '運動器・感覚器'] },
    { id: 'shippei', title: '疾病の成り立ちと回復', topics: ['病態生理の基本', '生活習慣病', '感染症', '悪性腫瘍', '主要薬剤と副作用', '検査データの解釈'] },
    { id: 'shakai', title: '健康支援と社会保障', topics: ['社会保障制度', '医療保険・介護保険', '保健統計・疫学', '公衆衛生・予防', '関係法規'] },
    { id: 'kiso', title: '基礎看護学', topics: ['看護過程', '日常生活の援助', '与薬・輸液管理', 'バイタルサインと観察', '無菌操作・感染管理', '看護記録とコミュニケーション'] },
    { id: 'seijin', title: '成人看護学', topics: ['周術期看護', '慢性期看護', 'がん看護・緩和ケア', 'リハビリテーション看護', '栄養・代謝の管理'] },
    { id: 'ronen', title: '老年看護学', topics: ['加齢に伴う変化', '認知症の看護', '高齢者の生活支援', '転倒・誤嚥の予防'] },
    { id: 'shoni', title: '小児看護学', topics: ['成長・発達', '小児の疾患と看護', '予防接種・健診', '家族への支援'] },
    { id: 'bosei', title: '母性看護学', topics: ['妊娠・分娩・産褥', '新生児の看護', '女性のライフサイクル', '母子保健'] },
    { id: 'seishin', title: '精神看護学', topics: ['精神疾患の理解', '精神科の治療と看護', '地域精神保健', '危機介入'] },
    { id: 'critical', title: '急性期・クリティカルケア', topics: ['急変対応・一次救命処置', '人工呼吸器の管理', '循環動態モニタリング', 'ショックと輸液療法', '術後合併症の早期発見'] },
    { id: 'zaitaku', title: '在宅・地域看護', topics: ['在宅療養の支援', '訪問看護', '社会資源の活用', '外来・継続看護', '退院支援と地域連携'] },
    { id: 'togo', title: '看護の統合と実践', topics: ['医療安全管理', '災害看護', 'チーム医療・多職種連携', '看護管理の基本'] },
  ],
  prompt: {
    persona: 'あなたは看護師国家試験の対策を教える予備校講師です。',
    rules: [
      '出題は国家試験の出題基準に沿った、標準的で確実な内容にする。',
      '数値・基準値・法制度は正確に。あいまいな場合は基本的・代表的な値を使う。',
      '解説には根拠(病態生理や原則)を一言入れて、丸暗記でなく理解につなげる。',
    ],
    version: 2,
  },
}

// ===== レジストリ(ここに足すだけでクイズが増える)=====
export const QUIZZES: Quiz[] = [OMOTENASHI, KANGO]
export const DEFAULT_QUIZ_ID = 'omotenashi'

/** quizId からクイズを解決(未割り当て・不明はデフォルト) */
export function getQuiz(quizId?: string | null): Quiz {
  return (
    QUIZZES.find((q) => q.id === quizId) ||
    QUIZZES.find((q) => q.id === DEFAULT_QUIZ_ID) ||
    QUIZZES[0]
  )
}

/** 管理画面の業種ドロップダウン用 */
export function listQuizzes() {
  return QUIZZES.map((q) => ({ id: q.id, title: q.title, occupation: q.occupation }))
}

export function isValidQuizId(quizId: string): boolean {
  return QUIZZES.some((q) => q.id === quizId)
}

export function categoryTitle(quiz: Quiz, categoryId: string): string {
  return quiz.categories.find((c) => c.id === categoryId)?.title ?? categoryId
}

/** レーダー/バーの達成率の分母 */
export function categoryGoal(quiz: Quiz, categoryId: string): number {
  const c = quiz.categories.find((x) => x.id === categoryId)
  return Math.max(4, (c?.topics?.length ?? 3) * 2)
}

export interface QuizTarget {
  categoryId: string
  categoryTitle: string
  topic: string
}

/** 出題候補(カテゴリ×トピックを平らに展開。topics 無しはカテゴリ名を1トピック扱い) */
export function quizTargets(quiz: Quiz): QuizTarget[] {
  const out: QuizTarget[] = []
  for (const c of quiz.categories) {
    const topics = c.topics && c.topics.length ? c.topics : [c.title]
    for (const t of topics) out.push({ categoryId: c.id, categoryTitle: c.title, topic: t })
  }
  return out
}

// ---- 日付系(クイズに依らない)----
export function daysUntil(iso: string): number {
  const exam = new Date(`${iso}T00:00:00+09:00`).getTime()
  return Math.ceil((exam - Date.now()) / (24 * 3600 * 1000))
}

function toJstDay(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export function computeStreak(dates: Date[]): number {
  const days = new Set(dates.map(toJstDay))
  if (days.size === 0) return 0
  let cursor = new Date()
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

export function last7Days(dates: Date[]): { day: string; studied: boolean }[] {
  const days = new Set(dates.map(toJstDay))
  const out: { day: string; studied: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const key = toJstDay(new Date(Date.now() - i * 24 * 3600 * 1000))
    out.push({ day: key.slice(5), studied: days.has(key) })
  }
  return out
}
