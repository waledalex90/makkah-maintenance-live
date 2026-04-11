/**
 * بادئات رسائل التوثيق التلقائية في الشات (API claim / accept).
 * تُستخدم لمنع تكرار الإدراج عند نفس البلاغ ونفس المرسل.
 */
export function taskDocMessagePrefixAcceptExecution(fullName: string): string {
  return `تكليفات: ${fullName} قبل المهمة وبدأ التنفيذ`;
}

export function taskDocMessagePrefixClaimTicket(fullName: string): string {
  return `تكليفات: ${fullName} قبل البلاغ وبدأ التنفيذ`;
}

/** رسائل النظام في الواجهة تُعرض بتنسيق مختلف (تبدأ عادة بـ «تكليفات:»). */
export function isTicketSystemDocChatMessage(content: string): boolean {
  return content.trimStart().startsWith("تكليفات:");
}
