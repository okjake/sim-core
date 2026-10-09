"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAdminActions = validateAdminActions;
const CONTROL_PREFIX = '/__control/';
function isControlPath(path) {
    return (typeof path === 'string' &&
        path.startsWith(CONTROL_PREFIX) &&
        path.length > CONTROL_PREFIX.length &&
        !path.includes('..') &&
        !path.includes('?') &&
        !path.includes('#'));
}
/**
 * Fail fast at bootstrap on an action the SPA could not safely call. An action
 * pointed outside `/__control/` would send the operator's credential to a route
 * that is not behind the control guard, so it is a config error, not a warning.
 */
function validateAdminActions(actions) {
    if (actions === undefined)
        return;
    if (!Array.isArray(actions)) {
        throw new Error('SimCoreConfig.adminActions must be an array');
    }
    const seen = new Set();
    for (const action of actions) {
        const label = `SimCoreConfig.adminActions[${JSON.stringify(action?.id ?? '?')}]`;
        if (!action || typeof action.id !== 'string' || !action.id.trim()) {
            throw new Error('SimCoreConfig.adminActions: every action needs a non-empty id');
        }
        if (seen.has(action.id)) {
            throw new Error(`${label}: duplicate id`);
        }
        seen.add(action.id);
        if (typeof action.title !== 'string' || !action.title.trim()) {
            throw new Error(`${label}.title is required`);
        }
        if (!isControlPath(action.path)) {
            throw new Error(`${label}.path must be a route under ${CONTROL_PREFIX}`);
        }
        if (action.choice) {
            const { name, options, currentPath } = action.choice;
            if (typeof name !== 'string' || !name.trim()) {
                throw new Error(`${label}.choice.name is required`);
            }
            if (!Array.isArray(options) || options.length === 0) {
                throw new Error(`${label}.choice.options must be a non-empty array`);
            }
            if (currentPath !== undefined && !isControlPath(currentPath)) {
                throw new Error(`${label}.choice.currentPath must be a route under ${CONTROL_PREFIX}`);
            }
        }
    }
}
