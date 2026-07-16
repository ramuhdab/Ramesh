import { EventEmitter } from "events";

/**
 * Internal domain-event bus (per 02-Architecture.md, Section 5: "Notifications").
 * Modules publish domain events here instead of calling the Notification/Audit
 * modules directly. This is the one and only cross-module side-effect channel.
 *
 * Example events: "employee.created", "organization.activated",
 * "procurement.escalated", "user.role_assigned".
 */
export type DomainEvent = {
  type: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
  /**
   * Role name(s) (Role.name, org-scoped) that should be notified about this
   * event in addition to the actor - e.g. the approver role holding the
   * current pending approval level. Distinct from `payload` because it's
   * routing metadata for the Notifications module, not domain data destined
   * for an email template. Optional/additive: events that omit it keep the
   * previous actor-only notification behavior.
   */
  notifyRoles?: string[];
  /**
   * Alternative to notifyRoles for cases where "who acts next" isn't a fixed
   * role name but rather "whoever currently holds permission X" (e.g.
   * PERMISSIONS.EMPLOYEE_APPROVE, which an org assigns to whichever role(s)
   * it wants via the Roles admin screen - there's no single hardcoded
   * "manager" role name to target). Value is one "module:action" permission
   * string as defined in utils/permissions.ts.
   */
  notifyPermission?: string;
};

class DomainEventBus extends EventEmitter {
  publish(event: DomainEvent) {
    this.emit(event.type, event);
    this.emit("*", event); // wildcard listeners (e.g. audit) can subscribe to everything
  }
}

export const eventBus = new DomainEventBus();
eventBus.setMaxListeners(50);
