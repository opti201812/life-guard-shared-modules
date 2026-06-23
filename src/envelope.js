'use strict';

const VALID_KINDS = ['summary', 'diagnostics'];

function buildEnvelope({ kind, base = {}, data = {}, ref, timestamp }) {
  if (!VALID_KINDS.includes(kind)) {
    throw new Error(`envelope.kind 必须是 ${VALID_KINDS.join('/')}，收到: ${kind}`);
  }
  return {
    kind,
    appId: base.appId,
    instanceId: base.instanceId,
    version: base.version,
    env: base.env,
    timestamp: timestamp || new Date().toISOString(),
    ref,
    data,
  };
}

module.exports = { buildEnvelope, VALID_KINDS };
