// Game event bus. The simulation emits; UI, audio, crowd and effects subscribe.
// Event names follow the v2.6 spec so a future server can send the same events.
export const EVENTS = [
  'MATCH_STARTED', 'DISC_THROWN', 'DISC_CAUGHT', 'DISC_BOUNCED', 'WALL_KICK_USED', 'GOAL_SCORED', 'GOAL_SAVED',
  'GRAVITY_SHIFT_WARNING', 'GRAVITY_SHIFT_COUNT', 'GRAVITY_SHIFT_STARTED', 'GRAVITY_SHIFT_COMPLETED', 'PLAYER_WARPED', 'MATCH_FINISHED',
];
export class EventBus {
  constructor() { this.subs = new Map(); this.log = []; this.keepLog = false; }
  on(type, fn) { if (!this.subs.has(type)) this.subs.set(type, []); this.subs.get(type).push(fn); return () => this.off(type, fn); }
  off(type, fn) { const l = this.subs.get(type); if (l) this.subs.set(type, l.filter(f => f !== fn)); }
  emit(type, payload = {}) {
    if (this.keepLog) this.log.push({ type, ...payload });
    for (const fn of this.subs.get(type) || []) { try { fn(payload, type); } catch (e) { console.error('event handler', type, e); } }
    for (const fn of this.subs.get('*') || []) { try { fn(payload, type); } catch (e) { console.error(e); } }
  }
}
