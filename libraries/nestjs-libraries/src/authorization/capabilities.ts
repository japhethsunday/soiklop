/**
 * Workspace role capabilities.
 *
 * The foundation ships a coarse `Role` enum (SUPERADMIN | ADMIN | USER) that is
 * stored on `UserOrganization`, and a `PermissionsService` that enforces
 * *billing quotas* rather than role-based authorization. This module adds the
 * missing capability layer without altering the persisted enum: existing roles
 * map onto the richer workspace roles below, so no migration or re-login is
 * required and stored data keeps its meaning.
 *
 * The central rule the product depends on: publishing is a distinct capability
 * from content creation and AI generation. A Contributor may draft and generate
 * all day and still be unable to put anything in front of an audience.
 */

export enum WorkspaceRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  EDITOR = 'EDITOR',
  CONTRIBUTOR = 'CONTRIBUTOR',
  VIEWER = 'VIEWER',
}

export enum Capability {
  // Reading
  VIEW_CONTENT = 'content:view',
  VIEW_ANALYTICS = 'analytics:view',
  VIEW_AUDIT_LOG = 'audit:view',

  // Authoring
  CREATE_DRAFT = 'content:create',
  EDIT_OWN_DRAFT = 'content:edit:own',
  EDIT_ANY_DRAFT = 'content:edit:any',
  DELETE_CONTENT = 'content:delete',
  GENERATE_AI_CONTENT = 'ai:generate',

  // Review pipeline
  SUBMIT_FOR_APPROVAL = 'approval:submit',
  APPROVE_CONTENT = 'approval:approve',

  // Distribution -- deliberately separate from authoring.
  SCHEDULE_POST = 'publishing:schedule',
  PUBLISH_NOW = 'publishing:publish',
  CANCEL_SCHEDULED = 'publishing:cancel',

  // Administration
  MANAGE_CHANNELS = 'channels:manage',
  MANAGE_MEDIA = 'media:manage',
  MANAGE_CAMPAIGNS = 'campaigns:manage',
  MANAGE_BRAND = 'brand:manage',
  MANAGE_MEMBERS = 'members:manage',
  MANAGE_BILLING = 'billing:manage',
  MANAGE_AUTOMATIONS = 'automations:manage',
  DELETE_WORKSPACE = 'workspace:delete',
}

const VIEWER: Capability[] = [
  Capability.VIEW_CONTENT,
  Capability.VIEW_ANALYTICS,
];

const CONTRIBUTOR: Capability[] = [
  ...VIEWER,
  Capability.CREATE_DRAFT,
  Capability.EDIT_OWN_DRAFT,
  Capability.GENERATE_AI_CONTENT,
  Capability.SUBMIT_FOR_APPROVAL,
];

const EDITOR: Capability[] = [
  ...CONTRIBUTOR,
  Capability.EDIT_ANY_DRAFT,
  Capability.MANAGE_MEDIA,
  Capability.SCHEDULE_POST,
  Capability.CANCEL_SCHEDULED,
];

const MANAGER: Capability[] = [
  ...EDITOR,
  Capability.APPROVE_CONTENT,
  Capability.PUBLISH_NOW,
  Capability.DELETE_CONTENT,
  Capability.MANAGE_CAMPAIGNS,
  Capability.MANAGE_BRAND,
  Capability.MANAGE_AUTOMATIONS,
  Capability.VIEW_AUDIT_LOG,
];

const ADMIN: Capability[] = [
  ...MANAGER,
  Capability.MANAGE_CHANNELS,
  Capability.MANAGE_MEMBERS,
];

const OWNER: Capability[] = [
  ...ADMIN,
  Capability.MANAGE_BILLING,
  Capability.DELETE_WORKSPACE,
];

const ROLE_CAPABILITIES: Readonly<Record<WorkspaceRole, ReadonlySet<Capability>>> =
  Object.freeze({
    [WorkspaceRole.VIEWER]: new Set(VIEWER),
    [WorkspaceRole.CONTRIBUTOR]: new Set(CONTRIBUTOR),
    [WorkspaceRole.EDITOR]: new Set(EDITOR),
    [WorkspaceRole.MANAGER]: new Set(MANAGER),
    [WorkspaceRole.ADMIN]: new Set(ADMIN),
    [WorkspaceRole.OWNER]: new Set(OWNER),
  });

/**
 * Capabilities that move content in front of a real audience, or that destroy
 * data. An automated actor never holds these implicitly -- see
 * `resolveCapabilities`.
 */
export const HIGH_IMPACT_CAPABILITIES: ReadonlySet<Capability> = new Set([
  Capability.PUBLISH_NOW,
  Capability.DELETE_CONTENT,
  Capability.MANAGE_CHANNELS,
  Capability.MANAGE_MEMBERS,
  Capability.MANAGE_BILLING,
  Capability.DELETE_WORKSPACE,
]);

/** The persisted `Role` enum values from the Prisma schema. */
export type StoredRole = 'SUPERADMIN' | 'ADMIN' | 'USER';

/**
 * Maps the persisted coarse role onto a workspace role. `USER` maps to EDITOR
 * rather than MANAGER so that upgrading an existing deployment never silently
 * *grants* anyone the ability to publish immediately or approve their own work;
 * an administrator promotes deliberately.
 */
export function workspaceRoleFromStoredRole(role: StoredRole): WorkspaceRole {
  switch (role) {
    case 'SUPERADMIN':
      return WorkspaceRole.OWNER;
    case 'ADMIN':
      return WorkspaceRole.ADMIN;
    case 'USER':
      return WorkspaceRole.EDITOR;
    default: {
      // An unrecognised stored value must never fall through to a permissive
      // default; the least-privileged role is the only safe answer.
      return WorkspaceRole.VIEWER;
    }
  }
}

export interface Actor {
  role: WorkspaceRole;
  /**
   * True when the request originates from an automation, an API token acting
   * unattended, or an MCP/AI agent rather than a human at a keyboard.
   */
  automated?: boolean;
  /**
   * High-impact capabilities explicitly delegated to an automated actor by a
   * human. Ignored for human actors, who already hold their role's set.
   */
  grantedHighImpact?: Capability[];
}

/**
 * Resolves the effective capability set for an actor.
 *
 * Automated actors are stripped of every high-impact capability unless a human
 * explicitly delegated it. This is what stops an AI agent from inheriting an
 * Owner's unrestricted publish rights simply because it authenticated with that
 * Owner's token.
 */
export function resolveCapabilities(actor: Actor): ReadonlySet<Capability> {
  const base = ROLE_CAPABILITIES[actor.role] ?? new Set<Capability>();

  if (!actor.automated) {
    return base;
  }

  const granted = new Set(actor.grantedHighImpact ?? []);
  const effective = new Set<Capability>();

  for (const capability of base) {
    if (!HIGH_IMPACT_CAPABILITIES.has(capability) || granted.has(capability)) {
      effective.add(capability);
    }
  }

  return effective;
}

export function can(actor: Actor, capability: Capability): boolean {
  return resolveCapabilities(actor).has(capability);
}

export function canAll(actor: Actor, capabilities: Capability[]): boolean {
  const effective = resolveCapabilities(actor);
  return capabilities.every((capability) => effective.has(capability));
}

/**
 * True when the capability needs an explicit human confirmation step before an
 * automated actor may exercise it, even once delegated. Used by the MCP surface
 * to separate safe reads from destructive writes.
 */
export function requiresExplicitConfirmation(capability: Capability): boolean {
  return HIGH_IMPACT_CAPABILITIES.has(capability);
}
