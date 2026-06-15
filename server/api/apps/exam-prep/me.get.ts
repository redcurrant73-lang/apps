// getMe: 割り当てられたクイズ + カテゴリ別達成率 + streak + 7日 + カウントダウン + 進行中セッション。
import {
  getQuiz,
  daysUntil,
  categoryGoal,
  computeStreak,
  last7Days,
  listQuizzes,
} from '~/server/utils/exam-prep/config'
import {
  ensureProfile,
  readCorrectProgress,
  readRecentProgress,
  presentSession,
} from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const profile = await ensureProfile(decoded)
  const quiz = getQuiz(profile.quizId)
  const isSuper = (await getUserRole(decoded.uid)) === 'superuser'

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
    quiz: {
      id: quiz.id,
      title: quiz.title,
      occupation: quiz.occupation,
      icon: quiz.icon,
      examDate: quiz.examDate ?? null,
      daysLeft: quiz.examDate ? daysUntil(quiz.examDate) : null,
    },
    profile: {
      quizId: quiz.id,
      level: profile.level,
      totalCorrect: profile.totalCorrect,
      totalAnswers: profile.totalAnswers,
      visibleToPeers: profile.visibleToPeers,
      displayName: profile.displayName,
    },
    stats: { byCategory, streak: computeStreak(dates), last7: last7Days(dates) },
    activeSession: profile.currentSession ? presentSession(profile.currentSession) : null,
    // superuser は課題(クイズ)を切り替えて各UIを確認できる
    switcher: isSuper ? { quizzes: listQuizzes(), currentQuizId: quiz.id } : null,
  }
})
