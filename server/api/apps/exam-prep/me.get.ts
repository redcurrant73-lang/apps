// getMe: プロフィール + 進捗集計 + streak + 試験カウントダウン + 進行中セッションをまとめて返す。
import {
  DOMAIN_CONFIG,
  daysUntil,
  defaultExamTarget,
  computeStreak,
  groupTitleById,
} from '~/server/utils/exam-prep/config'
import {
  ensureProfile,
  updateProfileFields,
  readCorrectProgress,
  readRecentProgress,
  presentSession,
} from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const profile = await ensureProfile(decoded)

  // 受験パターンが1種類なら自動セット(オンボーディングSTEP2を省く)
  let examTarget = profile.examTarget
  const def = defaultExamTarget()
  if (!examTarget && def) {
    examTarget = def.id
    await updateProfileFields(decoded.uid, { examTarget })
  }

  const needSegment = !profile.segment
  const needExamTarget = !examTarget && DOMAIN_CONFIG.examTargetOptions.length > 1
  const onboardingNeeded = needSegment || needExamTarget

  let byGroup: { groupId: string; title: string; correct: number }[] = []
  let streak = 0
  if (!onboardingNeeded) {
    const correct = await readCorrectProgress(decoded.uid)
    const perGroup = new Map<string, Set<string>>()
    for (const p of correct) {
      if (!perGroup.has(p.groupId)) perGroup.set(p.groupId, new Set())
      perGroup.get(p.groupId)!.add(p.questionId)
    }
    byGroup = [...perGroup.entries()].map(([groupId, set]) => ({
      groupId,
      title: groupTitleById(groupId),
      correct: set.size,
    }))
    const recent = await readRecentProgress(decoded.uid, Date.now() - 60 * 24 * 3600 * 1000)
    streak = computeStreak(recent.map((r) => r.answeredAt).filter((d): d is Date => !!d))
  }

  return {
    domain: {
      appTitle: DOMAIN_CONFIG.appTitle,
      appSubtitle: DOMAIN_CONFIG.appSubtitle,
      examLabel: DOMAIN_CONFIG.examLabel,
      examDate: DOMAIN_CONFIG.examDate,
      daysLeft: daysUntil(DOMAIN_CONFIG.examDate),
      segments: DOMAIN_CONFIG.segments,
      examTargetOptions: DOMAIN_CONFIG.examTargetOptions,
    },
    profile: {
      segment: profile.segment,
      examTarget,
      level: profile.level,
      totalCorrect: profile.totalCorrect,
      totalAnswers: profile.totalAnswers,
      visibleToPeers: profile.visibleToPeers,
      displayName: profile.displayName,
    },
    onboardingNeeded,
    needSegment,
    needExamTarget,
    stats: { byGroup, streak },
    activeSession: profile.currentSession ? presentSession(profile.currentSession) : null,
  }
})
