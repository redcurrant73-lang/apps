// exam-prep の Firestore データ層。クライアント直アクセスはせず必ずこの層を server/api 経由で使う。
//
// データ配置:
//   apps/exam-prep/users/{uid}            … 個人プロフィール(quizId / 成績 / 進行中セッション)
//   apps/exam-prep/users/{uid}/progress   … 回答履歴(append-only)
//   apps/exam-prep/questions              … 問題プール(全員共通。quizId / promptVersion でタグ)
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '~/server/utils/firestore'
import { appDataPath } from '~/server/utils/permissions'
import type { QuizTarget } from './config'

const APP_ID = 'exam-prep'

export interface SessionQuestion {
  questionId: string
  categoryId: string
  /** UI のカテゴリピル */
  categoryTitle: string
  topic: string
  type: 'choice' | 'free'
  question: string
  options: string[]
}

export interface SessionState {
  startedAt: number
  queue: string[]
  correct: string[]
  attempts: Record<string, number>
  totalAttempts: number
  questions: SessionQuestion[]
  /** まだ生成していない出題対象(topup で後から questions に変わる)。サクッと開始するため */
  pending?: QuizTarget[]
}

export interface ExamProfile {
  /** 使える学習内容(role = quizId の配列)。superuser は全 role を持つ扱い(store では空でも可) */
  roles: string[]
  /** いま学習中の学習内容(roles のいずれか) */
  currentQuizId: string | null
  level: number
  totalCorrect: number
  totalAnswers: number
  visibleToPeers: boolean
  displayName: string
  currentSession: SessionState | null
}

export interface PoolQuestion {
  id: string
  category: string
  difficulty: string
  type: 'choice' | 'free'
  question: string
  options: string[]
  answer: string
  keywords: string[]
  explanation: string
  quizId: string
  categoryId: string
  topic: string
  /** 生成時のクイズ prompt.version。現行版と違う問題は使わない(プロンプト調整での自動入替) */
  promptVersion: number
  source: 'generated' | 'seed'
}

function profileRef(uid: string) {
  return db.doc(appDataPath(APP_ID, 'per-user', { uid }))
}
function progressCol(uid: string) {
  return db.collection(`${appDataPath(APP_ID, 'per-user', { uid })}/progress`)
}
function questionsCol() {
  return db.collection(`apps/${APP_ID}/questions`)
}
function usersCol() {
  return db.collection(`apps/${APP_ID}/users`)
}

function readProfile(d: Record<string, any>): ExamProfile {
  return {
    // 旧 quizId(単一)からの移行:roles 未設定なら quizId を1件の role として扱う
    roles: Array.isArray(d.roles) ? d.roles : d.quizId ? [d.quizId] : [],
    currentQuizId: d.currentQuizId ?? d.quizId ?? null,
    level: typeof d.level === 'number' ? d.level : 1,
    totalCorrect: d.totalCorrect ?? 0,
    totalAnswers: d.totalAnswers ?? 0,
    visibleToPeers: !!d.visibleToPeers,
    displayName: d.displayName ?? '',
    currentSession: d.currentSession ?? null,
  }
}

export async function getProfile(uid: string): Promise<ExamProfile | null> {
  const snap = await profileRef(uid).get()
  if (!snap.exists) return null
  return readProfile(snap.data() || {})
}

export async function ensureProfile(decoded: { uid: string; name?: string }): Promise<ExamProfile> {
  const ref = profileRef(decoded.uid)
  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set(
      {
        roles: [],
        currentQuizId: null,
        level: 1,
        totalCorrect: 0,
        totalAnswers: 0,
        visibleToPeers: false,
        displayName: decoded.name || '',
        currentSession: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    return (await getProfile(decoded.uid))!
  }
  return readProfile(snap.data() || {})
}

/** 本人が変えられる安全フィールド(表示名・ランキング表示)。業種(quizId)は superuser だけが変える。 */
export async function updateProfileFields(
  uid: string,
  fields: Partial<{ displayName: string; visibleToPeers: boolean }>,
) {
  await profileRef(uid).set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
}

export async function saveSession(uid: string, session: SessionState | null) {
  await profileRef(uid).set(
    { currentSession: session, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

export async function finishSession(uid: string, level: number) {
  await profileRef(uid).set(
    {
      level,
      currentSession: null,
      lastSessionAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

// ---- 問題プール ----
export async function readPool(quizId: string, promptVersion: number, limit = 200): Promise<PoolQuestion[]> {
  // 単一フィールド等価のみ(複合インデックス不要)。promptVersion は JS で絞る。
  const snap = await questionsCol().where('quizId', '==', quizId).limit(limit).get()
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as PoolQuestion)
    .filter((q) => (q.promptVersion ?? 0) === promptVersion)
}

export async function getQuestion(questionId: string): Promise<PoolQuestion | null> {
  const snap = await questionsCol().doc(questionId).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as any) } as PoolQuestion
}

export async function addQuestions(items: Omit<PoolQuestion, 'id'>[]): Promise<PoolQuestion[]> {
  const out: PoolQuestion[] = []
  for (const it of items) {
    const ref = await questionsCol().add({ ...it, createdAt: FieldValue.serverTimestamp() })
    out.push({ id: ref.id, ...it })
  }
  return out
}

// ---- 回答 ----
export async function recordAnswer(
  uid: string,
  p: { questionId: string; isCorrect: boolean; userAnswer: string; attempts: number; categoryId: string; topic: string },
) {
  await progressCol(uid).add({
    questionId: p.questionId,
    isCorrect: p.isCorrect,
    userAnswer: p.userAnswer,
    attempts: p.attempts,
    categoryId: p.categoryId,
    topic: p.topic,
    answeredAt: FieldValue.serverTimestamp(),
  })
}

export async function applyAnswerTxn(
  uid: string,
  opts: { questionId: string; isCorrect: boolean },
): Promise<SessionState | null> {
  const ref = profileRef(uid)
  let result: SessionState | null = null
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref)
    const d = snap.data() || {}
    const session: SessionState | null = d.currentSession ?? null
    if (!session) {
      result = null
      return
    }
    const idx = session.queue.indexOf(opts.questionId)
    if (idx < 0) {
      result = session
      return
    }
    session.attempts = session.attempts || {}
    session.attempts[opts.questionId] = (session.attempts[opts.questionId] || 0) + 1
    session.totalAttempts = (session.totalAttempts || 0) + 1
    session.queue.splice(idx, 1)
    if (opts.isCorrect) {
      if (!session.correct.includes(opts.questionId)) session.correct.push(opts.questionId)
    } else {
      session.queue.push(opts.questionId)
    }
    t.set(
      ref,
      {
        currentSession: session,
        totalAnswers: FieldValue.increment(1),
        totalCorrect: FieldValue.increment(opts.isCorrect ? 1 : 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    result = session
  })
  return result
}

// ---- 集計 ----
export async function readCorrectProgress(uid: string, limit = 1000) {
  const snap = await progressCol(uid).where('isCorrect', '==', true).limit(limit).get()
  return snap.docs.map((d) => {
    const x = d.data() as any
    return {
      questionId: x.questionId as string,
      categoryId: x.categoryId as string,
      topic: (x.topic as string) ?? '',
    }
  })
}

export async function readRecentProgress(uid: string, sinceMs: number, limit = 800) {
  const snap = await progressCol(uid).where('answeredAt', '>', new Date(sinceMs)).limit(limit).get()
  return snap.docs.map((d) => ({ answeredAt: ((d.data() as any).answeredAt?.toDate?.() ?? null) as Date | null }))
}

export async function listPeers(limitN = 20) {
  const snap = await usersCol().where('visibleToPeers', '==', true).limit(100).get()
  const rows = snap.docs.map((d) => {
    const x = d.data() as any
    return {
      displayName: (x.displayName as string) || '名無し',
      level: (x.level as number) ?? 1,
      totalCorrect: (x.totalCorrect as number) ?? 0,
    }
  })
  rows.sort((a, b) => b.totalCorrect - a.totalCorrect)
  return rows.slice(0, limitN)
}

export function presentSession(s: SessionState) {
  const pending = s.pending?.length ?? 0
  const nextId = s.queue[0] ?? null
  const next = nextId ? s.questions.find((q) => q.questionId === nextId) ?? null : null
  return {
    total: s.questions.length + pending, // 後追い生成分を含む最終目標数
    unique: s.correct.length,
    totalAttempts: s.totalAttempts,
    pending,
    done: s.queue.length === 0 && pending === 0,
    next,
  }
}

/** topup:後から生成した問題をセッションに追加(pending は必ずクリア)。answer と競合しないよう txn。 */
export async function appendSessionQuestions(
  uid: string,
  add: SessionQuestion[],
): Promise<SessionState | null> {
  const ref = profileRef(uid)
  let result: SessionState | null = null
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref)
    const d = snap.data() || {}
    const session: SessionState | null = d.currentSession ?? null
    if (!session) {
      result = null
      return
    }
    const existing = new Set(session.questions.map((q) => q.questionId))
    for (const q of add) {
      if (existing.has(q.questionId)) continue
      session.questions.push(q)
      session.queue.push(q.questionId)
    }
    session.pending = [] // 生成できた数に関わらずクリア(stuck 防止)
    t.set(ref, { currentSession: session, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    result = session
  })
  return result
}

// ---- 学習内容(role)の割り当て・切り替え ----
/** superuser: ユーザーに使える学習内容(roles)を設定。currentQuizId が roles 外なら付け替え。 */
export async function setUserRoles(
  uid: string,
  roles: string[],
  currentQuizId: string | null,
  clearSession: boolean,
) {
  const patch: Record<string, any> = {
    roles,
    currentQuizId,
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (clearSession) patch.currentSession = null
  await profileRef(uid).set(patch, { merge: true })
}

/** 本人 or superuser: 学習中の学習内容を切り替え(進行中セッションはクリア・レベルは保持) */
export async function setCurrentQuiz(uid: string, quizId: string) {
  await profileRef(uid).set(
    { currentQuizId: quizId, currentSession: null, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

/** getMe が解決した currentQuizId を永続化(セッションは消さない) */
export async function persistCurrentQuiz(uid: string, quizId: string) {
  await profileRef(uid).set(
    { currentQuizId: quizId, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

// ---- 問題の削除(superuser)----
/** 1問をプールから削除し、呼び出し本人の進行中セッションからも取り除く */
export async function deleteQuestion(uid: string, questionId: string): Promise<SessionState | null> {
  await questionsCol().doc(questionId).delete().catch(() => {})
  const ref = profileRef(uid)
  let result: SessionState | null = null
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref)
    const session: SessionState | null = snap.data()?.currentSession ?? null
    if (!session) {
      result = null
      return
    }
    session.queue = session.queue.filter((id) => id !== questionId)
    session.correct = session.correct.filter((id) => id !== questionId)
    session.questions = session.questions.filter((q) => q.questionId !== questionId)
    if (session.attempts) delete session.attempts[questionId]
    t.set(ref, { currentSession: session, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    result = session
  })
  return result
}

/** ある業種(クイズ)の問題を全部消す。バッチで繰り返し削除。返り値は削除件数。 */
export async function wipeQuestionsForQuiz(quizId: string): Promise<number> {
  let total = 0
  for (let i = 0; i < 20; i++) {
    const snap = await questionsCol().where('quizId', '==', quizId).limit(300).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    total += snap.size
    if (snap.size < 300) break
  }
  return total
}

/** ポータル全ユーザー + exam-prep の割り当て状況をまとめて返す */
export async function listAssignments() {
  const [portalSnap, examSnap] = await Promise.all([
    db.collection('users').limit(500).get(),
    usersCol().limit(500).get(),
  ])
  const examById = new Map<string, any>()
  examSnap.docs.forEach((d) => examById.set(d.id, d.data()))
  return portalSnap.docs.map((d) => {
    const u = d.data() as any
    const ex = examById.get(d.id) || {}
    return {
      uid: d.id,
      email: u.email ?? '',
      displayName: u.displayName ?? '',
      role: u.role ?? 'user',
      roles: Array.isArray(ex.roles) ? (ex.roles as string[]) : ex.quizId ? [ex.quizId] : [],
      totalAnswers: (ex.totalAnswers as number) ?? 0,
    }
  })
}
