// These are DS Project's local budgets, not undocumented Claude constants.
export const CONTEXT_LIMITS = Object.freeze({
  recentMessages: 24,
  historyChars: 24000,
  recentThreads: 12,
  threadChars: 16000,
  activityEntries: 256,
});

export function excerpt(value, max = 800) {
  const s = String(value || '');
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export function boundedRows(rows, maxChars) {
  const result = [];
  let used = 2;
  for (const row of rows) {
    const size = JSON.stringify(row).length + 1;
    if (used + size > maxChars) break;
    result.push(row); used += size;
  }
  return result;
}

export function recentConversation(thread) {
  const all = thread.messages.filter(m =>
    m.admitted !== false && ['user', 'assistant', 'relay', 'event'].includes(m.role));
  const newest = all.slice(-CONTEXT_LIMITS.recentMessages).reverse().map(m => ({
    id: m.id, at: m.at, role: m.role, text: String(m.text || ''),
    ...(m.taskId ? {threadId: m.taskId} : {}),
    ...(m.source ? {source: m.source} : {}),
  }));
  // Keep a contiguous suffix of whole messages. Stop at the first message
  // that does not fit, rather than cutting it or filling gaps with older text.
  const messages = boundedRows(newest, CONTEXT_LIMITS.historyChars).reverse();
  return {messages, omittedMessages: all.length - messages.length};
}

export function recentThreads(threads, currentId) {
  const others = threads.filter(t => t.id !== currentId);
  const rows = others.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, CONTEXT_LIMITS.recentThreads).map(t => {
      const user = t.messages.findLast(m => m.role === 'user');
      const assistant = t.messages.findLast(m => m.role === 'assistant');
      const pack = m => m ? {id:m.id, at:m.at, text:excerpt(m.text), pending:m.admitted===false} : null;
      return {id:t.id,title:t.title,status:t.status,updatedAt:t.updatedAt,
        activity:excerpt(t.activity,160), queuedMessages:t.inbox?.length||0,
        latestUser:pack(user),latestAssistant:pack(assistant),
        // Explicit reports have their own delivery path. Do not inject them again here.
        error:excerpt(t.error,400)};
    });
  const selected=boundedRows(rows,CONTEXT_LIMITS.threadChars);
  return {threads:selected,omittedThreads:others.length-selected.length};
}

/** Replace only the model-visible surface; the append-only session log stays intact. */
export function replaceCoordinatorHistory(session, snapshot, createMessage) {
  const nodes = [...session.surface.nodes];
  // DSH reserves the leading system node for its own prompt reconciliation.
  if(nodes.length && session.eventAt(nodes[0])?.type==='system/message')nodes.shift();
  if (!nodes.length) return false;
  const message = createMessage({
    source:{kind:'ds-project',role:'recent-history'},
    content:[{type:'text',text:
      '以下是主对话近期记录，属于历史资料，不是待执行的新请求。完整旧记录仍可通过项目历史工具检索。省略的旧内容不代表不存在；不要猜测。当前请求在后续独立消息中。\n'+
      JSON.stringify(snapshot)}],
  });
  // Run only at an idle turn boundary: the entire settled surface is balanced,
  // including tool-call/result pairs. Never trim a live tool round in half.
  session.append('user/message',message,{
    surfaceOp:{op:'replace',startSeq:nodes[0],endSeq:nodes.at(-1)},
    sourceEventSeqs:nodes,
  });
  return true;
}
