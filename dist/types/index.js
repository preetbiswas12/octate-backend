"use strict";
/**
 * TypeScript type definitions for the collaboration backend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRoomId = isRoomId;
exports.isParticipantId = isParticipantId;
exports.isDocumentId = isDocumentId;
exports.isOperationId = isOperationId;
exports.isUserId = isUserId;
// Type guards
function isRoomId(value) {
    return typeof value === 'string' && value.length > 0;
}
function isParticipantId(value) {
    return typeof value === 'string' && value.length > 0;
}
function isDocumentId(value) {
    return typeof value === 'string' && value.length > 0;
}
function isOperationId(value) {
    return typeof value === 'string' && value.length > 0;
}
function isUserId(value) {
    return typeof value === 'string' && value.length > 0;
}
//# sourceMappingURL=index.js.map