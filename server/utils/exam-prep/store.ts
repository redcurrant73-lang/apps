// exam-prep の Firestore データ層。
// クライアントから直接 Firestore は触らせない。必ずこの層を server/api 経由で使う。
//
// データ配置(このポータルの規約 appDataPath に合わせる):
//   apps/exam-prep/users/{uid}            … 個人プロフィール + 進行中セッション(per-user)
//   apps/exam-prep/users/{uid}/progress   … 回答履歴(append-only)
//   apps/exam-prep/questions              … 問題プール(全員共通 / global)
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '~/server/utils/firestore'
import { appDataPath } from '~/server/utils/permissions'

const APP_ID = 'exam-prep'

// ---- 型 ----
export interface SessionQuestion {
  questionId: string
  groupId: string
  /** UI のカテゴリピルに出す group 名。genre 名は出さない(カンニング防止の方針に合わせる) */
  groupTitle: string
  genre: string
  type: 'choice' | 'free'
  question: string
  options: string[]
}

export interface SessionState {
  startedAt: number
  /** 提示順のキュー。正解で除去、不正解で末尾へ戻す。空 = 完了 */
  queue: string[]
  /** 一意に正解した questionId */
  correct: string[]
  attempts: Record<string, number>
  totalAttempts: number
  /** answer / explanation は含めない(クライアントに渡る) */
  questions: SessionQuestion[]
}

export interface ExamProfile {
  segment: string | null
  examTarget: string | null
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
  genre: string
  groupId: string
  examLevel: string
  /** '共通' または 種別(病棟/外来/ICU) */
  segment: string
  source: 'seed' | 'generated'
  /** seed 問題の重複投入を防ぐ一意キー(generated には無い) */
  seedKey?: string
}

// ---- パス ----
function profileRef(uid: string) {
  return db.doc(appDataPath(APP_ID, 'per-user', { uid })) // apps/exam-prep/users/{uid}
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

// ---- プロフィール ----
function readProfile(d: Record<string, any>): ExamProfile {
  return {
    segment: d.segment ?? null,
    examTarget: d.examTarget ?? null,
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

export async function ensureProfile(decoded: {
  uid: string
  name?: string
}): Promise<ExamProfile> {
  const ref = profileRef(decoded.uid)
  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set(
      {
        segment: null,
        examTarget: null,
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

/** 安全フィールドのみ更新(setProfile) */
export async function updateProfileFields(
  uid: string,
  fields: Partial<{
    segment: string
    examTarget: string
    displayName: string
    visibleToPeers: boolean
  }>,
) {
  await profileRef(uid).set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
}

export async function saveSession(uid: string, session: SessionState | null) {
  await profileRef(uid).set(
    { currentSession: session, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

/** セッション終了:レベル確定 + セッションクリア + lastSessionAt 更新 */
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

// ---- 問題プール(global) ----
export async function readPoolByLevel(examLevel: string, limit = 120): Promise<PoolQuestion[]> {
  // 単一フィールドの等価フィルタのみ(複合インデックス不要)。segment/genre は JS 側で絞る。
  const snap = await questionsCol().where('examLevel', '==', examLevel).limit(limit).get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PoolQuestion[]
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

// ---- 回答(progress は append、カウンタは transaction)----
export async function recordAnswer(
  uid: string,
  p: {
    questionId: string
    isCorrect: boolean
    userAnswer: string
    attempts: number
    groupId: string
    genre: string
  },
) {
  await progressCol(uid).add({
    questionId: p.questionId,
    isCorrect: p.isCorrect,
    userAnswer: p.userAnswer,
    attempts: p.attempts,
    groupId: p.groupId,
    genre: p.genre,
    answeredAt: FieldValue.serverTimestamp(),
  })
}

/**
 * セッション更新 + 通算カウンタ increment を runTransaction で原子的に。
 * 採点(isCorrect)は呼び出し側で確定して渡す(問題プールは不変なので txn 外で読める)。
 */
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
      // すでに正解済みで除去されている等。二重計上を避けて no-op。
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
      session.queue.push(opts.questionId) // 末尾に戻す
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

// ---- 集計用の読み出し ----
export async function readCorrectProgress(uid: string, limit = 1000) {
  const snap = await progressCol(uid).where('isCorrect', '==', true).limit(limit).get()
  return snap.docs.map((d) => {
    const x = d.data() as any
    return { questionId: x.questionId as string, groupId: x.groupId as string, genre: x.genre as string }
  })
}

export async function readRecentProgress(uid: string, sinceMs: number, limit = 800) {
  const snap = await progressCol(uid)
    .where('answeredAt', '>', new Date(sinceMs))
    .limit(limit)
    .get()
  return snap.docs.map((d) => {
    const x = d.data() as any
    return { answeredAt: (x.answeredAt?.toDate?.() ?? null) as Date | null }
  })
}

// ---- 仲間ランキング ----
export async function listPeers(limitN = 20) {
  const snap = await usersCol().where('visibleToPeers', '==', true).limit(100).get()
  const rows = snap.docs.map((d) => {
    const x = d.data() as any
    return {
      displayName: (x.displayName as string) || '名無し',
      level: (x.level as number) ?? 1,
      totalCorrect: (x.totalCorrect as number) ?? 0,
      totalAnswers: (x.totalAnswers as number) ?? 0,
    }
  })
  rows.sort((a, b) => b.totalCorrect - a.totalCorrect)
  return rows.slice(0, limitN)
}

// ---- seed(確認済み問題)の投入・全消去 ----
export async function existingSeedKeys(): Promise<Set<string>> {
  const snap = await questionsCol().where('source', '==', 'seed').limit(500).get()
  const out = new Set<string>()
  snap.docs.forEach((d) => {
    const k = (d.data() as any).seedKey
    if (k) out.add(k)
  })
  return out
}

/** seedKey が未投入のものだけ追加。追加件数を返す(再実行しても重複しない) */
export async function addSeedQuestions(
  items: (Omit<PoolQuestion, 'id'> & { seedKey: string })[],
): Promise<number> {
  const existing = await existingSeedKeys()
  const toAdd = items.filter((it) => !existing.has(it.seedKey))
  for (const it of toAdd) {
    await questionsCol().add({ ...it, createdAt: FieldValue.serverTimestamp() })
  }
  return toAdd.length
}

/** 問題プールを消す。source 指定なしで全消去(1回最大500件) */
export async function wipeQuestions(source?: 'generated' | 'seed'): Promise<number> {
  const ref = source ? questionsCol().where('source', '==', source) : questionsCol()
  const snap = await ref.limit(500).get()
  if (snap.empty) return 0
  const batch = db.batch()
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.size
}

// ---- セッションをクライアント提示用に整える ----
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
