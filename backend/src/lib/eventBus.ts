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
};

class DomainEventBus extends EventEmitter {
  publish(event: DomainEvent) {
    this.emit(event.type, event);
    this.emit("*", event); // wildcard listeners (e.g. audit) can subscribe to everything
  }
}

export const eventBus = new DomainEventBus();
eventBus.setMaxListeners(50);
