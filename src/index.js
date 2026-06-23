'use strict';

/**
 * 创建遥测实例（占位，阶段二填充真实接口）。
 * @param {object} config
 * @returns {{ reporter: object, diagnostics: object, shutdown: function }}
 */
function createTelemetry(config = {}) {
  return {
    reporter: {},
    diagnostics: {},
    shutdown: async () => {},
  };
}

module.exports = { createTelemetry };
