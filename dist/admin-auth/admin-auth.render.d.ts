export interface AdminAuthPageModel {
    /** Brand display name. Static config, so constant across renders. */
    serviceTitle: string;
    /** Brand colour. */
    accent: string;
    /** Workspace domain allowed to sign in — already public in the `hd` param. */
    allowedDomain: string;
}
/** 403 body. Identical for every failure reason, on purpose. */
export declare function renderAccessDeniedPage(model: AdminAuthPageModel): string;
/** Shown after `GET /admin/auth/logout`, once the cookie has been cleared. */
export declare function renderSignedOutPage(model: AdminAuthPageModel): string;
