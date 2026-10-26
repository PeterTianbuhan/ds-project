// Coordination is a capability boundary, not just a suggestion in the prompt.
export const coordinatorTools = Object.freeze([
  'ask_user_question',
  'project_launch_task', 'project_list_threads', 'project_send_to_thread', 'project_update_thread',
  'project_read_context', 'project_read_activity', 'project_search_history',
  'project_remember', 'project_forget', 'project_memory_file',
]);
const allowed = new Set(coordinatorTools);

export function coordinatorToolDenial(name) {
  if (!allowed.has(name)) return '主会话负责交流和调度。请用 project_launch_task 将调查或执行交给子线程，或用 project_send_to_thread 续接已有线程，然后简短回应用户。';
}

// DSH leaves agent-local tools (including subagent) outside tools.restrict().
// Filter the assembled catalog and guard execution using the same allowlist.
export function registerCoordinatorPolicy(ctx, threadForSession) {
  const isMain = agent => threadForSession(agent?.id)?.kind === 'main';
  ctx.effect(() => ctx.tools.guard(exec => isMain(exec.agent) ? coordinatorToolDenial(exec.name) : undefined),
    'ds-project: coordinator execution boundary');
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next();
    if (!isMain(context.agent)) return assembly;
    return {...assembly, tools: assembly.tools.filter(tool => allowed.has(tool.name))};
  });
}
