export function buildQuestionPack(record) {
  const questions = record.questions || [];
  if (!questions.length) return 'No open questions.\nلا توجد أسئلة مفتوحة.';
  const lines = [
    `*${record.item_id}* ${record.original_title_en || ''}`,
    `*${record.item_id}* ${record.original_title_ar || ''}`,
    '',
  ];
  questions.forEach((q, i) => lines.push(`${i + 1}. ${q.question_en}`, q.question_ar, ''));
  lines.push('Thank you. Please reply with the item number.', 'شكرا لك. يرجى الرد مع رقم القطعة.');
  return lines.join('\n').replace(/\u2014/g, '-');
}
