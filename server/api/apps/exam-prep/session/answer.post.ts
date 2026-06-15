// submitAnswer: questionId + userAnswer を判定し、progress を書き、カウンタを増やし、
// { isCorrect, answer, explanation, ... } を返す。answer/explanation はここで初めて開示する。
// choice は完全一致、free(記述)は AI 採点(表記ゆれ・言い換えを正解扱い)。
import { DOMAIN_CONFIG } from '~/server/utils/exam-prep/config'
import {
  getProfile,
  getQuestion,
  applyAnswerTxn,
  recordAnswer,
  presentSession,
} from '~/server/utils/exam-prep/store'
import { gradeAnswerByAI } from '~/server/utils/exam-prep/ai'

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, '').toLowerCase()
}

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const body = await readBody(event)
  const questionId = String(body?.questionId || '')
  const userAnswer = String(body?.userAnswer ?? '')

  if (!questionId) {
    throw createError({ statusCode: 400, message: 'questionId が必要です' })
  }

  const profile = await getProfile(decoded.uid)
  const session = profile?.currentSession
  if (!session || !session.queue.includes(questionId)) {
    throw createError({ statusCode: 409, message: 'このセッションに無い問題です' })
  }

  const q = await getQuestion(questionId)
  if (!q) {
    throw createError({ statusCode: 404, message: '問題が見つかりません' })
  }

  let isCorrect = false
  let aiReason: string | undefined
  if (q.type === 'free') {
    const g = await gradeAnswerByAI({
      aiSubject: DOMAIN_CONFIG.aiSubject,
      question: q.question,
      answer: q.answer,
      synonyms: q.keywords,
      userAnswer,
    })
    isCorrect = g.correct
    aiReason = g.reason
  } else {
    isCorrect = normalize(userAnswer) === normalize(q.answer)
  }

  const updated = await applyAnswerTxn(decoded.uid, { questionId, isCorrect })
  const attempts = updated?.attempts[questionId] ?? 1
  await recordAnswer(decoded.uid, {
    questionId,
    isCorrect,
    userAnswer,
    attempts,
    groupId: q.groupId,
    genre: q.genre,
  })

  const present = updated ? presentSession(updated) : null
  return {
    isCorrect,
    answer: q.answer,
    explanation: q.explanation,
    aiReason,
    attempts,
    session: present,
    done: present?.done ?? false,
    next: present?.next ?? null,
  }
})
