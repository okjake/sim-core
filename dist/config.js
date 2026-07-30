"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIM_CORE_CONFIG = void 0;
exports.normalizeSimCoreConfig = normalizeSimCoreConfig;
const admin_auth_config_1 = require("./admin-auth/admin-auth.config");
/** DI token for the resolved {@link SimCoreConfig}. */
exports.SIM_CORE_CONFIG = 'SIM_CORE_CONFIG';
const TOKEN_MIN_LENGTH = 16;
/** Applies defaults and fails fast on an unusable config. */
function normalizeSimCoreConfig(config) {
    if (!config?.name) {
        throw new Error('SimCoreConfig.name is required');
    }
    if (!config.controlToken || config.controlToken.length < TOKEN_MIN_LENGTH) {
        throw new Error(`SimCoreConfig.controlToken is required and must be at least ${TOKEN_MIN_LENGTH} characters (set CONTROL_TOKEN)`);
    }
    if (!config.openapi?.openapi || !config.openapi.info) {
        throw new Error('SimCoreConfig.openapi must be an OpenAPI document with `openapi` and `info`');
    }
    if (config.driver) {
        const { baselineRequestsPerMinute, maxRequestsPerMinute, baseUrl } = config.driver;
        if (!baseUrl) {
            throw new Error('SimCoreConfig.driver.baseUrl is required');
        }
        if (!(maxRequestsPerMinute > 0)) {
            throw new Error('SimCoreConfig.driver.maxRequestsPerMinute must be > 0');
        }
        if (!(baselineRequestsPerMinute >= 0)) {
            throw new Error('SimCoreConfig.driver.baselineRequestsPerMinute must be >= 0');
        }
    }
    if (config.docs?.enabled) {
        const mode = config.docs.authMode ?? 'public';
        if (mode !== 'public' && mode !== 'required') {
            throw new Error("SimCoreConfig.docs.authMode must be 'public' or 'required'");
        }
        if (mode === 'required' && typeof config.docsAuthCheck !== 'function') {
            throw new Error("SimCoreConfig.docs.authMode is 'required' but no docsAuthCheck function was supplied");
        }
    }
    // Throws on an enabled-but-incomplete `adminAuth`. A gate that is half
    // configured is an admin console open to the internet, so it fails at
    // bootstrap rather than at the first sign-in attempt. Absent or disabled,
    // this validates nothing at all — that is what keeps v0.2.0 configs working.
    (0, admin_auth_config_1.resolveAdminAuthConfig)(config.adminAuth);
    return {
        ...config,
        version: config.version ?? '0.0.0',
        seed: config.seed ?? `${config.name}-chaos`,
        requestTailSize: config.requestTailSize ?? 200,
        admin: config.admin ?? true,
        brand: config.brand ?? { displayName: config.name, color: '#3b6ea5' },
    };
}
