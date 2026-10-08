const { withEntitlementsPlist } = require("expo/config-plugins");

// Private Cloud Compute is a managed entitlement that Apple grants per team,
// so it is requested unconditionally for iOS. A build signed without it fails
// while signing rather than silently falling back at runtime.
const PRIVATE_CLOUD_COMPUTE_ENTITLEMENT =
  "com.apple.developer.private-cloud-compute";

/**
 * Adds `com.apple.developer.private-cloud-compute` to the generated iOS
 * entitlements so `PrivateCloudComputeLanguageModel` is usable from the
 * Foundation Models bridge.
 *
 * The entitlement only works for App IDs Apple has provisioned; without that
 * grant, code signing fails instead of the app shipping a broken capability.
 *
 * @type {import("expo/config-plugins").ConfigPlugin}
 */
function withPrivateCloudComputeEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    config.modResults[PRIVATE_CLOUD_COMPUTE_ENTITLEMENT] = true;
    return config;
  });
}

module.exports = withPrivateCloudComputeEntitlement;
module.exports.PRIVATE_CLOUD_COMPUTE_ENTITLEMENT =
  PRIVATE_CLOUD_COMPUTE_ENTITLEMENT;
