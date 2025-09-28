/**
 * Operational Transform (OT) implementation for collaborative text editing
 * Based on the classic OT algorithm for handling concurrent operations
 */

export interface TextOperation {
	type: 'retain' | 'insert' | 'delete';
	count?: number;  // for retain and delete
	text?: string;   // for insert
}

export interface CursorOperation {
	type: 'cursor_move' | 'selection_change';
	position: number;
	length?: number; // for selection
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
export class TextOperationBuilder {
	private ops: TextOperation[] = [];

	retain(count: number): TextOperationBuilder {
		if (count > 0) {
			this.ops.push({ type: 'retain', count });
		}
		return this;
	}

	insert(text: string): TextOperationBuilder {
		if (text.length > 0) {
			this.ops.push({ type: 'insert', text });
		}
		return this;
	}

	delete(count: number): TextOperationBuilder {
		if (count > 0) {
			this.ops.push({ type: 'delete', count });
		}
		return this;
	}

	build(): TextOperation[] {
		return this.ops;
	}
}

/**
 * Apply a text operation to a string
 */
export function applyTextOperation(text: string, operations: TextOperation[]): string {
	return applyOperationToText(text, operations);
}

/**
 * Apply operation to text (alias for compatibility)
 */
export function applyOperationToText(text: string, operations: TextOperation[]): string {
	let result = '';
	let index = 0;

	for (const op of operations) {
		switch (op.type) {
			case 'retain':
				if (op.count && index + op.count <= text.length) {
					result += text.slice(index, index + op.count);
					index += op.count;
				}
				break;
			case 'insert':
				if (op.text) {
					result += op.text;
				}
				break;
			case 'delete':
				if (op.count && index + op.count <= text.length) {
					index += op.count;
				}
				break;
		}
	}

	// Add remaining text
	if (index < text.length) {
		result += text.slice(index);
	}

	return result;
}

/**
 * Transform two operations against each other
 * This is the core of operational transform
 */
export function transformTextOperations(
	op1: TextOperation[],
	op2: TextOperation[],
	priority: 'left' | 'right' = 'left'
): [TextOperation[], TextOperation[]] {
	const result1: TextOperation[] = [];
	const result2: TextOperation[] = [];

	let i1 = 0, i2 = 0;
	let offset1 = 0, offset2 = 0;

	while (i1 < op1.length || i2 < op2.length) {
		const operation1 = i1 < op1.length ? op1[i1] : null;
		const operation2 = i2 < op2.length ? op2[i2] : null;

		if (!operation1) {
			// Only op2 has operations left
			result2.push(operation2!);
			i2++;
			continue;
		}

		if (!operation2) {
			// Only op1 has operations left
			result1.push(operation1);
			i1++;
			continue;
		}

		if (operation1.type === 'retain' && operation2.type === 'retain') {
			const count1 = operation1.count || 0;
			const count2 = operation2.count || 0;

			if (count1 === count2) {
				result1.push({ type: 'retain', count: count1 });
				result2.push({ type: 'retain', count: count2 });
				i1++;
				i2++;
			} else if (count1 < count2) {
				result1.push({ type: 'retain', count: count1 });
				result2.push({ type: 'retain', count: count1 });
				op2[i2] = { type: 'retain', count: count2 - count1 };
				i1++;
			} else {
				result1.push({ type: 'retain', count: count2 });
				result2.push({ type: 'retain', count: count2 });
				op1[i1] = { type: 'retain', count: count1 - count2 };
				i2++;
			}
		} else if (operation1.type === 'insert') {
			result1.push(operation1);
			result2.push({ type: 'retain', count: operation1.text?.length || 0 });
			i1++;
		} else if (operation2.type === 'insert') {
			if (priority === 'right') {
				result1.push({ type: 'retain', count: operation2.text?.length || 0 });
				result2.push(operation2);
			} else {
				result1.push({ type: 'retain', count: operation2.text?.length || 0 });
				result2.push(operation2);
			}
			i2++;
		} else if (operation1.type === 'delete' && operation2.type === 'retain') {
			const count1 = operation1.count || 0;
			const count2 = operation2.count || 0;

			if (count1 === count2) {
				result1.push(operation1);
				i1++;
				i2++;
			} else if (count1 < count2) {
				result1.push(operation1);
				op2[i2] = { type: 'retain', count: count2 - count1 };
				i1++;
			} else {
				result1.push({ type: 'delete', count: count2 });
				op1[i1] = { type: 'delete', count: count1 - count2 };
				i2++;
			}
		} else if (operation1.type === 'retain' && operation2.type === 'delete') {
			const count1 = operation1.count || 0;
			const count2 = operation2.count || 0;

			if (count1 === count2) {
				result2.push(operation2);
				i1++;
				i2++;
			} else if (count1 < count2) {
				result2.push({ type: 'delete', count: count1 });
				op2[i2] = { type: 'delete', count: count2 - count1 };
				i1++;
			} else {
				result2.push(operation2);
				op1[i1] = { type: 'retain', count: count1 - count2 };
				i2++;
			}
		} else if (operation1.type === 'delete' && operation2.type === 'delete') {
			const count1 = operation1.count || 0;
			const count2 = operation2.count || 0;

			if (count1 === count2) {
				i1++;
				i2++;
			} else if (count1 < count2) {
				op2[i2] = { type: 'delete', count: count2 - count1 };
				i1++;
			} else {
				op1[i1] = { type: 'delete', count: count1 - count2 };
				i2++;
			}
		}
	}

	return [result1, result2];
}

/**
 * Transform cursor position based on an operation
 */
export function transformCursorPosition(
	cursor: number,
	operations: TextOperation[]
): number {
	let newCursor = cursor;
	let index = 0;

	for (const op of operations) {
		switch (op.type) {
			case 'retain':
				index += op.count || 0;
				break;
			case 'insert':
				if (index <= cursor) {
					newCursor += op.text?.length || 0;
				}
				break;
			case 'delete':
				if (index < cursor) {
					const deleteCount = op.count || 0;
					if (index + deleteCount <= cursor) {
						newCursor -= deleteCount;
					} else {
						newCursor = index;
					}
				}
				index += op.count || 0;
				break;
		}
	}

	return Math.max(0, newCursor);
}

/**
 * Compose two operations into a single operation
 */
export function composeTextOperations(
	op1: TextOperation[],
	op2: TextOperation[]
): TextOperation[] {
	const result: TextOperation[] = [];
	let i1 = 0, i2 = 0;

	while (i1 < op1.length || i2 < op2.length) {
		const operation1 = i1 < op1.length ? op1[i1] : null;
		const operation2 = i2 < op2.length ? op2[i2] : null;

		if (!operation1) {
			result.push(operation2!);
			i2++;
			continue;
		}

		if (!operation2) {
			result.push(operation1);
			i1++;
			continue;
		}

		if (operation1.type === 'retain' && operation2.type === 'retain') {
			const count1 = operation1.count || 0;
			const count2 = operation2.count || 0;

			if (count1 === count2) {
				result.push({ type: 'retain', count: count1 });
				i1++;
				i2++;
			} else if (count1 < count2) {
				result.push({ type: 'retain', count: count1 });
				op2[i2] = { type: 'retain', count: count2 - count1 };
				i1++;
			} else {
				result.push({ type: 'retain', count: count2 });
				op1[i1] = { type: 'retain', count: count1 - count2 };
				i2++;
			}
		} else if (operation1.type === 'insert') {
			result.push(operation1);
			i1++;
		} else if (operation2.type === 'insert') {
			result.push(operation2);
			i2++;
		} else if (operation1.type === 'retain' && operation2.type === 'delete') {
			const count1 = operation1.count || 0;
			const count2 = operation2.count || 0;

			if (count1 === count2) {
				result.push({ type: 'delete', count: count2 });
				i1++;
				i2++;
			} else if (count1 < count2) {
				result.push({ type: 'delete', count: count1 });
				op2[i2] = { type: 'delete', count: count2 - count1 };
				i1++;
			} else {
				result.push({ type: 'delete', count: count2 });
				op1[i1] = { type: 'retain', count: count1 - count2 };
				i2++;
			}
		} else if (operation1.type === 'delete') {
			result.push(operation1);
			i1++;
		}
	}

	return result;
}

/**
 * Create an operation from a text difference
 */
export function createOperationFromDiff(
	oldText: string,
	newText: string
): TextOperation[] {
	const builder = new TextOperationBuilder();

	// Simple diff algorithm - in production, use a more sophisticated one
	let oldIndex = 0;
	let newIndex = 0;

	while (oldIndex < oldText.length || newIndex < newText.length) {
		if (oldIndex < oldText.length && newIndex < newText.length) {
			if (oldText[oldIndex] === newText[newIndex]) {
				// Characters match, retain
				let retainCount = 0;
				while (
					oldIndex + retainCount < oldText.length &&
					newIndex + retainCount < newText.length &&
					oldText[oldIndex + retainCount] === newText[newIndex + retainCount]
				) {
					retainCount++;
				}
				builder.retain(retainCount);
				oldIndex += retainCount;
				newIndex += retainCount;
			} else {
				// Characters don't match, need to handle insertion/deletion
				let insertText = '';
				let deleteCount = 0;

				// Find the next matching character
				let nextMatch = -1;
				for (let i = newIndex; i < newText.length; i++) {
					if (oldText[oldIndex] === newText[i]) {
						nextMatch = i;
						break;
					}
				}

				if (nextMatch !== -1) {
					// Insert characters before the match
					insertText = newText.slice(newIndex, nextMatch);
					newIndex = nextMatch;
				} else {
					// Delete character from old text
					deleteCount = 1;
					oldIndex++;
				}

				if (insertText) {
					builder.insert(insertText);
				}
				if (deleteCount > 0) {
					builder.delete(deleteCount);
				}
			}
		} else if (oldIndex < oldText.length) {
			// Only old text remains, delete it
			builder.delete(oldText.length - oldIndex);
			break;
		} else {
			// Only new text remains, insert it
			builder.insert(newText.slice(newIndex));
			break;
		}
	}

	return builder.build();
}

/**
 * Validate an operation
 */
export function validateTextOperation(
	operations: TextOperation[],
	textLength: number
): boolean {
	let index = 0;

	for (const op of operations) {
		switch (op.type) {
			case 'retain':
				index += op.count || 0;
				break;
			case 'delete':
				index += op.count || 0;
				break;
			case 'insert':
				// Insert doesn't move the index in the original text
				break;
		}
	}

	return index <= textLength;
}

/**
 * Normalize an operation by merging consecutive operations of the same type
 */
export function normalizeTextOperation(operations: TextOperation[]): TextOperation[] {
	const result: TextOperation[] = [];

	for (const op of operations) {
		const lastOp = result[result.length - 1];

		if (lastOp && lastOp.type === op.type) {
			if (op.type === 'retain' || op.type === 'delete') {
				lastOp.count = (lastOp.count || 0) + (op.count || 0);
			} else if (op.type === 'insert') {
				lastOp.text = (lastOp.text || '') + (op.text || '');
			}
		} else {
			result.push({ ...op });
		}
	}

	return result;
}
