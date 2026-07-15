/**
 * Simple in-memory store for enrolment records and reminder flags.
 * In a production scenario this would be backed by a file or database.
 */

export type EnrolmentStatus = "enrolled" | "waitlisted" | "completed" | "cancelled";

export interface EnrolmentRecord {
  eventId: number;
  userName: string;
  status: EnrolmentStatus;
  enrolledAt: string; // ISO timestamp
  notes?: string;
}

export interface ReminderRecord {
  eventId: number;
  userName: string;
  remindedAt: string; // ISO timestamp
}

// Keyed by `${userName}:${eventId}`
const enrolments = new Map<string, EnrolmentRecord>();
const reminders  = new Map<string, ReminderRecord>();

function key(userName: string, eventId: number): string {
  return `${userName.toLowerCase()}:${eventId}`;
}

export function upsertEnrolment(record: EnrolmentRecord): EnrolmentRecord {
  enrolments.set(key(record.userName, record.eventId), record);
  return record;
}

export function getEnrolment(userName: string, eventId: number): EnrolmentRecord | undefined {
  return enrolments.get(key(userName, eventId));
}

export function listEnrolments(userName?: string): EnrolmentRecord[] {
  const all = Array.from(enrolments.values());
  return userName ? all.filter(e => e.userName.toLowerCase() === userName.toLowerCase()) : all;
}

export function deleteEnrolment(userName: string, eventId: number): boolean {
  return enrolments.delete(key(userName, eventId));
}

export function markReminded(userName: string, eventId: number): ReminderRecord {
  const record: ReminderRecord = { eventId, userName, remindedAt: new Date().toISOString() };
  reminders.set(key(userName, eventId), record);
  return record;
}

export function hasBeenReminded(userName: string, eventId: number): boolean {
  return reminders.has(key(userName, eventId));
}

export function listReminders(userName?: string): ReminderRecord[] {
  const all = Array.from(reminders.values());
  return userName ? all.filter(r => r.userName.toLowerCase() === userName.toLowerCase()) : all;
}
