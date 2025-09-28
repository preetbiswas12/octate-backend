/**
 * Operational Transform (OT) implementation for collaborative text editing
 * Based on the classic OT algorithm for handling concurrent operations
 */
export interface TextOperation {
    type: 'retain' | 'insert' | 'delete';
    count?: number;
    text?: string;
}
export interface CursorOperation {
    type: 'cursor_move' | 'selection_change';
    position: number;
    length?: number;
}
export type Operation = TextOperation | CursorOperation;
export interface OperationWithMeta {
    id: string;
    operations: Operation[];
    clientId: string;
    clientSequence: number;
    serverSequence?: number;
    timestamp: number;
}
/**
 * Text operation builder for easier construction
 */
export declare class TextOperationBuilder {
    private ops;
    retain(count: number): TextOperationBuilder;
    insert(text: string): TextOperationBuilder;
    delete(count: number): TextOperationBuilder;
    build(): TextOperation[];
}
/**
 * Apply a text operation to a string
 */
export declare function applyTextOperation(text: string, operations: TextOperation[]): string;
/**
 * Apply operation to text (alias for compatibility)
 */
export declare function applyOperationToText(text: string, operations: TextOperation[]): string;
/**
 * Transform two operations against each other
 * This is the core of operational transform
 */
export declare function transformTextOperations(op1: TextOperation[], op2: TextOperation[], priority?: 'left' | 'right'): [TextOperation[], TextOperation[]];
/**
 * Transform cursor position based on an operation
 */
export declare function transformCursorPosition(cursor: number, operations: TextOperation[]): number;
/**
 * Compose two operations into a single operation
 */
export declare function composeTextOperations(op1: TextOperation[], op2: TextOperation[]): TextOperation[];
/**
 * Create an operation from a text difference
 */
export declare function createOperationFromDiff(oldText: string, newText: string): TextOperation[];
/**
 * Validate an operation
 */
export declare function validateTextOperation(operations: TextOperation[], textLength: number): boolean;
/**
 * Normalize an operation by merging consecutive operations of the same type
 */
export declare function normalizeTextOperation(operations: TextOperation[]): TextOperation[];
//# sourceMappingURL=operational-transform.d.ts.map