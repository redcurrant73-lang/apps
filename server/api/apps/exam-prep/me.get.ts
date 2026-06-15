// getMe: 使える学習内容(roles)から現在の学習内容を解決し、達成率/streak/カウントダウン/進行中セッションを返す。
// 未割り当て(roles 空・非superuser)は noContent を返す。superuser は全 role を持つ扱い。
import {
  getQuiz,
  daysUntil,
  categoryGoal,
  computeStreak,
  last7Days,
  allQuizIds,
  isValidQuizId,
} from '~/server/utils/exam-prep/config'
import {
  ensureProfile,
  persistCurrentQuiz,
  readCorrectProgress,
  readRecentProgress,
  presentSession,
} from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const profile = await ensureProfile(decoded)
  const isSuper = (await getUserRole(decoded.uid)) === 'superuser'

  // 使える学習内容(superuser は全部)
  const available = isSuper ? allQuizIds() : profile.roles.filter(isValidQuizId)

  const baseProfile = {
    level: profile.level,
    totalCorrect: profile.totalCorrect,
    totalAnswers: profile.totalAnswers,
    visibleToPeers: profile.visibleToPeers,
    displayName: profile.displayName,
  }

  // 学習内容が未割り当て
  if (available.length === 0) {
    return {
      noContent: true,
      quiz: null,
      mySubjects: [],
      currentQuizId: null,
      profile: baseProfile,
      stats: { byCategory: [], streak: 0, last7: [] },
      activeSession: null,
    }
  }

  // 現在の学習内容を解決(currentQuizId が available 外なら先頭)→ 必要なら永続化
  const resolvedId =
    profile.currentQuizId && available.includes(profile.currentQuizId)
      ? profile.currentQuizId
      : available[0]
  if (profile.currentQuizId !== resolvedId) {
    await persistCurrentQuiz(decoded.uid, resolvedId)
  }
  const quiz = getQuiz(resolvedId)

  // カテゴリ別の一意正解数
  const correct = await readCorrectProgress(decoded.uid)
  const perCat = new Map<string, Set<string>>()
  for (const p of correct) {
    if (!perCat.has(p.categoryId)) perCat.set(p.categoryId, new Set())
    perCat.get(p.categoryId)!.add(p.questionId)
  }
  const byCategory = quiz.categories.map((c) => {
    const cnt = perCat.get(c.id)?.size ?? 0
    const goal = categoryGoal(quiz, c.id)
    return { categoryId: c.id, title: c.title, correct: cnt, goal, pct: Math.min(100, Math.round((cnt / goal) * 100)) }
  })

  const recent = await readRecentProgress(decoded.uid, Date.now() - 60 * 24 * 3600 * 1000)
  const dates = recent.map((r) => r.answeredAt).filter((d): d is Date => !!d)

  return {
    noContent: false,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      occupation: quiz.occupation,
      icon: quiz.icon,
      examDate: quiz.examDate ?? null,
      daysLeft: quiz.examDate ? daysUntil(quiz.examDate) : null,
    },
    // 自分が使える学習内容(複数あればホームで切り替え)
    mySubjects: available.map((id) => ({ id, title: getQuiz(id).title })),
    currentQuizId: resolvedId,
    profile: baseProfile,
    stats: { byCategory, streak: computeStreak(dates), last7: last7Days(dates) },
    activeSession: profile.currentSession ? presentSession(profile.currentSession) : null,
  }
})
