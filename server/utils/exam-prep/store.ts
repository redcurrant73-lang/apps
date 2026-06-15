// exam-prep の Firestore データ層。クライアント直アクセスはせず必ずこの層を server/api 経由で使う。
//
// データ配置:
//   apps/exam-prep/users/{uid}            … 個人プロフィール(quizId / 成績 / 進行中セッション)
//   apps/exam-prep/users/{uid}/progress   … 回答履歴(append-only)
//   apps/exam-prep/questions              … 問題プール(全員共通。quizId / promptVersion でタグ)
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '~/server/utils/firestore'
import { appDataPath } from '~/server/utils/permissions'

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
}

export interface ExamProfile {
  quizId: string | null
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
    quizId: d.quizId ?? null,
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
        quizId: null,
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
    return { questionId: x.questionId as string, categoryId: x.categoryId as string }
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
  const nextId = s.queue[0] ?? null
  const next = nextId ? s.questions.find((q) => q.questionId === nextId) ?? null : null
  return {
    total: s.questions.length,
    unique: s.correct.length,
    totalAttempts: s.totalAttempts,
    done: s.queue.length === 0,
    next,
  }
}

// ---- 管理(superuser):ユーザーの業種(quizId)割り当て ----
export async function setUserQuiz(uid: string, quizId: string | null) {
  // 業種が変わると進捗の前提が変わるので、進行中セッションとレベルはリセット
  await profileRef(uid).set(
    { quizId, level: 1, currentSession: null, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
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
      quizId: (ex.quizId as string) ?? null,
      totalAnswers: (ex.totalAnswers as number) ?? 0,
    }
  })
}
