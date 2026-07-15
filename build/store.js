/**
 * Simple in-memory store for enrolment records and reminder flags.
 * In a production scenario this would be backed by a file or database.
 */
// Keyed by `${userName}:${eventId}`
const enrolments = new Map();
const reminders = new Map();
function key(userName, eventId) {
    return `${userName.toLowerCase()}:${eventId}`;
}
export function upsertEnrolment(record) {
    enrolments.set(key(record.userName, record.eventId), record);
    return record;
}
export function getEnrolment(userName, eventId) {
    return enrolments.get(key(userName, eventId));
}
export function listEnrolments(userName) {
    const all = Array.from(enrolments.values());
    return userName ? all.filter(e => e.userName.toLowerCase() === userName.toLowerCase()) : all;
}
export function deleteEnrolment(userName, eventId) {
    return enrolments.delete(key(userName, eventId));
}
export function markReminded(userName, eventId) {
    const record = { eventId, userName, remindedAt: new Date().toISOString() };
    reminders.set(key(userName, eventId), record);
    return record;
}
export function hasBeenReminded(userName, eventId) {
    return reminders.has(key(userName, eventId));
}
export function listReminders(userName) {
    const all = Array.from(reminders.values());
    return userName ? all.filter(r => r.userName.toLowerCase() === userName.toLowerCase()) : all;
}
