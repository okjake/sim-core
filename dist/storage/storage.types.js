"use strict";
/**
 * The slice of `better-sqlite3` sim-core actually uses.
 *
 * Typing against a structural interface (rather than importing the class) keeps
 * `better-sqlite3` out of the module graph for services that never enable the
 * docs engine, and lets tests substitute a driver without a native build.
 */
Object.defineProperty(exports, "__esModule", { value: true });
