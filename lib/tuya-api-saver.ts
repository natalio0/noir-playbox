/**
 * Tuya Cloud API Saver defaults.
 *
 * These intervals only reduce passive monitoring reads. Rental controls and
 * post-action verification keep their existing immediate behavior.
 */
export const TUYA_API_SAVER_OVERVIEW_INTERVAL_MS = 15 * 60 * 1000;
export const TUYA_API_SAVER_DETAIL_INTERVAL_MS = 10 * 60 * 1000;
