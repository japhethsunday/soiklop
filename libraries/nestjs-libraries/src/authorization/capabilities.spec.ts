import {
  Actor,
  can,
  canAll,
  Capability,
  HIGH_IMPACT_CAPABILITIES,
  requiresExplicitConfirmation,
  resolveCapabilities,
  workspaceRoleFromStoredRole,
  WorkspaceRole,
} from '@gitroom/nestjs-libraries/authorization/capabilities';

const human = (role: WorkspaceRole): Actor => ({ role });
const agent = (role: WorkspaceRole, granted?: Capability[]): Actor => ({
  role,
  automated: true,
  grantedHighImpact: granted,
});

describe('workspace capabilities', () => {
  describe('publishing is separate from authoring', () => {
    it('lets a contributor draft and generate but not schedule or publish', () => {
      const actor = human(WorkspaceRole.CONTRIBUTOR);

      expect(can(actor, Capability.CREATE_DRAFT)).toBe(true);
      expect(can(actor, Capability.GENERATE_AI_CONTENT)).toBe(true);
      expect(can(actor, Capability.SCHEDULE_POST)).toBe(false);
      expect(can(actor, Capability.PUBLISH_NOW)).toBe(false);
    });

    it('lets an editor schedule but not publish immediately or approve', () => {
      const actor = human(WorkspaceRole.EDITOR);

      expect(can(actor, Capability.SCHEDULE_POST)).toBe(true);
      expect(can(actor, Capability.PUBLISH_NOW)).toBe(false);
      expect(can(actor, Capability.APPROVE_CONTENT)).toBe(false);
    });

    it('lets a manager approve and publish', () => {
      const actor = human(WorkspaceRole.MANAGER);

      expect(canAll(actor, [Capability.APPROVE_CONTENT, Capability.PUBLISH_NOW])).toBe(
        true
      );
    });

    it('does not let a manager manage members or billing', () => {
      const actor = human(WorkspaceRole.MANAGER);

      expect(can(actor, Capability.MANAGE_MEMBERS)).toBe(false);
      expect(can(actor, Capability.MANAGE_BILLING)).toBe(false);
    });
  });

  describe('viewers', () => {
    it('can read content and analytics only', () => {
      const actor = human(WorkspaceRole.VIEWER);

      expect(can(actor, Capability.VIEW_CONTENT)).toBe(true);
      expect(can(actor, Capability.VIEW_ANALYTICS)).toBe(true);
      expect(can(actor, Capability.CREATE_DRAFT)).toBe(false);
      expect(can(actor, Capability.GENERATE_AI_CONTENT)).toBe(false);
    });
  });

  describe('role hierarchy', () => {
    it('gives each role at least the capabilities of the one below it', () => {
      const ascending = [
        WorkspaceRole.VIEWER,
        WorkspaceRole.CONTRIBUTOR,
        WorkspaceRole.EDITOR,
        WorkspaceRole.MANAGER,
        WorkspaceRole.ADMIN,
        WorkspaceRole.OWNER,
      ];

      for (let i = 1; i < ascending.length; i++) {
        const lower = resolveCapabilities(human(ascending[i - 1]));
        const higher = resolveCapabilities(human(ascending[i]));

        for (const capability of lower) {
          expect(higher.has(capability)).toBe(true);
        }
        expect(higher.size).toBeGreaterThan(lower.size);
      }
    });

    it('reserves workspace deletion and billing for the owner', () => {
      expect(can(human(WorkspaceRole.OWNER), Capability.DELETE_WORKSPACE)).toBe(true);
      expect(can(human(WorkspaceRole.ADMIN), Capability.DELETE_WORKSPACE)).toBe(false);
      expect(can(human(WorkspaceRole.ADMIN), Capability.MANAGE_BILLING)).toBe(false);
    });
  });

  describe('automated actors', () => {
    it('strips immediate publishing from an agent acting as owner', () => {
      expect(can(agent(WorkspaceRole.OWNER), Capability.PUBLISH_NOW)).toBe(false);
    });

    it('strips every high-impact capability by default', () => {
      const effective = resolveCapabilities(agent(WorkspaceRole.OWNER));

      for (const capability of HIGH_IMPACT_CAPABILITIES) {
        expect(effective.has(capability)).toBe(false);
      }
    });

    it('still allows drafting, generating and scheduling', () => {
      const actor = agent(WorkspaceRole.OWNER);

      expect(
        canAll(actor, [
          Capability.CREATE_DRAFT,
          Capability.GENERATE_AI_CONTENT,
          Capability.SCHEDULE_POST,
        ])
      ).toBe(true);
    });

    it('honours an explicitly delegated high-impact capability', () => {
      const actor = agent(WorkspaceRole.OWNER, [Capability.PUBLISH_NOW]);

      expect(can(actor, Capability.PUBLISH_NOW)).toBe(true);
      // Delegation is per-capability and must not leak to the others.
      expect(can(actor, Capability.DELETE_WORKSPACE)).toBe(false);
    });

    it('cannot be delegated a capability its role never had', () => {
      const actor = agent(WorkspaceRole.CONTRIBUTOR, [Capability.PUBLISH_NOW]);

      expect(can(actor, Capability.PUBLISH_NOW)).toBe(false);
    });
  });

  describe('stored role mapping', () => {
    it('maps the persisted enum without granting new privileges', () => {
      expect(workspaceRoleFromStoredRole('SUPERADMIN')).toBe(WorkspaceRole.OWNER);
      expect(workspaceRoleFromStoredRole('ADMIN')).toBe(WorkspaceRole.ADMIN);
      // USER must not become a MANAGER: that would hand existing members the
      // ability to approve and publish simply by deploying this change.
      expect(workspaceRoleFromStoredRole('USER')).toBe(WorkspaceRole.EDITOR);
      expect(can(human(workspaceRoleFromStoredRole('USER')), Capability.PUBLISH_NOW)).toBe(
        false
      );
    });

    it('falls back to the least-privileged role for an unrecognised value', () => {
      expect(workspaceRoleFromStoredRole('WHATEVER' as any)).toBe(
        WorkspaceRole.VIEWER
      );
    });
  });

  describe('confirmation gating', () => {
    it('flags destructive and audience-facing actions', () => {
      expect(requiresExplicitConfirmation(Capability.PUBLISH_NOW)).toBe(true);
      expect(requiresExplicitConfirmation(Capability.DELETE_CONTENT)).toBe(true);
      expect(requiresExplicitConfirmation(Capability.MANAGE_CHANNELS)).toBe(true);
    });

    it('does not flag reads or drafting', () => {
      expect(requiresExplicitConfirmation(Capability.VIEW_ANALYTICS)).toBe(false);
      expect(requiresExplicitConfirmation(Capability.CREATE_DRAFT)).toBe(false);
    });
  });

  describe('unknown roles', () => {
    it('grants nothing for a role outside the enum', () => {
      expect(resolveCapabilities({ role: 'GOD' as WorkspaceRole }).size).toBe(0);
    });
  });
});
