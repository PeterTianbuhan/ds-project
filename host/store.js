import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {syncMemory} from './settings.js';
import { CONTEXT_LIMITS, excerpt } from './context.js';

export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export function text(value, label = '内容', max = 20000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}不能为空，且不能超过 ${max} 字符`);
  return value.trim();
}
export class Store {
  constructor(home) {
    this.home = home;
    mkdirSync(home, { recursive: true, mode: 0o700 });
    this.path = join(home, 'state.json');
    try { this.data = JSON.parse(readFileSync(this.path, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.data = { version: 1, revision: 0, projects: [], threads: [], requests: {} }; }
    if (this.data.version !== 1) throw new Error('Unsupported DS Project data version');
    for (const t of this.data.threads) if (['running', 'queued', 'approval'].includes(t.status)) {
      t.status = 'interrupted'; t.activity = 'DSH 已重启；可继续此任务'; t.pending = null;t.interruptedInbox=t.inbox||[];t.inbox=[];
    }
    for(const p of this.data.projects)delete p.configuring;
    for(const t of this.data.threads)delete t.configuring;
    this.save();
  }
  save() {
    this.data.revision++;
    writeFileSync(this.path + '.tmp', JSON.stringify(this.data), { mode: 0o600 });
    renameSync(this.path + '.tmp', this.path);
  }
  project(id) { const p = this.data.projects.find(p => p.id === id); if (!p) throw new Error('项目不存在'); return p; }
  thread(id, projectId) { const t = this.data.threads.find(t => t.id === id && (!projectId || t.projectId === projectId)); if (!t) throw new Error('任务不存在或不属于此项目'); return t; }
  bySession(id) { return this.data.threads.find(t => t.sessionId === id); }
  addProject(name, description = '') {
    const p = { id: uid(), name: text(name, '项目名称', 100), description, instructions: '', memories: [], files: [], reports: [], createdAt: now(), archived: false };
    this.data.projects.push(p); this.save(); return p;
  }
  addThread(projectId, title, kind, brief = '') {
    this.project(projectId);
    const t = { id: uid(), projectId, title: text(title, '任务名称', 120), kind, brief, status: 'ready', messages: [], sessionId: null, createdAt: now(), updatedAt: now(), activity: '', pending: null };
    this.data.threads.push(t); this.save(); return t;
  }
  message(t, role, body, extra = {}) {
    const m = { id: uid(), role, text: body, at: now(), ...extra };
    t.messages.push(m); t.updatedAt = now();
    this.activity(t, role, body, {messageId:m.id}, false);
    this.save(); return m;
  }
  activity(t, kind, body = '', extra = {}, save = true) {
    const p=this.project(t.projectId);
    p.activitySeq=(p.activitySeq||0)+1;
    (p.activities ||= []).push({cursor:p.activitySeq,threadId:t.id,title:t.title,
      at:now(),kind,text:excerpt(body,1200),status:t.status,...extra});
    p.activities=p.activities.slice(-CONTEXT_LIMITS.activityEntries);
    if(save)this.save();
  }
  memory(projectId, body, source, confirmed = false) {
    const p = this.project(projectId);
    body = text(body, '记忆', 16000);
    const existing = p.memories.find(m => m.text === body && m.status !== 'removed');
    if (existing) return existing;
    if (p.memories.filter(m => m.status !== 'removed').length >= 100) throw new Error('记忆已达 100 条，请整理后再添加');
    if(confirmed&&p.memories.filter(m=>m.status==='confirmed').reduce((n,m)=>n+m.text.length+2,body.length)>16000)throw new Error('主记忆已满，请整理 MEMORY.md 或写入主题记忆文件');
    const m = { id: uid(), text: body, source, status: confirmed ? 'confirmed' : 'proposed', createdAt: now(), revision: 1 };
    p.memories.push(m); if(confirmed)syncMemory(p); this.save(); return m;
  }
  decideMemory(projectId, id, status, expectedRevision) {
    const m = this.project(projectId).memories.find(m => m.id === id);
    if (!m || !['confirmed','removed'].includes(status)) throw new Error('记忆或操作无效');
    if (m.revision !== expectedRevision) throw new Error('这条记忆已更新，请刷新后重试');
    m.status = status; m.revision++; m.reviewedAt = now(); syncMemory(this.project(projectId)); this.save(); return m;
  }
  snapshot() {
    return { ...this.data, requests: undefined, threads: this.data.threads.map(t => ({ ...t, pending: undefined, messages: t.messages.slice(-250) })) };
  }
}
