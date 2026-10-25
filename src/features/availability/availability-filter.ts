export type AvailabilityAnswerKind = 'yes' | 'no' | 'none'
export type AvailabilityFilterValue = 'all' | AvailabilityAnswerKind

/** "Posso" = true, "Não posso" = false, sem resposta = undefined/null. */
export function answerKind(answer: boolean | null | undefined): AvailabilityAnswerKind {
  return answer === true ? 'yes' : answer === false ? 'no' : 'none'
}

export function matchesAvailabilityFilter(
  filter: AvailabilityFilterValue,
  kind: AvailabilityAnswerKind,
) {
  return filter === 'all' || filter === kind
}
