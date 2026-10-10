import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import {
  resolveWorkspaceKey,
  type PeerSessionCreation,
  type PeerSessionRelation,
} from "@zcode/shared";
import { getTasksIndexDatabasePath } from "#src/paths.js";
import { runTasksDatabaseMigrations } from "#src/session/tasksDatabase/migrations.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSyncInstance = InstanceType<typeof DatabaseSync>;

/**
 * AI peer-session 创建关系的唯一持久化 owner。
 *
 * 它与 task index 共用同一数据库及迁移账本，但不把创建关系字段塞进 task meta：
 * task meta 是 UI 投影，关系账本则是后续授权与审计的事实来源。
 */
export class PeerSessionRelationRepo {
  constructor(private readonly startupDbPath?: string) {}

  private db: DatabaseSyncInstance | null = null;
  private initializePromise: Promise<void> | null = null;

  async recordCreatedSession(
    input: Omit<PeerSessionRelation, "workspaceKey" | "createdBy">,
  ): Promise<void> {
    await this.ensureReady();
    const workspaceKey = resolveWorkspaceKey(input);
    this.getDatabase()
      .prepare(
        `INSERT INTO peer_session_relations (
          workspace_key, target_session_id, creator_session_id, workspace_path,
          workspace_identity, remote_session_id, created_by, approval_policy, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ai', ?, ?)
        ON CONFLICT(workspace_key, target_session_id) DO NOTHING`,
      )
      .run(
        workspaceKey,
        input.targetSessionId,
        input.creatorSessionId,
        input.workspacePath,
        input.workspaceIdentity ?? null,
        input.remoteSessionId ?? null,
        // Legacy schema compatibility: approval_policy is no longer an active setting.
        "manual",
        input.createdAt,
      );
  }

  async findCreatedSession(input: {
    workspacePath: string;
    workspaceIdentity?: string;
    targetSessionId: string;
  }): Promise<PeerSessionRelation | null> {
    await this.ensureReady();
    const row = this.getDatabase()
      .prepare(
        `SELECT workspace_key, target_session_id, creator_session_id, workspace_path,
          workspace_identity, remote_session_id, created_at
         FROM peer_session_relations WHERE workspace_key = ? AND target_session_id = ?`,
      )
      .get(resolveWorkspaceKey(input), input.targetSessionId) as
      | {
          workspace_key: string;
          target_session_id: string;
          creator_session_id: string;
          workspace_path: string;
          workspace_identity: string | null;
          remote_session_id: string | null;
          created_at: number;
        }
      | undefined;
    if (!row) return null;
    return {
      workspaceKey: row.workspace_key,
      targetSessionId: row.target_session_id,
      creatorSessionId: row.creator_session_id,
      workspacePath: row.workspace_path,
      ...(row.workspace_identity ? { workspaceIdentity: row.workspace_identity } : {}),
      ...(row.remote_session_id ? { remoteSessionId: row.remote_session_id } : {}),
      createdBy: "ai",
      createdAt: row.created_at,
    };
  }

  /**
   * requestId 决议的唯一 first-writer-wins 入口。调用者必须在 runtime 回执成功后
   * complete；失败时 release，避免短暂 Host 故障永久吞掉用户的审批机会。
   */
  async claimPermissionResolution(input: {
    workspacePath: string;
    workspaceIdentity?: string;
    targetSessionId: string;
    requestId: string;
    resolverKind: "user" | "ai";
    resolverSessionId?: string;
    decision: string;
  }): Promise<boolean> {
    await this.ensureReady();
    const result = this.getDatabase()
      .prepare(
        `INSERT INTO permission_resolution_claims (
          workspace_key, target_session_id, request_id, resolver_kind, resolver_session_id,
          decision, claimed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_key, target_session_id, request_id) DO NOTHING`,
      )
      .run(
        resolveWorkspaceKey(input),
        input.targetSessionId,
        input.requestId,
        input.resolverKind,
        input.resolverSessionId ?? null,
        input.decision,
        Date.now(),
      );
    return result.changes === 1;
  }

  async completePermissionResolution(input: {
    workspacePath: string;
    workspaceIdentity?: string;
    targetSessionId: string;
    requestId: string;
    resolverKind: "user" | "ai";
    resolverSessionId?: string;
    decision: string;
    reason?: string;
    outcome: "resolved" | "runtime_failed" | "already_resolved";
    releaseClaim?: boolean;
  }): Promise<void> {
    await this.ensureReady();
    const db = this.getDatabase();
    const workspaceKey = resolveWorkspaceKey(input);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        `INSERT INTO permission_resolution_audit (
          workspace_key, target_session_id, request_id, resolver_kind, resolver_session_id,
          decision, reason, outcome, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        workspaceKey,
        input.targetSessionId,
        input.requestId,
        input.resolverKind,
        input.resolverSessionId ?? null,
        input.decision,
        input.reason ?? null,
        input.outcome,
        Date.now(),
      );
      if (input.releaseClaim) {
        db.prepare(
          `DELETE FROM permission_resolution_claims
           WHERE workspace_key = ? AND target_session_id = ? AND request_id = ?`,
        ).run(workspaceKey, input.targetSessionId, input.requestId);
      }
      db.exec("COMMIT");
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.initializePromise = null;
  }

  private async ensureReady(): Promise<void> {
    if (!this.initializePromise) this.initializePromise = this.initialize();
    await this.initializePromise;
  }

  private async initialize(): Promise<void> {
    const path = this.startupDbPath ?? getTasksIndexDatabasePath();
    await mkdir(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    runTasksDatabaseMigrations(this.db);
  }

  private getDatabase(): DatabaseSyncInstance {
    if (!this.db) throw new Error("Peer session relation repository is not initialized");
    return this.db;
  }
}

/**
 * 创建关系写入是短事务：不在 task adapter 保留第二个 SQLite 连接或可变状态。
 * createTask 已先持久化 session/task；这里失败时调用方不会获得成功结果，目标会话仍按
 * 关系只记录创建者与目标，权限决议由创建者身份校验。
 */
export async function persistPeerSessionCreation(
  relation: PeerSessionCreation,
  task: Pick<
    PeerSessionRelation,
    "targetSessionId" | "workspacePath" | "workspaceIdentity" | "createdAt"
  >,
): Promise<void> {
  const repo = new PeerSessionRelationRepo();
  try {
    await repo.recordCreatedSession({
      ...relation,
      targetSessionId: task.targetSessionId,
      workspacePath: task.workspacePath,
      ...(task.workspaceIdentity ? { workspaceIdentity: task.workspaceIdentity } : {}),
      createdAt: task.createdAt,
    });
  } finally {
    repo.close();
  }
}
